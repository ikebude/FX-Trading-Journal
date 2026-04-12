/**
 * Ledger — Live MT4/MT5 bridge file watcher (main process)
 *
 * Watches <data_dir>/bridge/inbox/ for JSON files dropped by the
 * LedgerBridge Expert Advisor.  On each file:
 *
 *  1. Reads + validates the JSON (MT4 flat or MT5 deal-array format)
 *  2. Finds or matches the account (by broker account number)
 *  3. Deduplicates against existing trades via external_ticket / external_position_id
 *  4. Inserts new trade + legs, recomputes P&L via pnl.ts
 *  5. Moves the file to bridge/processed/<YYYY-MM-DD>/ on success
 *     or bridge/failed/ on any error
 *  6. Sends a toast notification to all open renderer windows
 *
 * The watcher is started once after DB initialisation and lives for the
 * whole process lifetime.  `stopBridgeWatcher()` is called on will-quit.
 */

import log from 'electron-log/main.js';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { BrowserWindow } from 'electron';
import { nanoid } from 'nanoid';
import { eq, and, isNull } from 'drizzle-orm';
import { format } from 'date-fns';

import { getDb, withAsyncTransaction } from '../../src/lib/db/client';
import { trades, tradeLegs, bridgeFiles } from '../../src/lib/db/schema';
import { getInstrument, listAccounts, writeAudit, updateTrade } from '../../src/lib/db/queries';
import { computeTradeMetrics } from '../../src/lib/pnl';
import { detectSession } from '../../src/lib/tz';

// ─────────────────────────────────────────────────────────────
// Module state
// ─────────────────────────────────────────────────────────────

let _watcher: FSWatcher | null = null;

// ─────────────────────────────────────────────────────────────
// Toast broadcaster
// ─────────────────────────────────────────────────────────────

interface BridgeEvent {
  message: string;
  variant: 'success' | 'error';
  trade?: {
    symbol: string;
    direction: string;
    netPips: number | null;
    netPnl: number | null;
    status: 'open' | 'closed';
  };
}

function broadcastEvent(event: BridgeEvent) {
  BrowserWindow.getAllWindows().forEach((win) => {
    // bridge:trade-received — consumed by App.tsx for toast + blotter refresh
    win.webContents.send('bridge:trade-received', event);
  });
}

// ─────────────────────────────────────────────────────────────
// JSON schemas
// ─────────────────────────────────────────────────────────────

interface MT4BridgeFile {
  version: number;
  platform?: 'MT4';
  account: number;
  account_currency: string;
  broker: string;
  ticket: number;
  symbol: string;
  type: 'buy' | 'sell';
  volume: number;
  open_time_utc: string;
  open_price: number;
  close_time_utc: string;
  close_price: number;
  stop_loss: number;
  take_profit: number;
  commission: number;
  swap: number;
  profit: number;
  comment: string;
}

interface MT5Deal {
  deal_id: number;
  symbol: string;
  type: string;
  entry: 'in' | 'out' | 'in/out';
  time_utc: string;
  volume: number;
  price: number;
  stop_loss?: number;
  take_profit?: number;
  commission: number;
  swap: number;
  profit: number;
  comment?: string;
}

interface MT5BridgeFile {
  version: number;
  platform: 'MT5';
  account: number;
  account_currency: string;
  broker: string;
  position_id: number;
  symbol: string;
  status: 'open' | 'closed';
  deals: MT5Deal[];
}

// ─────────────────────────────────────────────────────────────
// Account matching
// ─────────────────────────────────────────────────────────────

async function resolveAccountId(
  brokerAccountNumber: number,
): Promise<string | null> {
  const accounts = await listAccounts();
  if (accounts.length === 0) return null;

  // Match by external account number in broker field or account name.
  // The account.broker field might contain the account number as a suffix.
  const match = accounts.find(
    (a) =>
      a.broker?.includes(String(brokerAccountNumber)) ||
      a.name.includes(String(brokerAccountNumber)),
  );
  if (match) return match.id;

  // Fall back to the first active account.
  return accounts[0].id;
}

// ─────────────────────────────────────────────────────────────
// MT4 file processing
// ─────────────────────────────────────────────────────────────

type ProcessResult = { message: string; trade: BridgeEvent['trade'] | null; tradeId: string | null; accountId: string | null };

