/**
 * Live Bridge IPC handler — Milestone 11.
 *
 * Watches a user-configured folder (MQL4/5 Files/Ledger/) for JSON files
 * dropped by the LedgerBridge Expert Advisor. Two JSON formats are supported:
 *
 * ── MT5 deal-array format (platform: "MT5") ─────────────────────────────
 *   { version, platform, account, account_currency, broker,
 *     position_id, status: "open"|"closed",
 *     deals: [{ deal_id, symbol, type, entry, time_utc, volume, price,
 *               stop_loss, take_profit, commission, swap, profit, comment }] }
 *
 *   On status "open"   → CREATE trade + ENTRY leg (idempotent; skip if exists)
 *   On status "closed" → FIND existing trade by position_id → ADD any new EXIT
 *                        legs (dedup by deal_id) → RECOMPUTE P&L
 *                        Qualitative fields (setup, tags, emotions, notes,
 *                        screenshots) are NEVER touched on update.
 *
 * ── MT4 flat format (no platform field / platform: "MT4") ───────────────
 *   { ticket, symbol, direction, volume, open_time, open_price,
 *     close_time, close_price, commission, swap, profit, sl, tp, comment }
 *   (MT4 can only report closed orders; no open-trade event.)
 *
 * Common lifecycle for both formats:
 *  1. Parse + validate JSON
 *  2. Match account (by broker number, or first active account)
 *  3. Dedupe / upsert trade record
 *  4. Insert missing legs (dedup by externalDealId)
 *  5. Recompute P&L via pnl.ts
 *  6. Move file to bridge/processed/<date>/ (or bridge/failed/ on error)
 *  7. Broadcast toast notification to all renderer windows
 */

import { ipcMain, BrowserWindow } from 'electron';
import log from 'electron-log/main.js';
import {
  readFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import { nanoid } from 'nanoid';
import { eq, and, isNull } from 'drizzle-orm';
import chokidar, { type FSWatcher } from 'chokidar';

import { getDb, withAsyncTransaction } from '../../src/lib/db/client';
import { trades, tradeLegs, bridgeFiles } from '../../src/lib/db/schema';
import { getInstrument, listAccounts, writeAudit } from '../../src/lib/db/queries';
import { detectSession } from '../../src/lib/tz';
import { computeTradeMetrics } from '../../src/lib/pnl';
import type { IpcContext } from './index';

// ─────────────────────────────────────────────────────────────
// MT5 deal-array JSON schema (from LedgerBridge.mq5)
// ─────────────────────────────────────────────────────────────

interface MT5Deal {
  deal_id: number;
  symbol: string;
  type: 'buy' | 'sell' | 'other';
  entry: 'in' | 'out' | 'inout' | 'other';
  time_utc: string;
  volume: number;
  price: number;
  stop_loss: number;
  take_profit: number;
  commission: number;
  swap: number;
  profit: number;
  comment?: string;
}

interface MT5Payload {
  version: number;
  platform: 'MT5';
  account: number;
  account_currency?: string;
  broker?: string;
  position_id: number;
  status: 'open' | 'closed';
  deals: MT5Deal[];
}

// ─────────────────────────────────────────────────────────────
// MT4 flat JSON schema (from LedgerBridge.mq4)
// ─────────────────────────────────────────────────────────────

interface MT4Payload {
  platform?: 'MT4';
  account?: string;
  ticket: string;
  symbol: string;
  direction: 'buy' | 'sell';
  volume: number;
  open_time: string;
  open_price: number;
  close_time: string;
  close_price: number;
  commission: number;
  swap: number;
  profit: number;
  sl: number | null;
  tp: number | null;
  comment?: string;
}

type BridgePayload = MT5Payload | MT4Payload;

// ─────────────────────────────────────────────────────────────
// Watcher state
// ─────────────────────────────────────────────────────────────

let watcher: FSWatcher | null = null;
let watchDir: string | null = null;
let filesProcessed = 0;
let isRunning = false;

// ─────────────────────────────────────────────────────────────
// Notify all renderer windows
// ─────────────────────────────────────────────────────────────

function broadcastTradeReceived(payload: {
  symbol: string;
  direction: string;
  netPips: number | null;
  netPnl: number | null;
  status: 'open' | 'closed';
}) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('bridge:trade-received', payload);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────

async function recomputeAndSave(
  tradeId: string,
  symbol: string,
  direction: 'LONG' | 'SHORT',
  accountId: string,
  slPrice: number | null,
  tpPrice: number | null,
): Promise<{ netPips: number | null; netPnl: number | null }> {
  const db = getDb();
  const instrument = await getInstrument(symbol);

  if (!instrument) {
    log.warn(`bridge: no instrument found for ${symbol} — P&L not computed`);
    return { netPips: null, netPnl: null };
  }

  const allLegs = await db
    .select()
    .from(tradeLegs)
    .where(eq(tradeLegs.tradeId, tradeId));

  const tradePnlInput = {
    id: tradeId,
    account_id: accountId,
    symbol,
    direction,
    status: 'OPEN' as const,
    initial_stop_price: slPrice,
    initial_target_price: tpPrice,
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
      openedAtUtc: metrics.openedAtUtc ?? undefined,
      closedAtUtc: metrics.closedAtUtc ?? null,
      updatedAtUtc: new Date().toISOString(),
    })
    .where(eq(trades.id, tradeId));

  return { netPips: metrics.netPips, netPnl: metrics.netPnl };
}

