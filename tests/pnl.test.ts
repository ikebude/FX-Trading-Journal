import { describe, expect, it } from 'vitest';
import {
  computeAggregateMetrics,
  computeTradeMetrics,
  type Instrument,
  type Trade,
  type TradeLeg,
} from '../src/lib/pnl';

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

// T4-1: Instrument type is now the Drizzle-inferred type from schema.ts (camelCase).
// Updated fixtures to match.
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

const USDJPY: Instrument = {
  symbol: 'USDJPY',
  displayName: 'USD/JPY',
  pipSize: 0.01,
  contractSize: 100000,
  digits: 3,
  assetClass: 'FOREX',
  baseCurrency: 'USD',
  quoteCurrency: 'JPY',
  isActive: true,
};

const GBPJPY: Instrument = {
  symbol: 'GBPJPY',
  displayName: 'GBP/JPY',
  pipSize: 0.01,
  contractSize: 100000,
  digits: 3,
  assetClass: 'FOREX',
  baseCurrency: 'GBP',
  quoteCurrency: 'JPY',
  isActive: true,
};

const XAUUSD: Instrument = {
  symbol: 'XAUUSD',
  displayName: 'Gold',
  pipSize: 0.1,
  contractSize: 100,
  digits: 2,
  assetClass: 'METAL',
  baseCurrency: null,
  quoteCurrency: 'USD',
  isActive: true,
};

const XAGUSD: Instrument = {
  symbol: 'XAGUSD',
  displayName: 'Silver',
  pipSize: 0.001,
  contractSize: 5000,
  digits: 3,
  assetClass: 'METAL',
  baseCurrency: null,
  quoteCurrency: 'USD',
  isActive: true,
};

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 't1',
    account_id: 'a1',
    symbol: 'EURUSD',
    direction: 'LONG',
    status: 'OPEN',
    initial_stop_price: null,
    initial_target_price: null,
    ...overrides,
  };
}

function entry(
  price: number,
  volume: number,
  ts: string,
  extras: Partial<TradeLeg> = {},
): TradeLeg {
  return {
    id: `e-${ts}`,
    trade_id: 't1',
    leg_type: 'ENTRY',
    timestamp_utc: ts,
    price,
    volume_lots: volume,
    commission: 0,
    swap: 0,
    broker_profit: null,
    ...extras,
  };
}

function exit(
  price: number,
  volume: number,
  ts: string,
  extras: Partial<TradeLeg> = {},
): TradeLeg {
  return {
    id: `x-${ts}`,
    trade_id: 't1',
    leg_type: 'EXIT',
    timestamp_utc: ts,
    price,
    volume_lots: volume,
    commission: 0,
    swap: 0,
    broker_profit: null,
    ...extras,
  };
}

// ─────────────────────────────────────────────────────────────
// Per-trade metrics
// ─────────────────────────────────────────────────────────────