async function processMt4File(data: MT4BridgeFile, dataDir: string): Promise<ProcessResult> {
  const db = getDb();
  const accountId = await resolveAccountId(data.account);
  if (!accountId) throw new Error('No accounts configured in Ledger');

  const externalTicket = String(data.ticket);
  const direction = data.type === 'buy' ? 'LONG' : 'SHORT';
  const now = new Date().toISOString();

  // Deduplicate: skip if this ticket is already in the DB.
  const existing = await db
    .select({ id: trades.id })
    .from(trades)
    .where(
      and(
        eq(trades.accountId, accountId),
        eq(trades.externalTicket, externalTicket),
        isNull(trades.deletedAtUtc),
      ),
    );
  if (existing.length > 0) {
    return { message: `Skipped duplicate MT4 ticket ${externalTicket}`, trade: null, tradeId: existing[0].id, accountId };
  }

  const symbol = data.symbol.toUpperCase();
  const instrument = await getInstrument(symbol);
  if (!instrument) {
    throw new Error(`Unknown instrument: ${symbol}. Add it in Settings → Instruments.`);
  }

  const tradeId = nanoid();

  // Insert trade + legs atomically — if any insert fails the whole set is rolled back
  await withAsyncTransaction(async () => {
    await db.insert(trades).values({
      id: tradeId,
      accountId,
      symbol,
      direction,
      status: 'OPEN',
      initialStopPrice: data.stop_loss || null,
      initialTargetPrice: data.take_profit || null,
      source: 'LIVE_BRIDGE',
      session: detectSession(new Date(data.open_time_utc)),
      externalTicket,
      openedAtUtc: data.open_time_utc,
      closedAtUtc: data.close_time_utc || null,
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
    });

    await db.insert(tradeLegs).values({
      id: nanoid(),
      tradeId,
      legType: 'ENTRY',
      timestampUtc: data.open_time_utc,
      price: data.open_price,
      volumeLots: data.volume,
      commission: 0,
      swap: 0,
      brokerProfit: null,
      externalDealId: `${externalTicket}-entry`,
      notes: null,
      createdAtUtc: now,
    });

    const hasClosed = data.close_time_utc && data.close_price > 0;
    if (hasClosed) {
      await db.insert(tradeLegs).values({
        id: nanoid(),
        tradeId,
        legType: 'EXIT',
        timestampUtc: data.close_time_utc,
        price: data.close_price,
        volumeLots: data.volume,
        commission: data.commission,
        swap: data.swap,
        brokerProfit: data.profit,
        externalDealId: `${externalTicket}-exit`,
        notes: data.comment || null,
        createdAtUtc: now,
      });
    }
  });

  // Recompute P&L
  await recomputeTrade(tradeId);

  await writeAudit('TRADE', tradeId, 'CREATE', tradeId, {
    source: ['', 'LIVE_BRIDGE'],
    platform: ['', 'MT4'],
    ticket: ['', externalTicket],
  });

  // Fetch final trade state for broadcast
  const finalRow = await getDb().select({
    status: trades.status, netPnl: trades.netPnl, netPips: trades.netPips,
  }).from(trades).where(eq(trades.id, tradeId));
  const finalTrade = finalRow[0];

  return {
    message: `Imported MT4 trade ${externalTicket} (${symbol} ${direction})`,
    trade: {
      symbol,
      direction,
      netPips: finalTrade?.netPips ?? null,
      netPnl: finalTrade?.netPnl ?? null,
      status: ((finalTrade?.status ?? 'OPEN').toLowerCase()) as 'open' | 'closed',
    },
    tradeId,
    accountId,
  };
}

// ─────────────────────────────────────────────────────────────
// MT5 file processing
// ─────────────────────────────────────────────────────────────

