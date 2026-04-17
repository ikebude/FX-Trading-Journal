/**
 * Ledger — P&L engine
 *
 * The single source of truth for all trade math.
 * No P&L computation may live anywhere else in the application.
 *
 * Hard rules:
 * - pip_size always comes from the instrument record, never hardcoded.
 * - All money values are in the account currency.
 * - All timestamps are UTC ISO-8601 strings.
 * - Functions are pure: no I/O, no DB access, no globals.
 */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

// T4-1: Import Instrument from schema.ts — single source of truth.
// The local definition was a hand-written subset that could silently diverge
// from the DB schema whenever the instruments table changed.
export type { Instrument } from './db/schema';
import type { Instrument } from './db/schema';
import { dayOfWeekInTz, hourOfDayInTz } from './tz';

export type Direction = 'LONG' | 'SHORT';
export type LegType = 'ENTRY' | 'EXIT';
export type TradeStatus = 'OPEN' | 'PARTIAL' | 'CLOSED' | 'CANCELLED';
export type TradeResult = 'WIN' | 'LOSS' | 'BREAKEVEN';

export interface Trade {
  id: string;
  account_id: string;
  symbol: string;
  direction: Direction;
  status: TradeStatus;
  initial_stop_price: number | null;
  initial_target_price: number | null;
  // Optional enrichment fields used by widget aggregators
  setup_name?: string | null;
  session?: string | null;
  confidence?: number | null;
}

export interface TradeLeg {
  id: string;
  trade_id: string;
  leg_type: LegType;
  timestamp_utc: string;
  price: number;
  volume_lots: number;
  commission: number;
  swap: number;
  broker_profit: number | null;
}

export interface TradeMetrics {
  status: TradeStatus;
  result: TradeResult | null;
  weightedAvgEntry: number | null;
  weightedAvgExit: number | null;
  netPips: number | null;
  netPnl: number | null;
  rMultiple: number | null;
  totalEntryVolume: number;
  totalExitVolume: number;
  remainingVolume: number;
  totalCommission: number;
  totalSwap: number;
  holdingTimeMs: number | null;
  openedAtUtc: string | null;
  closedAtUtc: string | null;
}

export interface ComputeOptions {
  /** Tolerance for breakeven classification, as a fraction of |1R|. Default 0.1 */
  breakevenTolerance?: number;
}

// ─────────────────────────────────────────────────────────────
// Per-trade metrics
// ─────────────────────────────────────────────────────────────

