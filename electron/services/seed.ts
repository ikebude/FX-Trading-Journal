/**
 * Ledger — First-run sample data seed
 *
 * Creates a demo account and 15 realistic sample trades so new users
 * arrive at a populated dashboard rather than an empty screen.
 *
 * Called exactly once from main.ts when config.first_run_complete === false.
 * The isSample flag on every inserted row allows users to delete all sample
 * data in one click via Settings → Clear Sample Trades.
 *
 * Hard rules respected:
 *  - All inserts via Drizzle (R6)
 *  - All timestamps are UTC ISO-8601 strings (R2)
 *  - No P&L math here — computeTradeMetrics() computes everything (R3)
 */

import log from 'electron-log/main.js';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';

import { getDb } from '../../src/lib/db/client';
import { accounts, instruments, trades, tradeLegs } from '../../src/lib/db/schema';
import { computeTradeMetrics } from '../../src/lib/pnl';
import { detectSession } from '../../src/lib/tz';

// ─────────────────────────────────────────────────────────────
// Sample trade definitions
// ─────────────────────────────────────────────────────────────

interface SampleTrade {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  openTime: string;
  closeTime: string;
  entryPrice: number;
  exitPrice: number;
  volume: number;
  commission: number;
  swap: number;
  profit: number;
  stopLoss: number;
  takeProfit: number;
  setupName: string;
  entryModel: 'LIMIT' | 'MARKET' | 'STOP_ENTRY' | 'ON_RETEST';
  confidence: number;
}

