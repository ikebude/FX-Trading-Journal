/**
 * T6.10 — performance regression guard.
 *
 * Cold-start / dashboard-TTI need a packaged app (measured manually per
 * the playbook). What we *can* lock in CI is the throughput of the hot
 * pure paths the dashboard + importer depend on, so an algorithmic
 * regression fails the build. Thresholds are deliberately generous
 * (≈10× headroom over local timings) to stay non-flaky on slow CI.
 */
import { describe, it, expect } from 'vitest';
import { computeAggregateMetrics, type TradeBundle, type Instrument } from '../src/lib/pnl';
import { parseCsv } from '../src/lib/importers/csv';

const EURUSD: Instrument = {
  symbol: 'EURUSD',
  displayName: 'Euro / US Dollar',
  assetClass: 'FOREX',
  baseCurrency: 'EUR',
  quoteCurrency: 'USD',
  pipSize: 0.0001,
  contractSize: 100_000,
  digits: 5,
  isActive: true,
};

function bundle(i: number): TradeBundle {
  const open = new Date(2026, 0, 1, 0, 0, 0).getTime() + i * 3_600_000;
  const close = open + 1_800_000;
  const id = `t${i}`;
  return {
    trade: {
      id,
      account_id: 'a1',
      symbol: 'EURUSD',
      direction: i % 2 ? 'LONG' : 'SHORT',
      status: 'CLOSED',
      initial_stop_price: 1.08,
      initial_target_price: 1.1,
    },
    legs: [
      { id: `${id}e`, trade_id: id, leg_type: 'ENTRY', timestamp_utc: new Date(open).toISOString(), price: 1.09, volume_lots: 1, commission: -2, swap: 0, broker_profit: null },
      { id: `${id}x`, trade_id: id, leg_type: 'EXIT', timestamp_utc: new Date(close).toISOString(), price: i % 2 ? 1.095 : 1.085, volume_lots: 1, commission: -2, swap: 0, broker_profit: null },
    ],
    instrument: EURUSD,
  };
}

describe('perf regression — T6.10', () => {
  it('computeAggregateMetrics handles 2,000 trades quickly', () => {
    const bundles = Array.from({ length: 2000 }, (_, i) => bundle(i));
    const start = performance.now();
    const m = computeAggregateMetrics(bundles, 10_000);
    const ms = performance.now() - start;
    expect(m.totalTrades).toBe(2000);
    expect(ms).toBeLessThan(2000); // ~10× headroom
  });

  it('parseCsv handles a 5,000-row statement quickly', () => {
    const header = 'Symbol,Side,Lots,Open Time,Open Price,Close Price,Profit';
    const rows = Array.from(
      { length: 5000 },
      (_, i) =>
        `EURUSD,${i % 2 ? 'Buy' : 'Sell'},1,2026-04-01 10:00:00,1.0850,1.0900,${i % 2 ? 50 : -50}`,
    );
    const csv = [header, ...rows].join('\n');
    const start = performance.now();
    const res = parseCsv(csv);
    const ms = performance.now() - start;
    expect(res.trades.length + res.failed.length).toBe(5000);
    expect(ms).toBeLessThan(3000);
  });
});