describe('computeTradeMetrics — per-trade math', () => {
  it('1. Long winner on EURUSD (single entry, single exit)', () => {
    const trade = makeTrade({
      direction: 'LONG',
      initial_stop_price: 1.08,
    });
    const legs = [
      entry(1.085, 1.0, '2026-04-09T10:00:00Z'),
      exit(1.09, 1.0, '2026-04-09T12:00:00Z'),
    ];
    const m = computeTradeMetrics(trade, legs, EURUSD);
    expect(m.status).toBe('CLOSED');
    expect(m.weightedAvgEntry).toBeCloseTo(1.085, 5);
    expect(m.weightedAvgExit).toBeCloseTo(1.09, 5);
    expect(m.netPips).toBeCloseTo(50, 1);
    expect(m.netPnl).toBeCloseTo(500, 2); // 0.005 × 100000
    expect(m.rMultiple).toBeCloseTo(1, 3); // (1.09-1.085) / (1.085-1.08) = 1
    expect(m.result).toBe('WIN');
  });

  it('2. Short winner on EURUSD', () => {
    const trade = makeTrade({
      direction: 'SHORT',
      initial_stop_price: 1.09,
    });
    const legs = [
      entry(1.085, 1.0, '2026-04-09T10:00:00Z'),
      exit(1.08, 1.0, '2026-04-09T12:00:00Z'),
    ];
    const m = computeTradeMetrics(trade, legs, EURUSD);
    expect(m.netPips).toBeCloseTo(50, 1);
    expect(m.netPnl).toBeCloseTo(500, 2);
    expect(m.rMultiple).toBeCloseTo(1, 3);
    expect(m.result).toBe('WIN');
  });

  it('3. Long winner on USDJPY (verifies pip_size 0.01)', () => {
    const trade = makeTrade({
      symbol: 'USDJPY',
      direction: 'LONG',
      initial_stop_price: 150.0,
    });
    const legs = [
      entry(150.5, 1.0, '2026-04-09T10:00:00Z'),
      exit(151.0, 1.0, '2026-04-09T12:00:00Z'),
    ];
    const m = computeTradeMetrics(trade, legs, USDJPY);
    expect(m.netPips).toBeCloseTo(50, 1);
    // P&L = 0.5 × 100000 = 50000 JPY (in quote currency)
    expect(m.netPnl).toBeCloseTo(50000, 0);
    expect(m.rMultiple).toBeCloseTo(1, 3);
  });

  it('4. Long winner on GBPJPY', () => {
    const trade = makeTrade({
      symbol: 'GBPJPY',
      direction: 'LONG',
      initial_stop_price: 195.0,
    });
    const legs = [
      entry(195.5, 0.5, '2026-04-09T10:00:00Z'),
      exit(196.5, 0.5, '2026-04-09T12:00:00Z'),
    ];
    const m = computeTradeMetrics(trade, legs, GBPJPY);
    expect(m.netPips).toBeCloseTo(100, 1);
    expect(m.rMultiple).toBeCloseTo(2, 3);
  });

  it('5. Long winner on XAUUSD (verifies pip_size 0.1)', () => {
    const trade = makeTrade({
      symbol: 'XAUUSD',
      direction: 'LONG',
      initial_stop_price: 2400,
    });
    const legs = [
      entry(2410, 1.0, '2026-04-09T10:00:00Z'),
      exit(2430, 1.0, '2026-04-09T12:00:00Z'),
    ];
    const m = computeTradeMetrics(trade, legs, XAUUSD);
    expect(m.netPips).toBeCloseTo(200, 1); // (2430-2410)/0.1 = 200
    expect(m.netPnl).toBeCloseTo(2000, 2); // 20 × 100
    expect(m.rMultiple).toBeCloseTo(2, 3);
  });

  it('6. Long winner on XAGUSD (pip_size 0.001)', () => {
    const trade = makeTrade({
      symbol: 'XAGUSD',
      direction: 'LONG',
      initial_stop_price: 28.0,
    });
    const legs = [
      entry(28.5, 1.0, '2026-04-09T10:00:00Z'),
      exit(29.0, 1.0, '2026-04-09T12:00:00Z'),
    ];
    const m = computeTradeMetrics(trade, legs, XAGUSD);
    expect(m.netPips).toBeCloseTo(500, 1); // 0.5/0.001 = 500
    expect(m.netPnl).toBeCloseTo(2500, 2); // 0.5 × 5000
    expect(m.rMultiple).toBeCloseTo(1, 3);
  });

  it('7. Long with one partial exit at 50% volume, then final exit', () => {
    const trade = makeTrade({
      direction: 'LONG',
      initial_stop_price: 1.08,
    });
    const legs = [
      entry(1.085, 1.0, '2026-04-09T10:00:00Z'),
      exit(1.0875, 0.5, '2026-04-09T11:00:00Z'),
      exit(1.0925, 0.5, '2026-04-09T12:00:00Z'),
    ];
    const m = computeTradeMetrics(trade, legs, EURUSD);
    expect(m.status).toBe('CLOSED');
    expect(m.weightedAvgExit).toBeCloseTo(1.09, 5); // (0.5×1.0875 + 0.5×1.0925) / 1
    expect(m.netPips).toBeCloseTo(50, 1);
    expect(m.netPnl).toBeCloseTo(500, 2);
  });

  it('8. Long with two partial exits (33%, 33%) and final 34%', () => {
    const trade = makeTrade({
      direction: 'LONG',
      initial_stop_price: 1.08,
    });
    const legs = [
      entry(1.085, 1.0, '2026-04-09T10:00:00Z'),
      exit(1.087, 0.33, '2026-04-09T11:00:00Z'),
      exit(1.089, 0.33, '2026-04-09T11:30:00Z'),
      exit(1.094, 0.34, '2026-04-09T12:00:00Z'),
    ];
    const m = computeTradeMetrics(trade, legs, EURUSD);
    expect(m.status).toBe('CLOSED');
    expect(m.totalExitVolume).toBeCloseTo(1.0, 4);
    expect(m.weightedAvgExit).toBeCloseTo(
      0.33 * 1.087 + 0.33 * 1.089 + 0.34 * 1.094,
      5,
    );
    expect(m.netPips).toBeGreaterThan(40);
  });

  it('9. Long with two scale-in entries, single full exit', () => {
    const trade = makeTrade({
      direction: 'LONG',
      initial_stop_price: 1.08,
    });
    const legs = [
      entry(1.085, 0.5, '2026-04-09T10:00:00Z'),
      entry(1.087, 0.5, '2026-04-09T10:30:00Z'),
      exit(1.095, 1.0, '2026-04-09T12:00:00Z'),
    ];
    const m = computeTradeMetrics(trade, legs, EURUSD);
    expect(m.weightedAvgEntry).toBeCloseTo(1.086, 5);
    expect(m.weightedAvgExit).toBeCloseTo(1.095, 5);
    expect(m.netPips).toBeCloseTo(90, 1);
  });

  it('10. Long with two scale-in entries and two partial exits', () => {
    const trade = makeTrade({
      direction: 'LONG',
      initial_stop_price: 1.08,
    });
    const legs = [
      entry(1.085, 0.5, '2026-04-09T10:00:00Z'),
      entry(1.087, 0.5, '2026-04-09T10:30:00Z'),
      exit(1.092, 0.5, '2026-04-09T11:00:00Z'),
      exit(1.098, 0.5, '2026-04-09T12:00:00Z'),
    ];
    const m = computeTradeMetrics(trade, legs, EURUSD);
    expect(m.status).toBe('CLOSED');
    expect(m.weightedAvgEntry).toBeCloseTo(1.086, 5);
    expect(m.weightedAvgExit).toBeCloseTo(1.095, 5);
    expect(m.netPips).toBeCloseTo(90, 1);
  });

  it('11. Short loser hitting stop exactly (rMultiple = -1)', () => {
    const trade = makeTrade({
      direction: 'SHORT',
      initial_stop_price: 1.09,
    });
    const legs = [
      entry(1.085, 1.0, '2026-04-09T10:00:00Z'),
      exit(1.09, 1.0, '2026-04-09T12:00:00Z'),
    ];
    const m = computeTradeMetrics(trade, legs, EURUSD);
    expect(m.rMultiple).toBeCloseTo(-1, 3);
    expect(m.result).toBe('LOSS');
  });

  it('12. Long winner exactly at 1R', () => {
    const trade = makeTrade({
      direction: 'LONG',
      initial_stop_price: 1.08,
    });
    const legs = [
      entry(1.085, 1.0, '2026-04-09T10:00:00Z'),
      exit(1.09, 1.0, '2026-04-09T12:00:00Z'),
    ];
    const m = computeTradeMetrics(trade, legs, EURUSD);
    expect(m.rMultiple).toBeCloseTo(1, 3);
  });

  it('13. Breakeven trade', () => {
    const trade = makeTrade({
      direction: 'LONG',
      initial_stop_price: 1.08,
    });
    const legs = [
      entry(1.085, 1.0, '2026-04-09T10:00:00Z'),
      exit(1.085, 1.0, '2026-04-09T12:00:00Z'),
    ];
    const m = computeTradeMetrics(trade, legs, EURUSD);
    expect(m.rMultiple).toBeCloseTo(0, 3);
    expect(m.result).toBe('BREAKEVEN');
  });

  it('14. Trade with no initial_stop_price (rMultiple null, rest valid)', () => {
    const trade = makeTrade({
      direction: 'LONG',
      initial_stop_price: null,
    });
    const legs = [
      entry(1.085, 1.0, '2026-04-09T10:00:00Z'),
      exit(1.09, 1.0, '2026-04-09T12:00:00Z'),
    ];
    const m = computeTradeMetrics(trade, legs, EURUSD);
    expect(m.rMultiple).toBeNull();
    expect(m.netPips).toBeCloseTo(50, 1);
    expect(m.netPnl).toBeCloseTo(500, 2);
    expect(m.result).toBe('WIN'); // classified by P&L when R unavailable
  });

  it('15. Open trade (no exits)', () => {
    const trade = makeTrade({
      direction: 'LONG',
      initial_stop_price: 1.08,
    });
    const legs = [entry(1.085, 1.0, '2026-04-09T10:00:00Z')];
    const m = computeTradeMetrics(trade, legs, EURUSD);
    expect(m.status).toBe('OPEN');
    expect(m.netPips).toBeNull();
    expect(m.netPnl).toBeNull();
    expect(m.rMultiple).toBeNull();
    expect(m.result).toBeNull();
    expect(m.totalEntryVolume).toBeCloseTo(1.0, 4);
    expect(m.remainingVolume).toBeCloseTo(1.0, 4);
  });

  it('16. Partial trade (some exit volume but not all)', () => {
    const trade = makeTrade({
      direction: 'LONG',
      initial_stop_price: 1.08,
    });
    const legs = [
      entry(1.085, 1.0, '2026-04-09T10:00:00Z'),
      exit(1.09, 0.4, '2026-04-09T11:00:00Z'),
    ];
    const m = computeTradeMetrics(trade, legs, EURUSD);
    expect(m.status).toBe('PARTIAL');
    expect(m.totalExitVolume).toBeCloseTo(0.4, 4);
    expect(m.remainingVolume).toBeCloseTo(0.6, 4);
    expect(m.netPips).toBeCloseTo(50, 1);
    expect(m.result).toBeNull(); // result only set when CLOSED
  });

  it('17. Trade with non-zero commission and swap on every leg', () => {
    const trade = makeTrade({
      direction: 'LONG',
      initial_stop_price: 1.08,
    });
    const legs = [
      entry(1.085, 1.0, '2026-04-09T10:00:00Z', { commission: -3, swap: 0 }),
      exit(1.09, 1.0, '2026-04-09T12:00:00Z', { commission: -3, swap: -1.5 }),
    ];
    const m = computeTradeMetrics(trade, legs, EURUSD);
    expect(m.totalCommission).toBeCloseTo(-6, 2);
    expect(m.totalSwap).toBeCloseTo(-1.5, 2);
    // Gross 500, minus 6 commission, minus 1.5 swap = 492.5
    expect(m.netPnl).toBeCloseTo(492.5, 2);
  });

  it('18. Trade with broker-supplied profit on each leg', () => {
    const trade = makeTrade({
      direction: 'LONG',
      initial_stop_price: 1.08,
    });
    const legs = [
      entry(1.085, 1.0, '2026-04-09T10:00:00Z', { broker_profit: 0 }),
      exit(1.09, 1.0, '2026-04-09T12:00:00Z', {
        broker_profit: 487.32, // broker reports this exact figure (with their slippage etc.)
        commission: -3,
        swap: -1.5,
      }),
    ];
    const m = computeTradeMetrics(trade, legs, EURUSD);
    // Should use broker profit, not computed: 487.32 + (-3) + (-1.5) = 482.82
    expect(m.netPnl).toBeCloseTo(482.82, 2);
  });

  it('19. Trade with negative swap (short on a high-yielder, held overnight)', () => {
    const trade = makeTrade({
      direction: 'SHORT',
      initial_stop_price: 1.09,
    });
    const legs = [
      entry(1.085, 1.0, '2026-04-09T10:00:00Z'),
      exit(1.082, 1.0, '2026-04-10T12:00:00Z', { swap: -8.5 }),
    ];
    const m = computeTradeMetrics(trade, legs, EURUSD);
    expect(m.totalSwap).toBeCloseTo(-8.5, 2);
    expect(m.netPnl).toBeCloseTo(300 - 8.5, 2); // 30 pips × $10 - swap
  });
});