export function computeTradeMetrics(
  trade: Trade,
  legs: TradeLeg[],
  instrument: Instrument,
  opts: ComputeOptions = {},
): TradeMetrics {
  const breakevenTolerance = opts.breakevenTolerance ?? 0.1;

  // T2-2: Guard against zero or negative pip_size — would produce Infinity/NaN
  // that propagates into the DB and corrupts all downstream analytics.
  if (!instrument.pipSize || instrument.pipSize <= 0) {
    throw new Error(
      `Invalid pip_size for ${instrument.symbol}: ${instrument.pipSize}. ` +
        `Check the instruments seed data.`,
    );
  }

  const entries = legs
    .filter((l) => l.leg_type === 'ENTRY')
    .sort((a, b) => a.timestamp_utc.localeCompare(b.timestamp_utc));
  const exits = legs
    .filter((l) => l.leg_type === 'EXIT')
    .sort((a, b) => a.timestamp_utc.localeCompare(b.timestamp_utc));

  const totalEntryVolume = sum(entries.map((l) => l.volume_lots));
  const totalExitVolume = sum(exits.map((l) => l.volume_lots));
  const remainingVolume = round(totalEntryVolume - totalExitVolume, 4);

  const totalCommission =
    sum(entries.map((l) => l.commission)) + sum(exits.map((l) => l.commission));
  const totalSwap =
    sum(entries.map((l) => l.swap)) + sum(exits.map((l) => l.swap));

  const openedAtUtc = entries.length > 0 ? entries[0].timestamp_utc : null;
  const closedAtUtc =
    totalExitVolume > 0 && remainingVolume <= 0
      ? exits[exits.length - 1].timestamp_utc
      : null;
  const holdingTimeMs =
    openedAtUtc && closedAtUtc
      ? new Date(closedAtUtc).getTime() - new Date(openedAtUtc).getTime()
      : null;

  // Status
  let status: TradeStatus;
  if (trade.status === 'CANCELLED') {
    status = 'CANCELLED';
  } else if (totalExitVolume === 0) {
    status = 'OPEN';
  } else if (remainingVolume > 0) {
    status = 'PARTIAL';
  } else {
    status = 'CLOSED';
  }

  // Weighted averages
  const weightedAvgEntry =
    totalEntryVolume > 0
      ? sum(entries.map((l) => l.price * l.volume_lots)) / totalEntryVolume
      : null;
  const weightedAvgExit =
    totalExitVolume > 0
      ? sum(exits.map((l) => l.price * l.volume_lots)) / totalExitVolume
      : null;

  // Net pips (only meaningful when there's at least one exit)
  let netPips: number | null = null;
  if (weightedAvgEntry !== null && weightedAvgExit !== null) {
    const priceDiff =
      trade.direction === 'LONG'
        ? weightedAvgExit - weightedAvgEntry
        : weightedAvgEntry - weightedAvgExit;
    netPips = priceDiff / instrument.pipSize;
  }

  // Net P&L
  let netPnl: number | null = null;
  if (totalExitVolume > 0) {
    // T2-1: Only require EXIT legs to have broker_profit. MT5 statements supply
    // profit only on exit deals — entry legs always have null broker_profit.
    // The old code checked ALL legs: any null (entry leg) → fell back to computed,
    // silently discarding the broker-supplied profit from exit legs.
    const exitBrokerProfits = exits.map((l) => l.broker_profit);
    const brokerProfit =
      exitBrokerProfits.every((p) => p !== null)
        ? exitBrokerProfits.reduce<number>((a, b) => a + b!, 0)
        : null;
    if (brokerProfit !== null) {
      // Broker supplied per-exit-leg profit — use it as the source of truth.
      netPnl = brokerProfit + totalCommission + totalSwap;
    } else if (weightedAvgEntry !== null && weightedAvgExit !== null) {
      // Compute from price diff × closed volume × contract size.
      const priceDiff =
        trade.direction === 'LONG'
          ? weightedAvgExit - weightedAvgEntry
          : weightedAvgEntry - weightedAvgExit;
      netPnl =
        priceDiff * totalExitVolume * instrument.contractSize +
        totalCommission +
        totalSwap;
    }
  }

  // R-multiple
  let rMultiple: number | null = null;
  if (
    weightedAvgEntry !== null &&
    weightedAvgExit !== null &&
    trade.initial_stop_price !== null &&
    trade.initial_stop_price !== undefined
  ) {
    const riskDistance =
      trade.direction === 'LONG'
        ? weightedAvgEntry - trade.initial_stop_price
        : trade.initial_stop_price - weightedAvgEntry;
    if (riskDistance > 0) {
      const rewardDistance =
        trade.direction === 'LONG'
          ? weightedAvgExit - weightedAvgEntry
          : weightedAvgEntry - weightedAvgExit;
      rMultiple = rewardDistance / riskDistance;
    } else {
      // T2-4: Log when stop is on the wrong side of entry (inverted stop).
      // This is a data-entry error — surface it rather than silently returning null R.
      console.warn(`[pnl] Trade ${trade.id}: inverted stop — stop is on wrong side of entry (direction=${trade.direction}). rMultiple will be null.`);
    }
  }

  // Result classification
  let result: TradeResult | null = null;
  if (status === 'CLOSED' && netPnl !== null) {
    if (rMultiple !== null) {
      if (Math.abs(rMultiple) <= breakevenTolerance) {
        result = 'BREAKEVEN';
      } else {
        result = rMultiple > 0 ? 'WIN' : 'LOSS';
      }
    } else {
      // No R-multiple available; classify by raw P&L.
      if (netPnl > 0) result = 'WIN';
      else if (netPnl < 0) result = 'LOSS';
      else result = 'BREAKEVEN';
    }
  }

  return {
    status,
    result,
    weightedAvgEntry,
    weightedAvgExit,
    netPips,
    netPnl,
    rMultiple,
    totalEntryVolume,
    totalExitVolume,
    remainingVolume,
    totalCommission,
    totalSwap,
    holdingTimeMs,
    openedAtUtc,
    closedAtUtc,
  };
}