async function processMt5File(data: MT5BridgeFile): Promise<ProcessResult> {
  const db = getDb();
  const accountId = await resolveAccountId(data.account);
  if (!accountId) throw new Error('No accounts configured in Ledger');

  const positionId = String(data.position_id);
  const symbol = data.symbol?.toUpperCase() ?? data.deals[0]?.symbol?.toUpperCase();
  if (!symbol) throw new Error('MT5 file missing symbol');

  const instrument = await getInstrument(symbol);
  if (!instrument) {
    throw new Error(`Unknown instrument: ${symbol}. Add it in Settings → Instruments.`);
  }

  const now = new Date().toISOString();

  // Find first deal to determine direction
  const firstDeal = data.deals[0];
  if (!firstDeal) throw new Error('MT5 file has no deals');
  const direction = firstDeal.type?.toLowerCase().includes('buy') ? 'LONG' : 'SHORT';

  // Check if trade already exists
  const existing = await db
    .select({ id: trades.id })
    .from(trades)
    .where(
      and(
        eq(trades.accountId, accountId),
        eq(trades.externalPositionId, positionId),
        isNull(trades.deletedAtUtc),
      ),
    );

  let tradeId: string;

  let newLegsAdded = 0;

  if (existing.length === 0) {
    // Create new trade + all legs atomically
    tradeId = nanoid();
    const entryDeal = data.deals.find((d) => d.entry === 'in') ?? firstDeal;

    await withAsyncTransaction(async () => {
      await db.insert(trades).values({
        id: tradeId,
        accountId,
        symbol,
        direction,
        status: 'OPEN',
        initialStopPrice: entryDeal.stop_loss || null,
        initialTargetPrice: entryDeal.take_profit || null,
        source: 'LIVE_BRIDGE',
        session: detectSession(new Date(entryDeal.time_utc)),
        externalPositionId: positionId,
        openedAtUtc: entryDeal.time_utc,
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
      });

      for (const deal of data.deals) {
        const legType = deal.entry === 'in' ? 'ENTRY' : 'EXIT';
        await db.insert(tradeLegs).values({
          id: nanoid(),
          tradeId,
          legType,
          timestampUtc: deal.time_utc,
          price: deal.price,
          volumeLots: deal.volume,
          commission: deal.commission,
          swap: deal.swap,
          brokerProfit: legType === 'EXIT' ? deal.profit : null,
          externalDealId: String(deal.deal_id),
          notes: deal.comment || null,
          createdAtUtc: now,
        });
        newLegsAdded++;
      }
    });

    await writeAudit('TRADE', tradeId, 'CREATE', tradeId, {
      source: ['', 'LIVE_BRIDGE'],
      platform: ['', 'MT5'],
      positionId: ['', positionId],
    });
  } else {
    tradeId = existing[0].id;

    // Load existing legs to avoid duplicates, then add new ones atomically
    const existingLegs = await db
      .select({ externalDealId: tradeLegs.externalDealId })
      .from(tradeLegs)
      .where(eq(tradeLegs.tradeId, tradeId));
    const existingDealIds = new Set(existingLegs.map((l) => l.externalDealId));

    const newDeals = data.deals.filter((d) => !existingDealIds.has(String(d.deal_id)));
    if (newDeals.length > 0) {
      await withAsyncTransaction(async () => {
        for (const deal of newDeals) {
          const legType = deal.entry === 'in' ? 'ENTRY' : 'EXIT';
          await db.insert(tradeLegs).values({
            id: nanoid(),
            tradeId,
            legType,
            timestampUtc: deal.time_utc,
            price: deal.price,
            volumeLots: deal.volume,
            commission: deal.commission,
            swap: deal.swap,
            brokerProfit: legType === 'EXIT' ? deal.profit : null,
            externalDealId: String(deal.deal_id),
            notes: deal.comment || null,
            createdAtUtc: now,
          });
          newLegsAdded++;
        }
      });
    }
  }

  if (newLegsAdded > 0 || existing.length === 0) {
    await recomputeTrade(tradeId);
  }

  // Fetch final trade state for broadcast
  const finalRow = await getDb().select({
    status: trades.status, netPnl: trades.netPnl, netPips: trades.netPips,
  }).from(trades).where(eq(trades.id, tradeId));
  const finalTrade = finalRow[0];

  const verb = existing.length === 0 ? 'Imported' : 'Updated';
  return {
    message: `${verb} MT5 position ${positionId} (${symbol} ${direction}, ${newLegsAdded} new legs)`,
    trade: {
      symbol,
      direction,
      netPips: finalTrade?.netPips ?? null,
      netPnl: finalTrade?.netPnl ?? null,
      status: ((finalTrade?.status ?? 'OPEN').toLowerCase()) as 'open' | 'closed',
    },
    tradeId,
    accountId,
  };
}

// ─────────────────────────────────────────────────────────────
// P&L recompute helper
// ─────────────────────────────────────────────────────────────

async function recomputeTrade(tradeId: string): Promise<void> {
  const db = getDb();
  const tradeRows = await db.select().from(trades).where(eq(trades.id, tradeId));
  if (tradeRows.length === 0) return;

  const trade = tradeRows[0];
  const legRows = await db.select().from(tradeLegs).where(eq(tradeLegs.tradeId, tradeId));

  const instrument = await getInstrument(trade.symbol);
  if (!instrument || !instrument.pipSize || instrument.pipSize <= 0) return;

  try {
    const metrics = computeTradeMetrics(
      {
        id: trade.id,
        account_id: trade.accountId,
        symbol: trade.symbol,
        direction: trade.direction as 'LONG' | 'SHORT',
        status: trade.status as 'OPEN' | 'PARTIAL' | 'CLOSED' | 'CANCELLED',
        initial_stop_price: trade.initialStopPrice ?? null,
        initial_target_price: trade.initialTargetPrice ?? null,
      },
      legRows.map((l) => ({
        id: l.id,
        trade_id: l.tradeId,
        leg_type: l.legType as 'ENTRY' | 'EXIT',
        timestamp_utc: l.timestampUtc,
        price: l.price,
        volume_lots: l.volumeLots,
        commission: l.commission,
        swap: l.swap,
        broker_profit: l.brokerProfit ?? null,
      })),
      instrument,
    );

    await updateTrade(tradeId, {
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
      openedAtUtc: metrics.openedAtUtc ?? trade.openedAtUtc,
      closedAtUtc: metrics.closedAtUtc ?? null,
    });
  } catch (err) {
    log.error(`bridge-watcher: P&L recompute failed for ${tradeId}`, err);
  }
}