// ─────────────────────────────────────────────────────────────
// Aggregate metrics
// ─────────────────────────────────────────────────────────────

describe('computeAggregateMetrics — portfolio math', () => {
  function bundle(legs: TradeLeg[], stop: number | null = 1.08, dir: 'LONG' | 'SHORT' = 'LONG') {
    return {
      trade: makeTrade({
        id: legs[0].timestamp_utc,
        direction: dir,
        initial_stop_price: stop,
      }),
      legs: legs.map((l) => ({ ...l, trade_id: legs[0].timestamp_utc })),
      instrument: EURUSD,
    };
  }

  it('20. Empty trade list → zero stats, no NaNs', () => {
    const m = computeAggregateMetrics([], 10000);
    expect(m.totalTrades).toBe(0);
    expect(m.winRate).toBe(0);
    expect(m.netPnl).toBe(0);
    expect(m.maxDrawdown).toBe(0);
    expect(m.profitFactor).toBeNull();
    expect(m.averageR).toBeNull();
    expect(m.equityCurve).toEqual([]);
  });

  it('21. All winners → win rate 100%, profit factor = Infinity handled', () => {
    const bundles = [
      bundle([
        entry(1.085, 1.0, '2026-04-01T10:00:00Z'),
        exit(1.09, 1.0, '2026-04-01T12:00:00Z'),
      ]),
      bundle([
        entry(1.085, 1.0, '2026-04-02T10:00:00Z'),
        exit(1.095, 1.0, '2026-04-02T12:00:00Z'),
      ]),
    ];
    const m = computeAggregateMetrics(bundles, 10000);
    expect(m.winRate).toBe(1);
    expect(m.profitFactor).toBe(Number.POSITIVE_INFINITY);
    expect(m.netPnl).toBeCloseTo(1500, 2);
  });

  it('22. All losers → win rate 0%, profit factor = 0', () => {
    const bundles = [
      bundle(
        [
          entry(1.085, 1.0, '2026-04-01T10:00:00Z'),
          exit(1.08, 1.0, '2026-04-01T12:00:00Z'),
        ],
        1.08,
      ),
      bundle(
        [
          entry(1.085, 1.0, '2026-04-02T10:00:00Z'),
          exit(1.08, 1.0, '2026-04-02T12:00:00Z'),
        ],
        1.08,
      ),
    ];
    const m = computeAggregateMetrics(bundles, 10000);
    expect(m.winRate).toBe(0);
    expect(m.profitFactor).toBe(0);
    expect(m.netPnl).toBeCloseTo(-1000, 2);
  });

  it('23. Max drawdown on a clear peak-to-trough series', () => {
    // Series: 10000 → 12000 → 9000 → 11000 → 8000
    // Trades: +2000, -3000, +2000, -3000
    const bundles = [
      bundle([
        entry(1.0, 1.0, '2026-04-01T10:00:00Z'),
        exit(1.02, 1.0, '2026-04-01T12:00:00Z'),
      ]),
      bundle([
        entry(1.0, 1.0, '2026-04-02T10:00:00Z'),
        exit(0.97, 1.0, '2026-04-02T12:00:00Z'),
      ]),
      bundle([
        entry(1.0, 1.0, '2026-04-03T10:00:00Z'),
        exit(1.02, 1.0, '2026-04-03T12:00:00Z'),
      ]),
      bundle([
        entry(1.0, 1.0, '2026-04-04T10:00:00Z'),
        exit(0.97, 1.0, '2026-04-04T12:00:00Z'),
      ]),
    ];
    const m = computeAggregateMetrics(bundles, 10000);
    // Equity: 10000 → 12000 → 9000 → 11000 → 8000
    // Peak is 12000, lowest after peak is 8000 → max drawdown = 4000
    expect(m.maxDrawdown).toBeCloseTo(4000, 0);
    expect(m.maxDrawdownPct).toBeCloseTo(33.33, 1);
  });

  it('24. Mixed wins and losses — profit factor', () => {
    const bundles = [
      bundle([
        entry(1.0, 1.0, '2026-04-01T10:00:00Z'),
        exit(1.03, 1.0, '2026-04-01T12:00:00Z'),
      ]), // +3000
      bundle(
        [
          entry(1.0, 1.0, '2026-04-02T10:00:00Z'),
          exit(0.99, 1.0, '2026-04-02T12:00:00Z'),
        ],
        0.99,
      ), // -1000
      bundle([
        entry(1.0, 1.0, '2026-04-03T10:00:00Z'),
        exit(1.02, 1.0, '2026-04-03T12:00:00Z'),
      ]), // +2000
    ];
    const m = computeAggregateMetrics(bundles, 10000);
    // Winning P&L = 5000, losing = 1000 → profit factor 5
    expect(m.profitFactor).toBeCloseTo(5, 2);
    expect(m.winRate).toBeCloseTo(2 / 3, 3);
  });

  it('25. Expectancy in R, excluding null-R trades', () => {
    const bundles = [
      bundle(
        [
          entry(1.085, 1.0, '2026-04-01T10:00:00Z'),
          exit(1.09, 1.0, '2026-04-01T12:00:00Z'),
        ],
        1.08,
      ), // R=1
      bundle(
        [
          entry(1.085, 1.0, '2026-04-02T10:00:00Z'),
          exit(1.095, 1.0, '2026-04-02T12:00:00Z'),
        ],
        1.08,
      ), // R=2
      bundle(
        [
          entry(1.085, 1.0, '2026-04-03T10:00:00Z'),
          exit(1.09, 1.0, '2026-04-03T12:00:00Z'),
        ],
        null,
      ), // R=null, excluded
    ];
    const m = computeAggregateMetrics(bundles, 10000);
    expect(m.averageR).toBeCloseTo(1.5, 3); // (1+2)/2
  });

  it('26. Equity curve has one point per closed trade in chronological order', () => {
    const bundles = [
      bundle([
        entry(1.0, 1.0, '2026-04-03T10:00:00Z'),
        exit(1.01, 1.0, '2026-04-03T12:00:00Z'),
      ]),
      bundle([
        entry(1.0, 1.0, '2026-04-01T10:00:00Z'),
        exit(1.02, 1.0, '2026-04-01T12:00:00Z'),
      ]),
      bundle([
        entry(1.0, 1.0, '2026-04-02T10:00:00Z'),
        exit(1.005, 1.0, '2026-04-02T12:00:00Z'),
      ]),
    ];
    const m = computeAggregateMetrics(bundles, 10000);
    expect(m.equityCurve).toHaveLength(3);
    expect(m.equityCurve[0].timestamp).toBe('2026-04-01T12:00:00Z');
    expect(m.equityCurve[1].timestamp).toBe('2026-04-02T12:00:00Z');
    expect(m.equityCurve[2].timestamp).toBe('2026-04-03T12:00:00Z');
    expect(m.equityCurve[0].equity).toBeCloseTo(12000, 0);
    expect(m.equityCurve[1].equity).toBeCloseTo(12500, 0);
    expect(m.equityCurve[2].equity).toBeCloseTo(13500, 0);
  });

  it('27. Open trades excluded from aggregate', () => {
    const bundles = [
      bundle([
        entry(1.085, 1.0, '2026-04-01T10:00:00Z'),
        exit(1.09, 1.0, '2026-04-01T12:00:00Z'),
      ]),
      bundle([entry(1.085, 1.0, '2026-04-02T10:00:00Z')]), // open
    ];
    const m = computeAggregateMetrics(bundles, 10000);
    expect(m.totalTrades).toBe(2);
    expect(m.closedTrades).toBe(1);
    expect(m.wins).toBe(1);
  });

  it('35. True expectancy: 2 wins (R=+1, R=+2), 1 loss (R=−1)', () => {
    // winRate=2/3, avgWin=(1+2)/2=1.5, avgLoss=1
    // E = (2/3)*1.5 − (1/3)*1 = 1.0 − 0.333 = 0.667
    const bundles = [
      bundle([entry(1.085, 1.0, '2026-04-01T10:00:00Z'), exit(1.09, 1.0, '2026-04-01T12:00:00Z')], 1.08),    // R=+1
      bundle([entry(1.085, 1.0, '2026-04-02T10:00:00Z'), exit(1.095, 1.0, '2026-04-02T12:00:00Z')], 1.08),  // R=+2
      bundle([entry(1.085, 1.0, '2026-04-03T10:00:00Z'), exit(1.08, 1.0, '2026-04-03T12:00:00Z')], 1.08),   // R=−1
    ];
    const m = computeAggregateMetrics(bundles, 10000);
    expect(m.expectancy).toBeCloseTo(0.667, 2);
  });

  it('36. Expectancy with all wins → falls back to averageR (degenerate case)', () => {
    // No losses → winRValues.length > 0, lossRValues.length === 0 → degenerate
    const bundles = [
      bundle([entry(1.085, 1.0, '2026-04-01T10:00:00Z'), exit(1.09, 1.0, '2026-04-01T12:00:00Z')], 1.08),   // R=+1
      bundle([entry(1.085, 1.0, '2026-04-02T10:00:00Z'), exit(1.095, 1.0, '2026-04-02T12:00:00Z')], 1.08), // R=+2
    ];
    const m = computeAggregateMetrics(bundles, 10000);
    // averageR = (1+2)/2 = 1.5; expectancy falls back to averageR
    expect(m.expectancy).toBeCloseTo(1.5, 3);
    expect(m.expectancy).toBeCloseTo(m.averageR!, 3);
  });
});