// ─────────────────────────────────────────────────────────────
// MT5 deal-array processor
// ─────────────────────────────────────────────────────────────

async function processMT5(
  payload: MT5Payload,
  filename: string,
  processedBase: string,
  failedBase: string,
  filePath: string,
): Promise<{ tradeId: string | null; accountId: string | null }> {
  if (!Array.isArray(payload.deals) || payload.deals.length === 0) {
    throw new Error('MT5 payload has no deals array');
  }

  const db = getDb();

  // Find matching account by broker login number or fall back to first active account
  const accounts = await listAccounts();
  const account =
    accounts.find((a) => a.broker === String(payload.account)) ?? accounts[0];
  if (!account) {
    log.warn('bridge(MT5): no account found — skipping');
    renameSync(filePath, join(processedBase, filename));
    return { tradeId: null, accountId: null };
  }
  const accountId = account.id;
  const positionIdStr = String(payload.position_id);

  // Separate IN (entry) and OUT/INOUT (exit) deals
  const inDeals = payload.deals.filter((d) => d.entry === 'in');
  const outDeals = payload.deals.filter(
    (d) => d.entry === 'out' || d.entry === 'inout',
  );

  if (inDeals.length === 0) {
    log.warn(`bridge(MT5): position ${payload.position_id} has no IN deals — skipping`);
    renameSync(filePath, join(processedBase, filename));
    return { tradeId: null, accountId };
  }

  const firstIn = inDeals[0];
  const symbol = firstIn.symbol.toUpperCase();
  const direction: 'LONG' | 'SHORT' = firstIn.type === 'buy' ? 'LONG' : 'SHORT';
  const session = detectSession(new Date(firstIn.time_utc));
  const now = new Date().toISOString();

  // Determine SL/TP from the first IN deal (best available)
  const slPrice = firstIn.stop_loss > 0 ? firstIn.stop_loss : null;
  const tpPrice = firstIn.take_profit > 0 ? firstIn.take_profit : null;

  // ── Look up existing trade by position_id ────────────────────
  const existing = await db
    .select()
    .from(trades)
    .where(
      and(
        eq(trades.accountId, accountId),
        isNull(trades.deletedAtUtc),
        eq(trades.externalPositionId, positionIdStr),
      ),
    )
    .limit(1);

  let tradeId: string;
  let isNew = false;

  if (!existing[0]) {
    // ── CREATE new trade + all legs atomically ───────────────────
    tradeId = nanoid();
    isNew = true;

    await withAsyncTransaction(async () => {
      await db.insert(trades).values({
        id: tradeId,
        accountId,
        symbol,
        direction,
        status: 'OPEN',
        source: 'LIVE_BRIDGE',
        externalPositionId: positionIdStr,
        externalTicket: null,
        session,
        openedAtUtc: firstIn.time_utc,
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
        initialStopPrice: slPrice,
        initialTargetPrice: tpPrice,
        plannedRr: null,
        plannedRiskAmount: null,
        plannedRiskPct: null,
        // Qualitative fields — trader fills these in via the journal UI
        setupName: null,
        marketCondition: null,
        entryModel: null,
        confidence: null,
        preTradeEmotion: null,
        postTradeEmotion: null,
        deletedAtUtc: null,
        isSample: false,
        createdAtUtc: now,
        updatedAtUtc: now,
      });

      for (const deal of inDeals) {
        await db.insert(tradeLegs).values({
          id: nanoid(),
          tradeId,
          legType: 'ENTRY',
          timestampUtc: deal.time_utc,
          price: deal.price,
          volumeLots: deal.volume,
          commission: deal.commission,
          swap: deal.swap,
          brokerProfit: null,
          externalDealId: String(deal.deal_id),
          notes: deal.comment ?? null,
          createdAtUtc: now,
        });
      }

      if (payload.status === 'closed') {
        for (const deal of outDeals) {
          await db.insert(tradeLegs).values({
            id: nanoid(),
            tradeId,
            legType: 'EXIT',
            timestampUtc: deal.time_utc,
            price: deal.price,
            volumeLots: deal.volume,
            commission: deal.commission,
            swap: deal.swap,
            brokerProfit: deal.profit,
            externalDealId: String(deal.deal_id),
            notes: deal.comment ?? null,
            createdAtUtc: now,
          });
        }
      }
    });

    await writeAudit('TRADE', tradeId, 'CREATE', tradeId);
    log.info(`bridge(MT5): created trade ${tradeId} for position ${payload.position_id}`);
  } else {
    tradeId = existing[0].id;
    log.info(`bridge(MT5): found existing trade ${tradeId} for position ${payload.position_id}`);

    // ── Add any new legs to existing trade (atomically) ──────────
    const existingLegs = await db
      .select({ externalDealId: tradeLegs.externalDealId })
      .from(tradeLegs)
      .where(eq(tradeLegs.tradeId, tradeId));
    const knownDealIds = new Set(
      existingLegs.map((l) => l.externalDealId).filter((id): id is string => id !== null),
    );

    const newEntryDeals = inDeals.filter((d) => !knownDealIds.has(String(d.deal_id)));
    const newExitDeals =
      payload.status === 'closed'
        ? outDeals.filter((d) => !knownDealIds.has(String(d.deal_id)))
        : [];

    if (newEntryDeals.length > 0 || newExitDeals.length > 0) {
      await withAsyncTransaction(async () => {
        for (const deal of newEntryDeals) {
          await db.insert(tradeLegs).values({
            id: nanoid(),
            tradeId,
            legType: 'ENTRY',
            timestampUtc: deal.time_utc,
            price: deal.price,
            volumeLots: deal.volume,
            commission: deal.commission,
            swap: deal.swap,
            brokerProfit: null,
            externalDealId: String(deal.deal_id),
            notes: deal.comment ?? null,
            createdAtUtc: now,
          });
          log.info(`bridge(MT5): inserted ENTRY leg deal_id=${deal.deal_id} for trade ${tradeId}`);
        }
        for (const deal of newExitDeals) {
          await db.insert(tradeLegs).values({
            id: nanoid(),
            tradeId,
            legType: 'EXIT',
            timestampUtc: deal.time_utc,
            price: deal.price,
            volumeLots: deal.volume,
            commission: deal.commission,
            swap: deal.swap,
            brokerProfit: deal.profit,
            externalDealId: String(deal.deal_id),
            notes: deal.comment ?? null,
            createdAtUtc: now,
          });
          log.info(`bridge(MT5): inserted EXIT leg deal_id=${deal.deal_id} for trade ${tradeId}`);
        }
      });
      await writeAudit('TRADE', tradeId, 'UPDATE', tradeId);
    }
  }

  // ── Recompute P&L ─────────────────────────────────────────────
  const { netPips, netPnl } = await recomputeAndSave(
    tradeId,
    symbol,
    direction,
    accountId,
    slPrice,
    tpPrice,
  );

  renameSync(filePath, join(processedBase, filename));
  filesProcessed++;

  log.info(
    `bridge(MT5): processed position ${payload.position_id} ` +
      `status=${payload.status} netPnl=${netPnl} netPips=${netPips} isNew=${isNew}`,
  );

  broadcastTradeReceived({ symbol, direction, netPips, netPnl, status: payload.status });
  return { tradeId, accountId };
}

