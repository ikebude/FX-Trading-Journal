/**
 * Imports IPC handler — Milestone 7 + 8.
 *
 * Two-phase import:
 *  Phase 1: parse-file → returns preview (no DB writes) + reconcile candidates
 *  Phase 2: commit     → writes trades + legs, handles merges, records import_run
 *
 * Deduplication: existing trades matched by externalPositionId or externalTicket.
 * Soft-deleted trades are excluded from dedup (partial unique index in schema).
 *
 * Reconciliation: manual trades with matching symbol/direction/time/volume are
 * surfaced as merge candidates. Merge preserves qualitative fields, overwrites
 * broker data.
 */

import { ipcMain } from 'electron';
import log from 'electron-log/main.js';
import { readFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { nanoid } from 'nanoid';
import { eq, and, isNull, sql, desc } from 'drizzle-orm';

import { detectAndParse } from '../../src/lib/importers/detect';
import { decodeImportBuffer } from '../../src/lib/importers/encoding';
import { getDb, withAsyncTransaction } from '../../src/lib/db/client';
import { trades, tradeLegs, importRuns } from '../../src/lib/db/schema';
import { detectSession } from '../../src/lib/tz';
import { computeTradeMetrics } from '../../src/lib/pnl';
import { getInstrument, listAccounts, writeAudit } from '../../src/lib/db/queries';
import { invalidateDashboardCache, clearTradeMetricsCache } from './dashboard';
import {
  scoreCandidate,
  extractQualitative,
  type ReconcileCandidate,
  type ReconcileChoice,
  type ReconcileManualTrade,
} from '../../src/lib/reconcile';
import type { IpcContext } from './index';
import type { ParsedTrade } from '../../src/lib/importers/mt5-html';

// ─────────────────────────────────────────────────────────────
// Pending parse store
// ─────────────────────────────────────────────────────────────

interface PendingParse {
  format: string;
  filename: string;
  filePath: string;
  storedPath: string;
  accountId: string;
  trades: ParsedTrade[];
  failed: Array<{ rowIndex: number; reason: string; rawRow: string[] }>;
  rowsTotal: number;
  expiresAt: number;
}

const pendingParses = new Map<string, PendingParse>();

// Clean up expired pending parses every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of pendingParses) {
    if (entry.expiresAt < now) pendingParses.delete(id);
  }
}, 5 * 60 * 1000);

// ─────────────────────────────────────────────────────────────
// Reconcile candidate finder
// ─────────────────────────────────────────────────────────────

/**
 * Find manual trades that may be the same position as `parsedTrade`.
 * Criteria from PROJECT_BRIEF §6.9:
 *  - Same account, symbol, direction
 *  - No externalPositionId / externalTicket (unmatched manual)
 *  - Open time within 5 minutes
 *  - Entry volume within 0.05 lots
 */