// ─────────────────────────────────────────────────────────────
// T5-1: New test cases validating audit-fix behaviour
// ─────────────────────────────────────────────────────────────

describe('computeTradeMetrics — T2-2: pip_size validation', () => {
  it('28. Zero pip_size → throws Error', () => {
    const badInstrument: Instrument = { ...EURUSD, pipSize: 0 };
    expect(() =>
      computeTradeMetrics(
        makeTrade(),
        [entry(1.0, 1.0, '2026-04-09T10:00:00Z'), exit(1.01, 1.0, '2026-04-09T12:00:00Z')],
        badInstrument,
      ),
    ).toThrow(/pip_size/i);
  });

  it('29. Negative pip_size → throws Error', () => {
    const badInstrument: Instrument = { ...EURUSD, pipSize: -0.0001 };
    expect(() =>
      computeTradeMetrics(makeTrade(), [], badInstrument),
    ).toThrow(/pip_size/i);
  });
});

describe('computeTradeMetrics — T5-1: additional coverage', () => {
  it('30. CANCELLED status overrides computed status regardless of legs', () => {
    const trade = makeTrade({ status: 'CANCELLED' });
    const legs = [
      entry(1.085, 1.0, '2026-04-09T10:00:00Z'),
      exit(1.09, 1.0, '2026-04-09T12:00:00Z'),
    ];
    const m = computeTradeMetrics(trade, legs, EURUSD);
    expect(m.status).toBe('CANCELLED');
    // P&L math still runs on the actual legs
    expect(m.netPips).toBeCloseTo(50, 1);
    // result is null for non-CLOSED trades
    expect(m.result).toBeNull();
  });

  it('31. Mixed broker_profit — exit has value, entry null → uses exit profit (T2-1 fix)', () => {
    const trade = makeTrade({ direction: 'LONG', initial_stop_price: 1.08 });
    const legs = [
      entry(1.085, 1.0, '2026-04-09T10:00:00Z', { broker_profit: null }),
      exit(1.09, 1.0, '2026-04-09T12:00:00Z', {
        broker_profit: 487.32,
        commission: -3,
        swap: -1.5,
      }),
    ];
    const m = computeTradeMetrics(trade, legs, EURUSD);
    // Before T2-1: null on entry leg → sumNullable → null → falls back to computed P&L.
    // After T2-1: only exit legs checked → broker_profit = 487.32 → used as source of truth.
    expect(m.netPnl).toBeCloseTo(482.82, 2); // 487.32 + (-3) + (-1.5)
  });

  it('32. Legs provided out of chronological order → still computes correctly', () => {
    const trade = makeTrade({ direction: 'LONG', initial_stop_price: 1.08 });
    const legs = [
      exit(1.095, 0.5, '2026-04-09T12:00:00Z'),              // exits first in array
      entry(1.085, 0.5, '2026-04-09T10:00:00Z'),
      exit(1.09, 0.5, '2026-04-09T11:30:00Z'),
      entry(1.087, 0.5, '2026-04-09T10:30:00Z'),             // second entry out of order
    ];
    const m = computeTradeMetrics(trade, legs, EURUSD);
    expect(m.weightedAvgEntry).toBeCloseTo(1.086, 5);   // (0.5×1.085 + 0.5×1.087) / 1.0
    expect(m.weightedAvgExit).toBeCloseTo(1.0925, 5);   // (0.5×1.09 + 0.5×1.095) / 1.0
    expect(m.status).toBe('CLOSED');
    expect(m.netPips).toBeCloseTo(65, 1); // (1.0925-1.086)/0.0001 = 65
  });

  it('33. Inverted stop (stop above entry on LONG) → rMultiple null, no throw (T2-4 fix)', () => {
    const trade = makeTrade({
      direction: 'LONG',
      initial_stop_price: 1.092, // above entry 1.085 — wrong side
    });
    const legs = [
      entry(1.085, 1.0, '2026-04-09T10:00:00Z'),
      exit(1.09, 1.0, '2026-04-09T12:00:00Z'),
    ];
    const m = computeTradeMetrics(trade, legs, EURUSD);
    expect(m.rMultiple).toBeNull();       // inverted → no R
    expect(m.netPips).toBeCloseTo(50, 1); // P&L still computed
    expect(m.result).toBe('WIN');         // classified by P&L when R unavailable
  });
});