// ─────────────────────────────────────────────────────────────
// MT4 flat-format processor (close-only; MT4 has no open event)
// ─────────────────────────────────────────────────────────────

async function processMT4(
  payload: MT4Payload,
  filename: string,
  processedBase: string,
  failedBase: string,
  filePath: string,
): Promise<{ tradeId: string | null; accountId: string | null }> {
  if (!payload.symbol || !payload.open_price || !payload.direction) {
    throw new Error('MT4 payload missing required fields');
  }

  const db = getDb();
  const accounts = await listAccounts();
  const account =
    accounts.find((a) => a.broker === String(payload.account ?? '')) ?? accounts[0];
  if (!account) {
    log.warn('bridge(MT4): no account found — skipping');
    renameSync(filePath, join(processedBase, filename));
    return { tradeId: null, accountId: null };
  }
  const accountId = account.id;

  // Deduplicate by externalTicket
  const existing = await db
    .select()
    .from(trades)
    .where(
      and(
        eq(trades.accountId, accountId),
        isNull(trades.deletedAtUtc),
        eq(trades.externalTicket, payload.ticket),
      ),
    )
    .limit(1);

  if (existing[0]) {
    log.info(`bridge(MT4): duplicate ticket ${payload.ticket} — skipping`);
    renameSync(filePath, join(processedBase, filename));
    return { tradeId: existing[0].id, accountId };
  }

  const direction: 'LONG' | 'SHORT' = payload.direction === 'buy' ? 'LONG' : 'SHORT';
  const symbol = payload.symbol.toUpperCase();
  const session = detectSession(new Date(payload.open_time));
  const now = new Date().toISOString();
  const tradeId = nanoid();

  // Insert trade + legs atomically — if any insert fails the whole set is rolled back
  await withAsyncTransaction(async () => {
    await db.insert(trades).values({
      id: tradeId,
      accountId,
      symbol,
      direction,
      status: 'OPEN',
      source: 'LIVE_BRIDGE',
      externalTicket: payload.ticket,
      externalPositionId: null,
      session,
      openedAtUtc: payload.open_time,
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
      initialStopPrice: payload.sl ?? null,
      initialTargetPrice: payload.tp ?? null,
      plannedRr: null,
      plannedRiskAmount: null,
      plannedRiskPct: null,
      setupName: null,
      marketCondition: null,
      entryModel: null,
      confidence: null,
      preTradeEmotion: null,
      postTradeEmotion: null,
      deletedAtUtc: null,
      isSample: false,
      createdAtUtc: now,
      updatedAtUtc: now,
    });

    // ENTRY leg
    await db.insert(tradeLegs).values({
      id: nanoid(),
      tradeId,
      legType: 'ENTRY',
      timestampUtc: payload.open_time,
      price: payload.open_price,
      volumeLots: payload.volume,
      commission: 0,
      swap: 0,
      brokerProfit: null,
      externalDealId: payload.ticket,
      notes: payload.comment ?? null,
      createdAtUtc: now,
    });

    // EXIT leg (MT4 always provides a closed trade)
    await db.insert(tradeLegs).values({
      id: nanoid(),
      tradeId,
      legType: 'EXIT',
      timestampUtc: payload.close_time,
      price: payload.close_price,
      volumeLots: payload.volume,
      commission: payload.commission,
      swap: payload.swap,
      brokerProfit: payload.profit,
      externalDealId: null,
      notes: null,
      createdAtUtc: now,
    });
  });

  const { netPips, netPnl } = await recomputeAndSave(
    tradeId,
    symbol,
    direction,
    accountId,
    payload.sl ?? null,
    payload.tp ?? null,
  );

  await writeAudit('TRADE', tradeId, 'CREATE', tradeId);

  renameSync(filePath, join(processedBase, filename));
  filesProcessed++;

  log.info(`bridge(MT4): imported ${symbol} ${direction} ticket=${payload.ticket}`);

  broadcastTradeReceived({ symbol, direction, netPips, netPnl, status: 'closed' });
  return { tradeId, accountId };
}