async function findReconcileCandidates(
  parsedTrade: ParsedTrade,
  accountId: string,
): Promise<ReconcileCandidate[]> {
  try {
    const db = getDb();
    const firstEntry = parsedTrade.legs.find((l) => l.legType === 'ENTRY');
    if (!firstEntry) return [];

    const entryVolume = parsedTrade.legs
      .filter((l) => l.legType === 'ENTRY')
      .reduce((sum, l) => sum + l.volumeLots, 0);

    const rows = await db
      .select()
      .from(trades)
      .where(
        and(
          eq(trades.accountId, accountId),
          eq(trades.symbol, parsedTrade.symbol.toUpperCase()),
          eq(trades.direction, parsedTrade.direction),
          isNull(trades.deletedAtUtc),
          isNull(trades.externalPositionId),
          isNull(trades.externalTicket),
          // within 5 minutes of open time
          sql`ABS(julianday(${trades.openedAtUtc}) - julianday(${firstEntry.timestampUtc})) * 1440 < 5`,
          // within 0.05 lots of entry volume
          sql`ABS(COALESCE(${trades.totalEntryVolume}, 0) - ${entryVolume}) < 0.05`,
        ),
      )
      .limit(3); // surface at most 3 candidates

    return rows.map((row) => {
      const manual: ReconcileManualTrade = {
        id: row.id,
        symbol: row.symbol,
        direction: row.direction as 'LONG' | 'SHORT',
        openedAtUtc: row.openedAtUtc,
        totalEntryVolume: row.totalEntryVolume,
        setupName: row.setupName,
        marketCondition: row.marketCondition,
        entryModel: row.entryModel,
        confidence: row.confidence,
        preTradeEmotion: row.preTradeEmotion,
        postTradeEmotion: row.postTradeEmotion,
        initialStopPrice: row.initialStopPrice,
        initialTargetPrice: row.initialTargetPrice,
        plannedRr: row.plannedRr,
        plannedRiskAmount: row.plannedRiskAmount,
        plannedRiskPct: row.plannedRiskPct,
      };
      return {
        importedPositionId: parsedTrade.externalPositionId,
        manualTrade: manual,
        score: scoreCandidate(
          {
            externalPositionId: parsedTrade.externalPositionId,
            symbol: parsedTrade.symbol,
            direction: parsedTrade.direction,
            openedAtUtc: firstEntry.timestampUtc,
            entryVolume,
          },
          manual,
        ),
      };
    });
  } catch (err) {
    log.warn('reconcile: findCandidates failed', err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// Merge executor
// ─────────────────────────────────────────────────────────────

async function executeMerge(
  choice: ReconcileChoice,
  parsedTrade: ParsedTrade,
  accountId: string,
  source: 'MT4_HTML' | 'MT5_HTML' | 'CSV',
): Promise<void> {
  await withAsyncTransaction(async () => {
  const db = getDb();
  const now = new Date().toISOString();

  // Fetch manual trade to preserve qualitative fields
  const [manualRow] = await db
    .select()
    .from(trades)
    .where(eq(trades.id, choice.manualTradeId))
    .limit(1);

  if (!manualRow) throw new Error(`Manual trade ${choice.manualTradeId} not found`);

  // H-6: refuse to merge if the imported trade has no entry legs — would leave
  // the manual trade with zero fills and all metrics null.
  const entryLegs = parsedTrade.legs.filter((l) => l.legType === 'ENTRY');
  if (entryLegs.length === 0) {
    throw new Error(
      `Cannot merge ${parsedTrade.symbol} — imported trade has no entry fills`,
    );
  }

  const qualitative = extractQualitative({
    id: manualRow.id,
    symbol: manualRow.symbol,
    direction: manualRow.direction as 'LONG' | 'SHORT',
    openedAtUtc: manualRow.openedAtUtc,
    totalEntryVolume: manualRow.totalEntryVolume,
    setupName: manualRow.setupName,
    marketCondition: manualRow.marketCondition,
    entryModel: manualRow.entryModel,
    confidence: manualRow.confidence,
    preTradeEmotion: manualRow.preTradeEmotion,
    postTradeEmotion: manualRow.postTradeEmotion,
    initialStopPrice: manualRow.initialStopPrice,
    initialTargetPrice: manualRow.initialTargetPrice,
    plannedRr: manualRow.plannedRr,
    plannedRiskAmount: manualRow.plannedRiskAmount,
    plannedRiskPct: manualRow.plannedRiskPct,
  });

  // Delete existing legs from manual trade
  await db.delete(tradeLegs).where(eq(tradeLegs.tradeId, choice.manualTradeId));

  // Insert imported legs under the manual trade's id
  for (const leg of parsedTrade.legs) {
    await db.insert(tradeLegs).values({
      id: nanoid(),
      tradeId: choice.manualTradeId,
      legType: leg.legType,
      timestampUtc: leg.timestampUtc,
      price: leg.price,
      volumeLots: leg.volumeLots,
      commission: leg.commission,
      swap: leg.swap,
      brokerProfit: leg.brokerProfit,
      externalDealId: leg.externalDealId,
      notes: null,
      createdAtUtc: now,
    });
  }

  // Determine session
  const firstEntry = parsedTrade.legs.find((l) => l.legType === 'ENTRY');
  const session = firstEntry ? detectSession(new Date(firstEntry.timestampUtc)) : undefined;

  // Update trade row: broker data overwritten, qualitative fields preserved.
  // Cast enum fields explicitly to satisfy Drizzle's strict column types.
  type MarketCond = typeof trades.$inferInsert['marketCondition'];
  type EntryModel = typeof trades.$inferInsert['entryModel'];
  type PreEmotion = typeof trades.$inferInsert['preTradeEmotion'];
  type PostEmotion = typeof trades.$inferInsert['postTradeEmotion'];
  await db
    .update(trades)
    .set({
      source,
      externalPositionId: parsedTrade.externalPositionId,
      externalTicket: null,
      session: session ?? manualRow.session,
      openedAtUtc: firstEntry?.timestampUtc ?? manualRow.openedAtUtc,
      updatedAtUtc: now,
      setupName: qualitative.setupName,
      marketCondition: qualitative.marketCondition as MarketCond,
      entryModel: qualitative.entryModel as EntryModel,
      confidence: qualitative.confidence,
      preTradeEmotion: qualitative.preTradeEmotion as PreEmotion,
      postTradeEmotion: qualitative.postTradeEmotion as PostEmotion,
      initialStopPrice: qualitative.initialStopPrice,
      initialTargetPrice: qualitative.initialTargetPrice,
      plannedRr: qualitative.plannedRr,
      plannedRiskAmount: qualitative.plannedRiskAmount,
      plannedRiskPct: qualitative.plannedRiskPct,
    })
    .where(eq(trades.id, choice.manualTradeId));

  // Recompute P&L
  const instrument = await getInstrument(parsedTrade.symbol.toUpperCase());
  if (instrument) {
    const allLegs = await db
      .select()
      .from(tradeLegs)
      .where(eq(tradeLegs.tradeId, choice.manualTradeId));

    const tradePnlInput = {
      id: choice.manualTradeId,
      account_id: accountId,
      symbol: parsedTrade.symbol,
      direction: parsedTrade.direction,
      status: 'OPEN' as const,
      initial_stop_price: qualitative.initialStopPrice,
      initial_target_price: qualitative.initialTargetPrice,
    };
    const legsInput = allLegs.map((l) => ({
      id: l.id,
      trade_id: l.tradeId,
      leg_type: l.legType,
      timestamp_utc: l.timestampUtc,
      price: l.price,
      volume_lots: l.volumeLots,
      commission: l.commission,
      swap: l.swap,
      broker_profit: l.brokerProfit ?? null,
    }));

    const metrics = computeTradeMetrics(tradePnlInput, legsInput, instrument);
    await db
      .update(trades)
      .set({
        status: metrics.status,
        netPnl: metrics.netPnl,
        netPips: metrics.netPips,
        rMultiple: metrics.rMultiple,
        totalCommission: metrics.totalCommission,
        totalSwap: metrics.totalSwap,
        weightedAvgEntry: metrics.weightedAvgEntry,
        weightedAvgExit: metrics.weightedAvgExit,
        totalEntryVolume: metrics.totalEntryVolume,
        totalExitVolume: metrics.totalExitVolume,
        openedAtUtc: metrics.openedAtUtc ?? firstEntry?.timestampUtc ?? null,
        closedAtUtc: metrics.closedAtUtc ?? null,
        updatedAtUtc: new Date().toISOString(),
      })
      .where(eq(trades.id, choice.manualTradeId));
  }

  await writeAudit('TRADE', choice.manualTradeId, 'MERGE', choice.manualTradeId);
  }); // end withAsyncTransaction
}

// ─────────────────────────────────────────────────────────────
// Handler registration
// ─────────────────────────────────────────────────────────────

export function registerImportHandlers(ctx: IpcContext): void {
  ipcMain.removeHandler('imports:parse-file');
  ipcMain.removeHandler('imports:commit');
  ipcMain.removeHandler('imports:history');

  ipcMain.handle('imports:parse-file', async (_e, filePath: string, accountId?: string) => {
    try {
      log.info(`[Import] parse-file handler: filePath="${filePath}", accountId="${accountId}"`);
      
      if (!existsSync(filePath)) {
        log.error(`[Import] File not found: ${filePath}`);
        throw new Error(`File not found: ${filePath}`);
      }

      // v1.0.8: MT5 "Report History" HTML is UTF-16 LE with BOM; reading as
      // 'utf-8' silently produced mojibake and zero parsed trades. Read the
      // raw buffer and let decodeImportBuffer() pick the right encoding.
      const rawBuf = readFileSync(filePath);
      const content = decodeImportBuffer(rawBuf);
      log.info(`[Import] File read successfully: ${rawBuf.length} raw bytes, ${content.length} decoded chars`);
      if (process.env.DIAGNOSTIC_MODE === '1' || process.env.DIAGNOSTIC_MODE === 'true') {
        const bomTag =
          rawBuf.length >= 2 && rawBuf[0] === 0xff && rawBuf[1] === 0xfe ? 'UTF-16 LE (BOM)'
          : rawBuf.length >= 2 && rawBuf[0] === 0xfe && rawBuf[1] === 0xff ? 'UTF-16 BE (BOM)'
          : rawBuf.length >= 3 && rawBuf[0] === 0xef && rawBuf[1] === 0xbb && rawBuf[2] === 0xbf ? 'UTF-8 (BOM)'
          : 'UTF-8 (assumed — no BOM)';
        log.info(`[Import][DIAG] detected encoding: ${bomTag}; first 64 bytes (hex): ${rawBuf.slice(0, 64).toString('hex')}`);
      }
      
      const filename = basename(filePath);
      const { format, result } = detectAndParse(content, filename);
      
      log.info(`[Import] Format detected: "${format}", trades: ${result.trades.length}, failed: ${result.failed.length}, rowsTotal: ${result.rowsTotal}`);

      if (format === 'UNKNOWN') {
        log.warn(`[Import] Format detection failed for file "${filename}"`);
        return { id: null, format, trades: [], failed: [], rowsTotal: 0, candidates: [], accountId: null };
      }

      // Copy file to imports/ folder for provenance
      const importsDir = join(ctx.config.data_dir, 'imports');
      mkdirSync(importsDir, { recursive: true });
      const storedFilename = `${Date.now()}_${filename}`;
      const storedPath = join(importsDir, storedFilename);
      copyFileSync(filePath, storedPath);
      log.info(`[Import] File copied to "${storedPath}"`);

      const accounts = await listAccounts();
      const defaultAccountId = accounts[0]?.id ?? '';
      const selectedAccountId = accountId != null
        ? (() => {
            if (accountId !== '' && !accounts.some((a) => a.id === accountId)) {
              throw new Error(`Selected account not found: ${accountId}`);
            }
            return accountId;
          })()
        : defaultAccountId;

      log.info(`[Import] Using account: "${selectedAccountId}"`);

      // Find reconcile candidates for each parsed trade using the selected account.
      const allCandidates: ReconcileCandidate[] = [];
      for (const parsedTrade of result.trades) {
        const cs = await findReconcileCandidates(parsedTrade, selectedAccountId);
        log.debug(`[Import] Trade "${parsedTrade.symbol}" ${parsedTrade.direction}: found ${cs.length} merge candidates`);
        allCandidates.push(...cs);
      }

      const parseResultId = nanoid();
      pendingParses.set(parseResultId, {
        format,
        filename,
        filePath,
        storedPath: `imports/${storedFilename}`,
        accountId: selectedAccountId,
        trades: result.trades,
        failed: result.failed,
        rowsTotal: result.rowsTotal,
        expiresAt: Date.now() + 30 * 60 * 1000,
      });

      log.info(`[Import] Parse result stored: id="${parseResultId}", trades=${result.trades.length}, candidates=${allCandidates.length}`);

      return {
        id: parseResultId,
        format,
        trades: result.trades,
        failed: result.failed,
        rowsTotal: result.rowsTotal,
        candidates: allCandidates,
        accountId: selectedAccountId,
      };
    } catch (err) {
      log.error('[Import] parse-file failed:', err);
      return { id: null, format: 'UNKNOWN', trades: [], failed: [], rowsTotal: 0, candidates: [], accountId: null, error: (err as Error).message };
    }
  });

  ipcMain.handle(
    'imports:commit',
    async (
      _e,
      parseResultId: string,
      choices: {
        accountId: string;
        skipIds?: string[];
        reconcileChoices?: ReconcileChoice[];
      },
    ) => {
      try {
        const pending = pendingParses.get(parseResultId);
        if (!pending) {
          log.error(`[Import] Parse result not found or expired: id="${parseResultId}"`);
          throw new Error('Parse result not found or expired. Re-parse the file.');
        }

        log.info(`[Import] Committing parse result: id="${parseResultId}", format="${pending.format}", trades=${pending.trades.length}`);

        const { accountId } = choices;
        const skipSet = new Set(choices.skipIds ?? []);

        // Reconcile choices indexed by importedPositionId
        const reconcileMap = new Map<string, ReconcileChoice>(
          (choices.reconcileChoices ?? []).map((c) => [c.importedPositionId, c]),
        );

        const db = getDb();
        let imported = 0;
        let duplicate = 0;
        let merged = 0;
        let failed = pending.failed.length;
        const failedReport: Array<{ rowIndex: number; reason: string; rawRow: string[] }> = [
          ...pending.failed,
        ];

        const source =
          pending.format === 'MT4_HTML'
            ? ('MT4_HTML' as const)
            : pending.format === 'MT5_HTML'
              ? ('MT5_HTML' as const)
              : ('CSV' as const);

        log.debug(`[Import] Processing ${pending.trades.length} trades, skipping ${skipSet.size}, with ${reconcileMap.size} reconcile choices`);

        for (const parsedTrade of pending.trades) {
          // Explicitly skipped by user
          if (skipSet.has(parsedTrade.externalPositionId)) {
            log.debug(`[Import] Trade "${parsedTrade.symbol}" skipped by user`);
            duplicate++;
            continue;
          }

          // Handle reconcile choice
          const reconcileChoice = reconcileMap.get(parsedTrade.externalPositionId);
          if (reconcileChoice) {
            if (reconcileChoice.action === 'skip_import') {
              log.debug(`[Import] Trade "${parsedTrade.symbol}" reconciled as skip`);
              duplicate++;
              continue;
            }
            if (reconcileChoice.action === 'merge') {
              try {
                await executeMerge(reconcileChoice, parsedTrade, accountId, source);
                merged++;
              } catch (mergeErr) {
                log.error('imports:commit merge error', mergeErr);
                failedReport.push({
                  rowIndex: -1,
                  reason: `Merge failed: ${String(mergeErr)}`,
                  rawRow: [parsedTrade.externalPositionId, parsedTrade.symbol],
                });
                failed++;
              }
              continue;
            }
            // action === 'keep_both': fall through to normal import
          }

          try {
            // Check for existing trade by externalPositionId
            const existing = await db
              .select()
              .from(trades)
              .where(
                and(
                  eq(trades.accountId, accountId),
                  eq(trades.externalPositionId, parsedTrade.externalPositionId),
                  isNull(trades.deletedAtUtc),
                ),
              )
              .limit(1);

            if (existing[0]) {
              duplicate++;
              continue;
            }

            // Wrap entire insert + legs + recompute in one transaction so a
            // mid-operation failure never leaves a trade with no legs or stale metrics.
            await withAsyncTransaction(async () => {
              // Determine session from first entry leg
              const firstEntry = parsedTrade.legs.find((l) => l.legType === 'ENTRY');
              const session = firstEntry
                ? detectSession(new Date(firstEntry.timestampUtc))
                : undefined;

              const now = new Date().toISOString();
              const tradeId = nanoid();

              await db.insert(trades).values({
                id: tradeId,
                accountId,
                symbol: parsedTrade.symbol.toUpperCase(),
                direction: parsedTrade.direction,
                status: 'OPEN',
                externalPositionId: parsedTrade.externalPositionId,
                source,
                session: session ?? null,
                openedAtUtc: firstEntry?.timestampUtc ?? null,
                closedAtUtc: null,
                netPnl: null,
                netPips: null,
                rMultiple: null,
                totalCommission: 0,
                totalSwap: 0,
                weightedAvgEntry: null,
                weightedAvgExit: null,
                totalEntryVolume: 0,
                totalExitVolume: 0,
                deletedAtUtc: null,
                isSample: false,
                createdAtUtc: now,
                updatedAtUtc: now,
                initialStopPrice: null,
                initialTargetPrice: null,
                plannedRr: null,
                plannedRiskAmount: null,
                plannedRiskPct: null,
                setupName: null,
                marketCondition: null,
                entryModel: null,
                confidence: null,
                preTradeEmotion: null,
                postTradeEmotion: null,
                externalTicket: null,
              });

              // Insert legs
              for (const leg of parsedTrade.legs) {
                await db.insert(tradeLegs).values({
                  id: nanoid(),
                  tradeId,
                  legType: leg.legType,
                  timestampUtc: leg.timestampUtc,
                  price: leg.price,
                  volumeLots: leg.volumeLots,
                  commission: leg.commission,
                  swap: leg.swap,
                  brokerProfit: leg.brokerProfit,
                  externalDealId: leg.externalDealId,
                  notes: null,
                  createdAtUtc: now,
                });
              }

              // Audit entry for imported trade (Hard Rule #14)
              await writeAudit('TRADE', tradeId, 'CREATE', tradeId);

              // Recompute P&L
              const instrument = await getInstrument(parsedTrade.symbol.toUpperCase());
              if (instrument) {
                const allLegs = await db
                  .select()
                  .from(tradeLegs)
                  .where(eq(tradeLegs.tradeId, tradeId));

                const tradePnlInput = {
                  id: tradeId,
                  account_id: accountId,
                  symbol: parsedTrade.symbol,
                  direction: parsedTrade.direction,
                  status: 'OPEN' as const,
                  initial_stop_price: null,
                  initial_target_price: null,
                };
                const legsInput = allLegs.map((l) => ({
                  id: l.id,
                  trade_id: l.tradeId,
                  leg_type: l.legType,
                  timestamp_utc: l.timestampUtc,
                  price: l.price,
                  volume_lots: l.volumeLots,
                  commission: l.commission,
                  swap: l.swap,
                  broker_profit: l.brokerProfit ?? null,
                }));

                const metrics = computeTradeMetrics(tradePnlInput, legsInput, instrument);
                const updateNow = new Date().toISOString();
                await db
                  .update(trades)
                  .set({
                    status: metrics.status,
                    netPnl: metrics.netPnl,
                    netPips: metrics.netPips,
                    rMultiple: metrics.rMultiple,
                    totalCommission: metrics.totalCommission,
                    totalSwap: metrics.totalSwap,
                    weightedAvgEntry: metrics.weightedAvgEntry,
                    weightedAvgExit: metrics.weightedAvgExit,
                    totalEntryVolume: metrics.totalEntryVolume,
                    totalExitVolume: metrics.totalExitVolume,
                    openedAtUtc: metrics.openedAtUtc ?? firstEntry?.timestampUtc ?? null,
                    closedAtUtc: metrics.closedAtUtc ?? null,
                    updatedAtUtc: updateNow,
                  })
                  .where(eq(trades.id, tradeId));
              } else {
                log.warn(`Import: unknown instrument ${parsedTrade.symbol} — P&L not computed`);
              }
            }); // end withAsyncTransaction

            imported++;
          } catch (tradeErr) {
            log.error('imports:commit trade error', tradeErr);
            failedReport.push({
              rowIndex: -1,
              reason: String(tradeErr),
              rawRow: [parsedTrade.externalPositionId, parsedTrade.symbol],
            });
            failed++;
          }
        }

        // Record import run
        const runNow = new Date().toISOString();
        await db.insert(importRuns).values({
          id: nanoid(),
          source: pending.format,
          sourceFilename: pending.filename,
          storedPath: pending.storedPath,
          accountId,
          rowsTotal: pending.rowsTotal,
          rowsImported: imported,
          rowsDuplicate: duplicate,
          rowsMerged: merged,
          rowsFailed: failed,
          failedReport: failedReport.length ? JSON.stringify(failedReport) : null,
          createdAtUtc: runNow,
        });

        pendingParses.delete(parseResultId);
        if (imported > 0 || merged > 0) {
          invalidateDashboardCache();
          clearTradeMetricsCache(); // T1.9: bulk import invalidates all trade metrics
        }

        log.info(
          `Import complete: ${imported} imported, ${duplicate} duplicate, ${merged} merged, ${failed} failed`,
        );
        return { imported, duplicate, merged, failed, failedReport };
      } catch (err) {
        log.error('imports:commit', err);
        throw err;
      }
    },
  );

  ipcMain.handle('imports:history', async () => {
    try {
      const db = getDb();
      // H-5: sort newest first so the UI shows most recent import at the top
      return db.select().from(importRuns).orderBy(desc(importRuns.createdAtUtc));
    } catch (err) {
      log.error('imports:history', err);
      throw err;
    }
  });
}