const SAMPLE_TRADES: SampleTrade[] = [
  // Wins
  { symbol: 'EURUSD', direction: 'LONG',  openTime: '2024-03-04T08:10:00Z', closeTime: '2024-03-04T11:45:00Z', entryPrice: 1.08420, exitPrice: 1.09050, volume: 0.10, commission: -3.00, swap: 0, profit: 63.00, stopLoss: 1.08100, takeProfit: 1.09150, setupName: 'London Open Breakout', entryModel: 'LIMIT', confidence: 5 },
  { symbol: 'GBPUSD', direction: 'LONG',  openTime: '2024-03-05T09:30:00Z', closeTime: '2024-03-05T14:20:00Z', entryPrice: 1.26800, exitPrice: 1.27400, volume: 0.05, commission: -2.50, swap: 0, profit: 30.00, stopLoss: 1.26400, takeProfit: 1.27600, setupName: 'NY AM Continuation', entryModel: 'ON_RETEST', confidence: 4 },
  { symbol: 'USDJPY', direction: 'SHORT', openTime: '2024-03-06T13:15:00Z', closeTime: '2024-03-06T15:50:00Z', entryPrice: 150.200, exitPrice: 149.500, volume: 0.10, commission: -3.00, swap: 0, profit: 47.00, stopLoss: 150.700, takeProfit: 149.200, setupName: 'NY PM Reversal', entryModel: 'LIMIT', confidence: 4 },
  { symbol: 'EURUSD', direction: 'LONG',  openTime: '2024-03-07T08:05:00Z', closeTime: '2024-03-07T10:30:00Z', entryPrice: 1.09100, exitPrice: 1.09480, volume: 0.15, commission: -4.50, swap: 0, profit: 57.00, stopLoss: 1.08800, takeProfit: 1.09700, setupName: 'London Open Breakout', entryModel: 'LIMIT', confidence: 5 },
  { symbol: 'GBPJPY', direction: 'LONG',  openTime: '2024-03-11T08:20:00Z', closeTime: '2024-03-11T12:00:00Z', entryPrice: 190.500, exitPrice: 191.800, volume: 0.05, commission: -3.00, swap: 0, profit: 43.00, stopLoss: 189.800, takeProfit: 192.100, setupName: 'London Session Trend', entryModel: 'STOP_ENTRY', confidence: 3 },
  { symbol: 'EURUSD', direction: 'SHORT', openTime: '2024-03-12T13:00:00Z', closeTime: '2024-03-12T15:45:00Z', entryPrice: 1.09350, exitPrice: 1.08900, volume: 0.10, commission: -3.00, swap: 0, profit: 45.00, stopLoss: 1.09650, takeProfit: 1.08700, setupName: 'NY PM Reversal', entryModel: 'LIMIT', confidence: 4 },
  { symbol: 'AUDUSD', direction: 'LONG',  openTime: '2024-03-13T08:45:00Z', closeTime: '2024-03-13T11:15:00Z', entryPrice: 0.65800, exitPrice: 0.66200, volume: 0.10, commission: -3.00, swap: 0, profit: 40.00, stopLoss: 0.65500, takeProfit: 0.66500, setupName: 'London Open Breakout', entryModel: 'MARKET', confidence: 3 },
  { symbol: 'NZDUSD', direction: 'LONG',  openTime: '2024-03-14T09:10:00Z', closeTime: '2024-03-14T13:50:00Z', entryPrice: 0.61500, exitPrice: 0.61900, volume: 0.10, commission: -3.00, swap: 0, profit: 40.00, stopLoss: 0.61200, takeProfit: 0.62100, setupName: 'NY AM Continuation', entryModel: 'ON_RETEST', confidence: 4 },
  // Losses
  { symbol: 'GBPUSD', direction: 'SHORT', openTime: '2024-03-08T09:05:00Z', closeTime: '2024-03-08T10:50:00Z', entryPrice: 1.27800, exitPrice: 1.28200, volume: 0.10, commission: -3.00, swap: 0, profit: -40.00, stopLoss: 1.28200, takeProfit: 1.26900, setupName: 'NY AM Continuation', entryModel: 'LIMIT', confidence: 3 },
  { symbol: 'USDJPY', direction: 'LONG',  openTime: '2024-03-08T13:30:00Z', closeTime: '2024-03-08T15:00:00Z', entryPrice: 149.800, exitPrice: 149.300, volume: 0.10, commission: -3.00, swap: 0, profit: -33.00, stopLoss: 149.300, takeProfit: 151.000, setupName: 'NY PM Reversal', entryModel: 'MARKET', confidence: 2 },
  { symbol: 'EURUSD', direction: 'SHORT', openTime: '2024-03-18T08:30:00Z', closeTime: '2024-03-18T09:45:00Z', entryPrice: 1.08900, exitPrice: 1.09250, volume: 0.10, commission: -3.00, swap: 0, profit: -35.00, stopLoss: 1.09250, takeProfit: 1.08300, setupName: 'London Open Breakout', entryModel: 'LIMIT', confidence: 4 },
  { symbol: 'GBPJPY', direction: 'SHORT', openTime: '2024-03-19T13:15:00Z', closeTime: '2024-03-19T15:30:00Z', entryPrice: 191.200, exitPrice: 191.900, volume: 0.05, commission: -3.00, swap: 0, profit: -25.00, stopLoss: 191.900, takeProfit: 189.800, setupName: 'NY PM Reversal', entryModel: 'LIMIT', confidence: 3 },
  // Breakeven / small loss
  { symbol: 'EURUSD', direction: 'LONG',  openTime: '2024-03-15T08:15:00Z', closeTime: '2024-03-15T09:30:00Z', entryPrice: 1.08700, exitPrice: 1.08710, volume: 0.10, commission: -3.00, swap: 0, profit: 1.00, stopLoss: 1.08400, takeProfit: 1.09200, setupName: 'London Open Breakout', entryModel: 'LIMIT', confidence: 4 },
  // Recent open trade
  { symbol: 'EURUSD', direction: 'LONG',  openTime: '2024-03-20T08:30:00Z', closeTime: '', entryPrice: 1.08550, exitPrice: 0, volume: 0.10, commission: -3.00, swap: 0, profit: 0, stopLoss: 1.08200, takeProfit: 1.09100, setupName: 'London Open Breakout', entryModel: 'LIMIT', confidence: 5 },
  { symbol: 'USDJPY', direction: 'SHORT', openTime: '2024-03-20T13:00:00Z', closeTime: '', entryPrice: 150.100, exitPrice: 0, volume: 0.05, commission: -2.00, swap: 0, profit: 0, stopLoss: 150.600, takeProfit: 149.000, setupName: 'NY PM Reversal', entryModel: 'LIMIT', confidence: 3 },
];

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export async function seedSampleData(): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  // Guard: if any accounts already exist, skip seeding (re-run protection)
  const existingAccounts = await db.select({ id: accounts.id }).from(accounts).limit(1);
  if (existingAccounts.length > 0) {
    log.info('seed: accounts exist — skipping sample data');
    return;
  }

  log.info('seed: populating sample data for first-run demo');

  // ── 1. Create demo account ────────────────────────────────
  const accountId = nanoid();
  await db.insert(accounts).values({
    id: accountId,
    name: 'Demo Account',
    broker: 'FTMO',
    accountCurrency: 'USD',
    initialBalance: 10000,
    accountType: 'DEMO',
    displayColor: '#3b82f6',
    isActive: true,
    openedAtUtc: '2024-01-01T00:00:00.000Z',
    propDailyLossLimit: null,
    propDailyLossPct: null,
    propMaxDrawdown: null,
    propMaxDrawdownPct: null,
    propDrawdownType: null,
    propProfitTarget: null,
    propProfitTargetPct: null,
    propPhase: null,
    createdAtUtc: now,
    updatedAtUtc: now,
  });

  // ── 2. Ensure standard instruments exist ──────────────────
  const instrumentDefs: Array<Parameters<typeof db.insert>[0] extends typeof instruments ? never : { symbol: string; displayName: string; pipSize: number; contractSize: number; digits: number; assetClass: 'FOREX'; baseCurrency: string; quoteCurrency: string }> = [
    { symbol: 'EURUSD', displayName: 'EUR/USD', pipSize: 0.0001, contractSize: 100000, digits: 5, assetClass: 'FOREX' as const, baseCurrency: 'EUR', quoteCurrency: 'USD' },
    { symbol: 'GBPUSD', displayName: 'GBP/USD', pipSize: 0.0001, contractSize: 100000, digits: 5, assetClass: 'FOREX' as const, baseCurrency: 'GBP', quoteCurrency: 'USD' },
    { symbol: 'USDJPY', displayName: 'USD/JPY', pipSize: 0.01,   contractSize: 100000, digits: 3, assetClass: 'FOREX' as const, baseCurrency: 'USD', quoteCurrency: 'JPY' },
    { symbol: 'GBPJPY', displayName: 'GBP/JPY', pipSize: 0.01,   contractSize: 100000, digits: 3, assetClass: 'FOREX' as const, baseCurrency: 'GBP', quoteCurrency: 'JPY' },
    { symbol: 'AUDUSD', displayName: 'AUD/USD', pipSize: 0.0001, contractSize: 100000, digits: 5, assetClass: 'FOREX' as const, baseCurrency: 'AUD', quoteCurrency: 'USD' },
    { symbol: 'NZDUSD', displayName: 'NZD/USD', pipSize: 0.0001, contractSize: 100000, digits: 5, assetClass: 'FOREX' as const, baseCurrency: 'NZD', quoteCurrency: 'USD' },
  ];

  for (const inst of instrumentDefs) {
    await db.insert(instruments).values({
      symbol: inst.symbol,
      displayName: inst.displayName,
      pipSize: inst.pipSize,
      contractSize: inst.contractSize,
      digits: inst.digits,
      assetClass: inst.assetClass,
      baseCurrency: inst.baseCurrency,
      quoteCurrency: inst.quoteCurrency,
      isActive: true,
    }).onConflictDoNothing();
  }

  // ── 3. Fetch all instruments for P&L computation ──────────
  const allInstruments = await db.select().from(instruments);
  const instrMap = new Map(allInstruments.map((i) => [i.symbol, i]));

  // ── 4. Insert sample trades ───────────────────────────────
  for (const s of SAMPLE_TRADES) {
    const tradeId = nanoid();
    const isOpen = !s.closeTime;
    const session = detectSession(new Date(s.openTime));

    // Build legs
    const entryLeg = {
      id: nanoid(),
      tradeId,
      legType: 'ENTRY' as const,
      timestampUtc: s.openTime,
      price: s.entryPrice,
      volumeLots: s.volume,
      commission: 0,
      swap: 0,
      brokerProfit: null as number | null,
      externalDealId: null as string | null,
      notes: null as string | null,
      createdAtUtc: now,
    };

    const exitLeg = isOpen ? null : {
      id: nanoid(),
      tradeId,
      legType: 'EXIT' as const,
      timestampUtc: s.closeTime,
      price: s.exitPrice,
      volumeLots: s.volume,
      commission: s.commission,
      swap: s.swap,
      brokerProfit: s.profit,
      externalDealId: null as string | null,
      notes: null as string | null,
      createdAtUtc: now,
    };

    // Compute P&L via the P&L engine
    const instrument = instrMap.get(s.symbol);
    let metrics: Awaited<ReturnType<typeof computeTradeMetrics>> | null = null;
    if (instrument && instrument.pipSize && instrument.pipSize > 0) {
      try {
        metrics = computeTradeMetrics(
          { id: tradeId, account_id: accountId, symbol: s.symbol, direction: s.direction, status: isOpen ? 'OPEN' : 'CLOSED', initial_stop_price: s.stopLoss, initial_target_price: s.takeProfit },
          [
            { id: entryLeg.id, trade_id: tradeId, leg_type: 'ENTRY', timestamp_utc: s.openTime, price: s.entryPrice, volume_lots: s.volume, commission: 0, swap: 0, broker_profit: null },
            ...(exitLeg ? [{ id: exitLeg.id, trade_id: tradeId, leg_type: 'EXIT' as const, timestamp_utc: s.closeTime, price: s.exitPrice, volume_lots: s.volume, commission: s.commission, swap: s.swap, broker_profit: s.profit }] : []),
          ],
          instrument,
        );
      } catch (err) {
        log.warn(`seed: P&L compute failed for ${s.symbol} trade`, err);
      }
    }

    await db.insert(trades).values({
      id: tradeId,
      accountId,
      symbol: s.symbol,
      direction: s.direction,
      status: metrics?.status ?? (isOpen ? 'OPEN' : 'CLOSED'),
      initialStopPrice: s.stopLoss,
      initialTargetPrice: s.takeProfit,
      source: 'MANUAL',
      session,
      setupName: s.setupName,
      entryModel: s.entryModel,
      confidence: s.confidence,
      preTradeEmotion: 'CALM',
      postTradeEmotion: isOpen ? null : (s.profit >= 0 ? 'SATISFIED' : 'DISAPPOINTED'),
      openedAtUtc: s.openTime,
      closedAtUtc: isOpen ? null : s.closeTime,
      netPnl: metrics?.netPnl ?? null,
      netPips: metrics?.netPips ?? null,
      rMultiple: metrics?.rMultiple ?? null,
      totalCommission: metrics?.totalCommission ?? s.commission,
      totalSwap: metrics?.totalSwap ?? s.swap,
      weightedAvgEntry: metrics?.weightedAvgEntry ?? s.entryPrice,
      weightedAvgExit: isOpen ? null : (metrics?.weightedAvgExit ?? s.exitPrice),
      totalEntryVolume: s.volume,
      totalExitVolume: isOpen ? 0 : s.volume,
      externalTicket: null,
      externalPositionId: null,
      marketCondition: 'TRENDING',
      plannedRr: null,
      plannedRiskAmount: null,
      plannedRiskPct: null,
      deletedAtUtc: null,
      isSample: true,
      createdAtUtc: now,
      updatedAtUtc: now,
    });

    await db.insert(tradeLegs).values(entryLeg);
    if (exitLeg) {
      await db.insert(tradeLegs).values(exitLeg);
    }
  }

  log.info(`seed: inserted ${SAMPLE_TRADES.length} sample trades for account ${accountId}`);
}