// ─────────────────────────────────────────────────────────────
// File processor — detects format then dispatches
// ─────────────────────────────────────────────────────────────

async function processFile(filePath: string, dataDir: string): Promise<void> {
  const filename = basename(filePath);
  const today = new Date().toISOString().slice(0, 10);
  const processedBase = join(dataDir, 'bridge', 'processed', today);
  const failedBase = join(dataDir, 'bridge', 'failed');
  mkdirSync(processedBase, { recursive: true });
  mkdirSync(failedBase, { recursive: true });

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch (err) {
    log.warn(`bridge: cannot read ${filename}`, err);
    return;
  }

  let payload: BridgePayload;
  try {
    payload = JSON.parse(raw) as BridgePayload;
  } catch (err) {
    log.error(`bridge: JSON parse failed for ${filename}`, err);
    const errorPath = join(failedBase, filename);
    renameSync(filePath, errorPath);
    writeFileSync(errorPath + '.error', String(err) + '\n\nRaw:\n' + raw);
    return;
  }

  try {
    let result: { tradeId: string | null; accountId: string | null };
    if ('platform' in payload && payload.platform === 'MT5') {
      result = await processMT5(
        payload as MT5Payload,
        filename,
        processedBase,
        failedBase,
        filePath,
      );
    } else {
      result = await processMT4(
        payload as MT4Payload,
        filename,
        processedBase,
        failedBase,
        filePath,
      );
    }

    // Record in bridge_files for audit / UI history
    try {
      await getDb()
        .insert(bridgeFiles)
        .values({
          filename,
          status: 'PROCESSED',
          accountId: result.accountId,
          tradeId: result.tradeId,
          errorMessage: null,
          processedAtUtc: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: bridgeFiles.filename,
          set: {
            status: 'PROCESSED',
            tradeId: result.tradeId,
            errorMessage: null,
            processedAtUtc: new Date().toISOString(),
          },
        });
    } catch (dbErr) {
      log.warn('bridge: failed to record bridge_files entry', dbErr);
    }
  } catch (err) {
    log.error(`bridge: processing failed for ${filename}`, err);
    const errorPath = join(failedBase, filename);
    try { renameSync(filePath, errorPath); } catch { /* already moved */ }
    writeFileSync(errorPath + '.error', String(err) + '\n\nRaw:\n' + raw);

    // Record failure in bridge_files
    try {
      const errMsg = String(err).slice(0, 500);
      await getDb()
        .insert(bridgeFiles)
        .values({
          filename,
          status: 'FAILED',
          accountId: null,
          tradeId: null,
          errorMessage: errMsg,
          processedAtUtc: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: bridgeFiles.filename,
          set: {
            status: 'FAILED',
            errorMessage: errMsg,
            processedAtUtc: new Date().toISOString(),
          },
        });
    } catch (dbErr) {
      log.warn('bridge: failed to record bridge_files failure entry', dbErr);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Start / stop watcher
// ─────────────────────────────────────────────────────────────

function startWatcher(dir: string, dataDir: string) {
  if (watcher) {
    watcher.close();
    watcher = null;
  }

  watchDir = dir;
  isRunning = true;

  watcher = chokidar.watch(join(dir, '*.json'), {
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  watcher.on('add', (filePath) => {
    log.info(`bridge: new file ${filePath}`);
    processFile(filePath, dataDir).catch((err) =>
      log.error('bridge: processFile error', err),
    );
  });

  watcher.on('change', (filePath) => {
    // MT5 re-exports the same filename (position_id.json) on every deal.
    // Process the updated file to pick up new legs.
    log.info(`bridge: updated file ${filePath}`);
    processFile(filePath, dataDir).catch((err) =>
      log.error('bridge: processFile error', err),
    );
  });

  watcher.on('error', (err) => log.error('bridge: watcher error', err));

  log.info(`bridge: watching ${dir}`);
}

function stopWatcher() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  isRunning = false;
  log.info('bridge: stopped');
}

// ─────────────────────────────────────────────────────────────
// IPC registration
// ─────────────────────────────────────────────────────────────

export function registerBridgeHandlers(ctx: IpcContext): void {
  ipcMain.removeHandler('bridge:status');
  ipcMain.removeHandler('bridge:set-watch-dir');
  ipcMain.removeHandler('bridge:pause');
  ipcMain.removeHandler('bridge:resume');

  ipcMain.handle('bridge:status', () => ({
    running: isRunning,
    watchDir,
    filesProcessed,
  }));

  ipcMain.handle('bridge:set-watch-dir', async (_e, dir: string) => {
    if (!existsSync(dir)) {
      throw new Error(`Directory not found: ${dir}`);
    }
    // Persist watch dir to settings table
    try {
      const db = getDb();
      const { settings } = await import('../../src/lib/db/schema');
      await db
        .insert(settings)
        .values({ key: 'bridge_watch_dir', value: dir })
        .onConflictDoUpdate({ target: settings.key, set: { value: dir } });
    } catch (err) {
      log.warn('bridge: could not persist watch dir', err);
    }
    startWatcher(dir, ctx.config.data_dir);
    return { ok: true };
  });

  ipcMain.handle('bridge:pause', () => {
    stopWatcher();
  });

  ipcMain.handle('bridge:resume', async () => {
    if (!watchDir) {
      try {
        const db = getDb();
        const { settings } = await import('../../src/lib/db/schema');
        const row = await db
          .select()
          .from(settings)
          .where(eq(settings.key, 'bridge_watch_dir'))
          .limit(1);
        if (row[0]?.value) {
          watchDir = row[0].value;
        }
      } catch { /* no stored dir */ }
    }
    if (watchDir && existsSync(watchDir)) {
      startWatcher(watchDir, ctx.config.data_dir);
    }
  });

  // Auto-start watcher if watch dir is configured in settings
  ;(async () => {
    try {
      const db = getDb();
      const { settings } = await import('../../src/lib/db/schema');
      const row = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'bridge_watch_dir'))
        .limit(1);
      if (row[0]?.value && existsSync(row[0].value)) {
        startWatcher(row[0].value, ctx.config.data_dir);
      }
    } catch { /* DB not ready yet */ }
  })();
}
