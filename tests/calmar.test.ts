import { describe, expect, it } from 'vitest';
import { computeAggregateMetrics, type Instrument } from '../src/lib/pnl';

// Minimal fixtures (same as tests/pnl.test.ts style)
const EURUSD: Instrument = {
  symbol: 'EURUSD',
  displayName: 'EUR/USD',
  pipSize: 0.0001,
  contractSize: 100000,
  digits: 5,
  assetClass: 'FOREX',
  baseCurrency: 'EUR',
  quoteCurrency: 'USD',
  isActive: true,
};

function makeTrade(id: string, closedAt: string, direction: 'LONG' | 'SHORT' = 'LONG') {
  return {
    id,
    account_id: 'a1',
    symbol: 'EURUSD',
    direction,
    status: 'CLOSED',
    initial_stop_price: null,
    initial_target_price: null,
  } as const;
}

function entry(price: number, volume: number, ts: string) {
  return {
    id: `e-${ts}`,
    trade_id: 't',
    leg_type: 'ENTRY',
    timestamp_utc: ts,
    price,
    volume_lots: volume,
    commission: 0,
    swap: 0,
    broker_profit: null,
  } as const;
}

function exit(price: number, volume: number, ts: string) {
  return {
    id: `x-${ts}`,
    trade_id: 't',
    leg_type: 'EXIT',
    timestamp_utc: ts,
    price,
    volume_lots: volume,
    commission: 0,
    swap: 0,
    broker_profit: null,
  } as const;
}

function bundleFor(trade: any, legs: any[]) {
  return { trade, legs, instrument: EURUSD };
}

describe('Calmar annualization', () => {
  it('annualizes return over ~365 days', () => {
    // Two closed trades ~365 days apart producing total net P&L = 100
    const t1 = makeTrade('t1', '2025-01-01T00:00:00Z');
    const t2 = makeTrade('t2', '2026-01-01T00:00:00Z');

    // Make a peak then a partial loss so max drawdown > 0 but total net = +100
    // First trade: +200 (0.002 × 100000)
    const b1 = bundleFor(t1, [entry(1.1000, 1.0, '2025-01-01T00:00:00Z'), exit(1.1020, 1.0, '2025-01-01T00:00:00Z')]);
    // Second trade: -100 (−0.001 × 100000) => total net = 100
    const b2 = bundleFor(t2, [entry(1.2000, 1.0, '2026-01-01T00:00:00Z'), exit(1.1990, 1.0, '2026-01-01T00:00:00Z')]);

    const agg = computeAggregateMetrics([b1, b2], 1000);
    expect(Number(agg.calmarPeriodDays)).toBeGreaterThan(350);
    expect(Number(agg.calmarPeriodDays)).toBeLessThan(370);
    // totalReturn = 100 / 1000 = 0.1, annualized over 1 year ≈ 0.1
    expect(Number(agg.annualizedReturn)).toBeCloseTo(0.1, 3);
  });

  it('handles full loss (totalReturn <= -1) as annualized = -1', () => {
    // Two losing trades a year apart that wipe the account
    const t1 = makeTrade('t3', '2025-01-01T00:00:00Z');
    const t2 = makeTrade('t4', '2026-01-01T00:00:00Z');

    // Each trade: netPnl = -500, total = -1000
    const b1 = bundleFor(t1, [entry(1.1000, 1.0, '2025-01-01T00:00:00Z'), exit(1.0950, 1.0, '2025-01-01T00:00:00Z')]);
    const b2 = bundleFor(t2, [entry(1.2000, 1.0, '2026-01-01T00:00:00Z'), exit(1.1950, 1.0, '2026-01-01T00:00:00Z')]);

    const agg = computeAggregateMetrics([b1, b2], 1000);
    expect(agg.annualizedReturn).toBe(-1);
  });
});