describe('computeAggregateMetrics — T2-3: equity curve tie-breaker', () => {
  it('34. Two trades with same close timestamp → deterministic equity curve order', () => {
    const sameClose = '2026-04-01T12:00:00Z';
    // b1 opens earlier, so tie-breaks before b2
    const b1 = {
      trade: makeTrade({ id: 'trade-aaa', direction: 'LONG', initial_stop_price: 1.08 }),
      legs: [
        { ...entry(1.085, 1.0, '2026-04-01T09:00:00Z'), trade_id: 'trade-aaa', id: 'e1' },
        { ...exit(1.09, 1.0, sameClose), trade_id: 'trade-aaa', id: 'x1' },
      ],
      instrument: EURUSD, // netPnl ≈ +500
    };
    const b2 = {
      trade: makeTrade({ id: 'trade-bbb', direction: 'LONG', initial_stop_price: 1.08 }),
      legs: [
        { ...entry(1.085, 1.0, '2026-04-01T10:00:00Z'), trade_id: 'trade-bbb', id: 'e2' },
        { ...exit(1.095, 1.0, sameClose), trade_id: 'trade-bbb', id: 'x2' },
      ],
      instrument: EURUSD, // netPnl ≈ +1000
    };

    const m1 = computeAggregateMetrics([b1, b2], 10000);
    const m2 = computeAggregateMetrics([b2, b1], 10000); // reversed input

    // Both orderings must produce the identical equity curve
    expect(m1.equityCurve[0].equity).toBeCloseTo(m2.equityCurve[0].equity, 2);
    expect(m1.equityCurve[1].equity).toBeCloseTo(m2.equityCurve[1].equity, 2);
    // b1 (opens 09:00) should come first → equity after b1 ≈ 10500
    expect(m1.equityCurve[0].equity).toBeCloseTo(10500, 0);
    expect(m1.equityCurve[1].equity).toBeCloseTo(11500, 0);
  });
});