// ─────────────────────────────────────────────────────────────
// Aggregate metrics across many trades
// ─────────────────────────────────────────────────────────────

export interface AggregateMetrics {
  totalTrades: number;
  closedTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number;
  netPnl: number;
  averageR: number | null;
  expectancy: number | null;
  profitFactor: number | null;
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpePerTrade: number | null;
  equityCurve: EquityPoint[];
}

export interface EquityPoint {
  timestamp: string;
  equity: number;
  drawdown: number;
  drawdownPct: number;
}

export interface TradeBundle {
  trade: Trade;
  legs: TradeLeg[];
  instrument: Instrument;
}

export function computeAggregateMetrics(
  bundles: TradeBundle[],
  startingBalance: number,
): AggregateMetrics {
  const computed = bundles.map((b) => ({
    metrics: computeTradeMetrics(b.trade, b.legs, b.instrument),
    bundle: b,
  }));

  const closed = computed.filter((c) => c.metrics.status === 'CLOSED');
  const totalTrades = computed.length;
  const closedTrades = closed.length;

  const wins = closed.filter((c) => c.metrics.result === 'WIN').length;
  const losses = closed.filter((c) => c.metrics.result === 'LOSS').length;
  const breakevens = closed.filter((c) => c.metrics.result === 'BREAKEVEN').length;
  const winRate = closedTrades > 0 ? wins / closedTrades : 0;

  const netPnl = sum(closed.map((c) => c.metrics.netPnl ?? 0));

  const rValues = closed
    .map((c) => c.metrics.rMultiple)
    .filter((r): r is number => r !== null);
  const averageR =
    rValues.length > 0 ? sum(rValues) / rValues.length : null;
  const expectancy = averageR; // Same definition; provided as a separate name for UI clarity.

  const winningPnl = sum(
    closed
      .filter((c) => (c.metrics.netPnl ?? 0) > 0)
      .map((c) => c.metrics.netPnl ?? 0),
  );
  const losingPnl = sum(
    closed
      .filter((c) => (c.metrics.netPnl ?? 0) < 0)
      .map((c) => c.metrics.netPnl ?? 0),
  );
  let profitFactor: number | null;
  if (losingPnl === 0 && winningPnl === 0) {
    profitFactor = null;
  } else if (losingPnl === 0) {
    profitFactor = Number.POSITIVE_INFINITY;
  } else {
    profitFactor = winningPnl / Math.abs(losingPnl);
  }

  // Equity curve — one point per closed trade, in chronological order.
  // T2-3: Tie-break on openedAtUtc then trade id so that two trades closing at
  // the same second are always ordered the same way regardless of iteration order.
  const ordered = closed
    .filter((c) => c.metrics.closedAtUtc !== null)
    .sort((a, b) => {
      const byClose = (a.metrics.closedAtUtc ?? '').localeCompare(
        b.metrics.closedAtUtc ?? '',
      );
      if (byClose !== 0) return byClose;
      const byOpen = (a.metrics.openedAtUtc ?? '').localeCompare(
        b.metrics.openedAtUtc ?? '',
      );
      if (byOpen !== 0) return byOpen;
      return a.bundle.trade.id.localeCompare(b.bundle.trade.id);
    });

  const equityCurve: EquityPoint[] = [];
  let runningEquity = startingBalance;
  let peakEquity = startingBalance;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;

  for (const c of ordered) {
    runningEquity += c.metrics.netPnl ?? 0;
    if (runningEquity > peakEquity) peakEquity = runningEquity;
    const drawdown = peakEquity - runningEquity;
    const drawdownPct = peakEquity > 0 ? (drawdown / peakEquity) * 100 : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    if (drawdownPct > maxDrawdownPct) maxDrawdownPct = drawdownPct;
    equityCurve.push({
      timestamp: c.metrics.closedAtUtc!,
      equity: runningEquity,
      drawdown,
      drawdownPct,
    });
  }

  // Sharpe per trade — mean / stdev × sqrt(N)
  const tradeReturns = ordered.map((c) => c.metrics.netPnl ?? 0);
  let sharpePerTrade: number | null = null;
  if (tradeReturns.length > 1) {
    const mean = sum(tradeReturns) / tradeReturns.length;
    const variance =
      sum(tradeReturns.map((r) => (r - mean) ** 2)) / (tradeReturns.length - 1);
    const stdev = Math.sqrt(variance);
    sharpePerTrade =
      stdev > 0 ? (mean / stdev) * Math.sqrt(tradeReturns.length) : null;
  }

  return {
    totalTrades,
    closedTrades,
    wins,
    losses,
    breakevens,
    winRate,
    netPnl,
    averageR,
    expectancy,
    profitFactor,
    maxDrawdown,
    maxDrawdownPct,
    sharpePerTrade,
    equityCurve,
  };
}