// ─────────────────────────────────────────────────────────────
// File processor dispatcher
// ─────────────────────────────────────────────────────────────

async function processFile(filePath: string, dataDir: string): Promise<void> {
  const filename = basename(filePath);
  const processedDir = join(dataDir, 'bridge', 'processed', format(new Date(), 'yyyy-MM-dd'));
  const failedDir = join(dataDir, 'bridge', 'failed');

  mkdirSync(processedDir, { recursive: true });
  mkdirSync(failedDir, { recursive: true });

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const json = JSON.parse(raw);

    let result: ProcessResult;
    if (json.platform === 'MT5') {
      result = await processMt5File(json as MT5BridgeFile);
    } else {
      result = await processMt4File(json as MT4BridgeFile, dataDir);
    }

    // Move to processed
    renameSync(filePath, join(processedDir, filename));
    log.info(`bridge-watcher: ${result.message}`);

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
      log.warn('bridge-watcher: failed to record bridge_files entry', dbErr);
    }

    broadcastEvent({
      message: result.message,
      variant: 'success',
      ...(result.trade ? { trade: result.trade } : {}),
    });
  } catch (err) {
    const errMsg = String(err);
    log.error(`bridge-watcher: failed to process ${filename}`, err);

    // Save error annotation alongside the failed file
    try {
      writeFileSync(
        join(failedDir, `${filename}.error.txt`),
        `${new Date().toISOString()}\n${errMsg}`,
      );
      renameSync(filePath, join(failedDir, filename));
    } catch {
      // If rename itself fails, just leave the file in inbox
    }

    // Record failure in bridge_files
    try {
      await getDb()
        .insert(bridgeFiles)
        .values({
          filename,
          status: 'FAILED',
          accountId: null,
          tradeId: null,
          errorMessage: errMsg.slice(0, 500),
          processedAtUtc: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: bridgeFiles.filename,
          set: {
            status: 'FAILED',
            errorMessage: errMsg.slice(0, 500),
            processedAtUtc: new Date().toISOString(),
          },
        });
    } catch (dbErr) {
      log.warn('bridge-watcher: failed to record bridge_files failure entry', dbErr);
    }

    broadcastEvent({ message: `Bridge error: ${errMsg.slice(0, 120)}`, variant: 'error' });
  }
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Starts a chokidar watcher on <dataDir>/bridge/inbox/.
 * Safe to call before any windows are open — notifications are
 * sent to whatever windows exist at the time of each file event.
 */
export async function startBridgeWatcher(dataDir: string): Promise<void> {
  const inboxDir = join(dataDir, 'bridge', 'inbox');
  mkdirSync(inboxDir, { recursive: true });

  if (_watcher) {
    await _watcher.close();
    _watcher = null;
  }

  _watcher = chokidar.watch(inboxDir, {
    persistent: true,
    ignoreInitial: false, // Process any files dropped while app was closed
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
    // Only watch JSON files (the EA writes .json.tmp then renames to .json)
    ignored: /\.tmp$/,
  });

  _watcher.on('add', async (filePath: string) => {
    if (!filePath.endsWith('.json')) return;
    // Small delay to ensure the file is fully written (belt-and-suspenders
    // on top of awaitWriteFinish for network drives/slow disks).
    await new Promise((r) => setTimeout(r, 200));
    await processFile(filePath, dataDir);
  });

  _watcher.on('error', (err: unknown) => {
    log.error('bridge-watcher: chokidar error', err);
  });

  log.info(`bridge-watcher: watching ${inboxDir}`);
}

/**
 * Gracefully closes the file watcher. Called from `app.on('will-quit')`.
 */
export async function stopBridgeWatcher(): Promise<void> {
  if (_watcher) {
    await _watcher.close();
    _watcher = null;
    log.info('bridge-watcher: stopped');
  }
}