// ─────────────────────────────────────────────────────────────
// Widget aggregation helpers — all pure, tested independently
// ─────────────────────────────────────────────────────────────

export interface RBucket {
  label: string;
  min: number;
  max: number;
  count: number;
}

/** R-multiple distribution in 0.5R bins from -4 to +5 (plus overflow buckets). */
export function computeRDistribution(bundles: TradeBundle[]): RBucket[] {
  const buckets: RBucket[] = [];
  for (let min = -4; min < 5; min += 0.5) {
    const max = min + 0.5;
    buckets.push({
      label: min >= 0 ? `+${min.toFixed(1)}R` : `${min.toFixed(1)}R`,
      min,
      max,
      count: 0,
    });
  }
  const underflowBucket: RBucket = { label: '<-4R', min: -Infinity, max: -4, count: 0 };
  const overflowBucket: RBucket = { label: '>+5R', min: 5, max: Infinity, count: 0 };

  for (const b of bundles) {
    const m = computeTradeMetrics(b.trade, b.legs, b.instrument);
    if (m.rMultiple === null || m.status !== 'CLOSED') continue;
    if (m.rMultiple < -4) { underflowBucket.count++; continue; }
    if (m.rMultiple >= 5) { overflowBucket.count++; continue; }
    const bucket = buckets.find((bk) => m.rMultiple! >= bk.min && m.rMultiple! < bk.max);
    if (bucket) bucket.count++;
  }

  const result = [underflowBucket, ...buckets, overflowBucket];
  return result.filter((bk) => bk.count > 0 || (bk.min >= -2 && bk.max <= 3));
}

export interface SetupPerformance {
  setup: string;
  avgR: number | null;
  netPnl: number;
  count: number;
  wins: number;
}

/** Average R-multiple per setup, sorted descending by avgR. */
export function computeSetupPerformance(bundles: TradeBundle[]): SetupPerformance[] {
  const map = new Map<string, { rs: number[]; pnl: number; count: number; wins: number }>();

  for (const b of bundles) {
    const m = computeTradeMetrics(b.trade, b.legs, b.instrument);
    if (m.status !== 'CLOSED') continue;
    const setup = b.trade.setup_name ?? '(no setup)';
    if (!map.has(setup)) map.set(setup, { rs: [], pnl: 0, count: 0, wins: 0 });
    const entry = map.get(setup)!;
    entry.count++;
    entry.pnl += m.netPnl ?? 0;
    if (m.rMultiple !== null) entry.rs.push(m.rMultiple);
    if (m.result === 'WIN') entry.wins++;
  }

  return [...map.entries()]
    .map(([setup, data]) => ({
      setup,
      avgR: data.rs.length > 0 ? sum(data.rs) / data.rs.length : null,
      netPnl: data.pnl,
      count: data.count,
      wins: data.wins,
    }))
    .sort((a, b) => (b.avgR ?? -Infinity) - (a.avgR ?? -Infinity));
}

export interface SessionPerformance {
  session: string;
  netPnl: number;
  count: number;
  wins: number;
  winRate: number;
}

const SESSION_ORDER = ['SYDNEY', 'TOKYO', 'ASIAN_RANGE', 'LONDON', 'NY_AM', 'LONDON_CLOSE', 'NY_PM', 'OFF_HOURS'];

/** Net P&L and win rate by trading session. */
export function computeSessionPerformance(bundles: TradeBundle[]): SessionPerformance[] {
  const map = new Map<string, { pnl: number; count: number; wins: number }>();

  for (const b of bundles) {
    const m = computeTradeMetrics(b.trade, b.legs, b.instrument);
    if (m.status !== 'CLOSED') continue;
    const session = b.trade.session ?? 'OFF_HOURS';
    if (!map.has(session)) map.set(session, { pnl: 0, count: 0, wins: 0 });
    const entry = map.get(session)!;
    entry.count++;
    entry.pnl += m.netPnl ?? 0;
    if (m.result === 'WIN') entry.wins++;
  }

  return SESSION_ORDER
    .filter((s) => map.has(s))
    .map((session) => {
      const d = map.get(session)!;
      return { session, netPnl: d.pnl, count: d.count, wins: d.wins, winRate: d.count > 0 ? d.wins / d.count : 0 };
    });
}

export interface DayHeatmapCell {
  dayIndex: number; // 0 = Sunday, 1 = Monday, …, 6 = Saturday
  dayName: string;
  netPnl: number;
  count: number;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** P&L by day of week (timestamps interpreted in displayTimezone). */
export function computeDayOfWeekHeatmap(
  bundles: TradeBundle[],
  displayTimezone: string,
): DayHeatmapCell[] {
  const map = new Map<number, { pnl: number; count: number }>();

  for (const b of bundles) {
    const m = computeTradeMetrics(b.trade, b.legs, b.instrument);
    if (m.status !== 'CLOSED' || !m.closedAtUtc) continue;
    // Use dayOfWeekInTz (formatInTimeZone-based) — avoids non-standard
    // Intl.DateTimeFormat locale string double-parse that fails on some V8 builds.
    const dow = dayOfWeekInTz(m.closedAtUtc, displayTimezone);
    if (!map.has(dow)) map.set(dow, { pnl: 0, count: 0 });
    const entry = map.get(dow)!;
    entry.pnl += m.netPnl ?? 0;
    entry.count++;
  }

  return [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    dayIndex: d,
    dayName: DAY_NAMES[d],
    netPnl: map.get(d)?.pnl ?? 0,
    count: map.get(d)?.count ?? 0,
  }));
}

export interface HourHeatmapCell {
  hour: number;
  netPnl: number;
  count: number;
}

/** P&L by hour of day (0–23, timestamps interpreted in displayTimezone). */
export function computeHourOfDayHeatmap(
  bundles: TradeBundle[],
  displayTimezone: string,
): HourHeatmapCell[] {
  const map = new Map<number, { pnl: number; count: number }>();

  for (const b of bundles) {
    const m = computeTradeMetrics(b.trade, b.legs, b.instrument);
    if (m.status !== 'CLOSED' || !m.closedAtUtc) continue;
    // Use hourOfDayInTz (formatInTimeZone 'H' format) — avoids Intl hour12:false
    // returning "24" for midnight on some V8 versions.
    const hour = hourOfDayInTz(m.closedAtUtc, displayTimezone);
    if (!map.has(hour)) map.set(hour, { pnl: 0, count: 0 });
    const entry = map.get(hour)!;
    entry.pnl += m.netPnl ?? 0;
    entry.count++;
  }

  return Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    netPnl: map.get(h)?.pnl ?? 0,
    count: map.get(h)?.count ?? 0,
  }));
}

export interface ConfidencePerformance {
  confidence: number;
  winRate: number;
  count: number;
  avgR: number | null;
}

/** Win rate by self-reported confidence (1–5). */
export function computeWinRateByConfidence(bundles: TradeBundle[]): ConfidencePerformance[] {
  const map = new Map<number, { wins: number; count: number; rs: number[] }>();

  for (const b of bundles) {
    const m = computeTradeMetrics(b.trade, b.legs, b.instrument);
    if (m.status !== 'CLOSED' || b.trade.confidence == null) continue;
    const c = b.trade.confidence;
    if (!map.has(c)) map.set(c, { wins: 0, count: 0, rs: [] });
    const entry = map.get(c)!;
    entry.count++;
    if (m.result === 'WIN') entry.wins++;
    if (m.rMultiple !== null) entry.rs.push(m.rMultiple);
  }

  return [1, 2, 3, 4, 5]
    .filter((c) => map.has(c))
    .map((c) => {
      const d = map.get(c)!;
      return {
        confidence: c,
        winRate: d.count > 0 ? d.wins / d.count : 0,
        count: d.count,
        avgR: d.rs.length > 0 ? sum(d.rs) / d.rs.length : null,
      };
    });
}

export interface HoldingTimeBucket {
  label: string;
  maxMinutes: number;
  count: number;
}

/** Holding time distribution (minutes) in log-scale-friendly buckets. */
export function computeHoldingTimeDistribution(bundles: TradeBundle[]): HoldingTimeBucket[] {
  // Buckets: <1m, 1-5m, 5-15m, 15-30m, 30m-1h, 1-4h, 4-8h, 8-24h, 24h-3d, >3d
  const BUCKETS: HoldingTimeBucket[] = [
    { label: '<1m', maxMinutes: 1, count: 0 },
    { label: '1-5m', maxMinutes: 5, count: 0 },
    { label: '5-15m', maxMinutes: 15, count: 0 },
    { label: '15-30m', maxMinutes: 30, count: 0 },
    { label: '30m-1h', maxMinutes: 60, count: 0 },
    { label: '1-4h', maxMinutes: 240, count: 0 },
    { label: '4-8h', maxMinutes: 480, count: 0 },
    { label: '8-24h', maxMinutes: 1440, count: 0 },
    { label: '1-3d', maxMinutes: 4320, count: 0 },
    { label: '>3d', maxMinutes: Infinity, count: 0 },
  ];

  for (const b of bundles) {
    const m = computeTradeMetrics(b.trade, b.legs, b.instrument);
    if (m.status !== 'CLOSED' || !m.openedAtUtc || !m.closedAtUtc) continue;
    const mins =
      (new Date(m.closedAtUtc).getTime() - new Date(m.openedAtUtc).getTime()) / 60000;
    const bucket = BUCKETS.find((bk) => mins < bk.maxMinutes);
    if (bucket) bucket.count++;
  }

  return BUCKETS.filter((bk) => bk.count > 0);
}

export interface CalendarHeatmapCell {
  date: string; // YYYY-MM-DD in display timezone
  netPnl: number;
  count: number;
}

/** Daily P&L cells for a calendar heatmap (like GitHub contribution graph). */
export function computeCalendarHeatmap(
  bundles: TradeBundle[],
  displayTimezone: string,
): CalendarHeatmapCell[] {
  const map = new Map<string, { pnl: number; count: number }>();

  for (const b of bundles) {
    const m = computeTradeMetrics(b.trade, b.legs, b.instrument);
    if (m.status !== 'CLOSED' || !m.closedAtUtc) continue;
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: displayTimezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(m.closedAtUtc)); // en-CA gives YYYY-MM-DD
    if (!map.has(date)) map.set(date, { pnl: 0, count: 0 });
    const entry = map.get(date)!;
    entry.pnl += m.netPnl ?? 0;
    entry.count++;
  }

  return [...map.entries()]
    .map(([date, d]) => ({ date, netPnl: d.pnl, count: d.count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface StreakInfo {
  currentStreak: number;
  currentIsWin: boolean;
  longestWinStreak: number;
  longestLossStreak: number;
  last20Results: Array<'WIN' | 'LOSS' | 'BREAKEVEN'>;
}

/** Win/loss streak information across chronologically ordered closed trades. */
export function computeStreakInfo(bundles: TradeBundle[]): StreakInfo {
  const closed = bundles
    .map((b) => ({ metrics: computeTradeMetrics(b.trade, b.legs, b.instrument) }))
    .filter((c) => c.metrics.status === 'CLOSED' && c.metrics.closedAtUtc !== null)
    .sort((a, b) => (a.metrics.closedAtUtc ?? '').localeCompare(b.metrics.closedAtUtc ?? ''));

  const results = closed.map((c) => c.metrics.result ?? 'BREAKEVEN');
  const last20Results = results.slice(-20) as Array<'WIN' | 'LOSS' | 'BREAKEVEN'>;

  let currentStreak = 0;
  let currentIsWin = true;
  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let curWin = 0;
  let curLoss = 0;

  for (const r of results) {
    if (r === 'WIN') {
      curWin++;
      curLoss = 0;
      if (curWin > longestWinStreak) longestWinStreak = curWin;
    } else if (r === 'LOSS') {
      curLoss++;
      curWin = 0;
      if (curLoss > longestLossStreak) longestLossStreak = curLoss;
    } else {
      curWin = 0;
      curLoss = 0;
    }
  }

  if (results.length > 0) {
    const last = results[results.length - 1];
    currentIsWin = last === 'WIN';
    if (last === 'WIN') currentStreak = curWin;
    else if (last === 'LOSS') currentStreak = curLoss;
    else currentStreak = 0;
  }

  return { currentStreak, currentIsWin, longestWinStreak, longestLossStreak, last20Results };
}

export interface MonthlyPnl {
  month: string; // YYYY-MM
  netPnl: number;
  count: number;
  wins: number;
}

/** Monthly net P&L for the last 12 months. */
export function computeMonthlyPnl(
  bundles: TradeBundle[],
  displayTimezone: string,
): MonthlyPnl[] {
  const map = new Map<string, { pnl: number; count: number; wins: number }>();

  for (const b of bundles) {
    const m = computeTradeMetrics(b.trade, b.legs, b.instrument);
    if (m.status !== 'CLOSED' || !m.closedAtUtc) continue;
    const month = new Intl.DateTimeFormat('en-CA', {
      timeZone: displayTimezone,
      year: 'numeric', month: '2-digit',
    }).format(new Date(m.closedAtUtc)).slice(0, 7); // YYYY-MM
    if (!map.has(month)) map.set(month, { pnl: 0, count: 0, wins: 0 });
    const entry = map.get(month)!;
    entry.pnl += m.netPnl ?? 0;
    entry.count++;
    if (m.result === 'WIN') entry.wins++;
  }

  return [...map.entries()]
    .map(([month, d]) => ({ month, netPnl: d.pnl, count: d.count, wins: d.wins }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12);
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function sum(xs: number[]): number {
  let total = 0;
  for (const x of xs) total += x;
  return total;
}

function round(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
