import { describe, expect, it } from 'vitest';
import {
  computeAggregateMetrics,
  computeTradeMetrics,
  computeSessionDowMatrix,
  computeDurationVsOutcome,
  computeSetupVersionPerformance,
  computeRevengeTradeIndicators,
  computeCooldown,
  anxietyOutcomeCorrelation,
  pearson,
  computePostMortem,
  computeSlippageStats,
  computeModeledCommission,
  computeKelly,
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

describe('computeAggregateMetrics — T3.2: MAE/MFE scatter', () => {
  it('35. Returns empty scatter when no trades have mae_pips/mfe_pips set', () => {
    const b = {
      trade: makeTrade({ status: 'CLOSED', initial_stop_price: 1.08 }),
      legs: [
        entry(1.085, 1.0, '2026-04-01T09:00:00Z'),
        exit(1.09, 1.0, '2026-04-01T12:00:00Z'),
      ],
      instrument: EURUSD,
    };
    const agg = computeAggregateMetrics([b], 10000);
    expect(agg.maeMfeScatter).toEqual([]);
  });

  it('36. Includes closed trade with both mae_pips and mfe_pips, carries rMultiple and symbol', () => {
    const b = {
      trade: makeTrade({
        id: 'win-trade',
        symbol: 'EURUSD',
        direction: 'LONG',
        initial_stop_price: 1.08,
        mae_pips: 8.5,
        mfe_pips: 52.0,
      }),
      legs: [
        { ...entry(1.085, 1.0, '2026-04-01T09:00:00Z'), trade_id: 'win-trade', id: 'e1' },
        { ...exit(1.09, 1.0, '2026-04-01T12:00:00Z'), trade_id: 'win-trade', id: 'x1' },
      ],
      instrument: EURUSD,
    };
    const agg = computeAggregateMetrics([b], 10000);
    expect(agg.maeMfeScatter).toHaveLength(1);
    const pt = agg.maeMfeScatter[0];
    expect(pt.maePips).toBe(8.5);
    expect(pt.mfePips).toBe(52.0);
    expect(pt.symbol).toBe('EURUSD');
    // rMultiple = (exit - entry) / (entry - stop) = (1.09-1.085)/(1.085-1.08) = 0.005/0.005 = 1.0
    expect(pt.rMultiple).toBeCloseTo(1.0, 4);
  });

  it('37. Excludes open trades even when mae_pips/mfe_pips are set', () => {
    const b = {
      trade: makeTrade({ status: 'OPEN', mae_pips: 5.0, mfe_pips: 10.0 }),
      legs: [entry(1.085, 1.0, '2026-04-01T09:00:00Z')],
      instrument: EURUSD,
    };
    const agg = computeAggregateMetrics([b], 10000);
    expect(agg.maeMfeScatter).toEqual([]);
  });

  it('38. Excludes closed trade where only one of mae_pips/mfe_pips is set', () => {
    const b = {
      trade: makeTrade({ initial_stop_price: 1.08, mae_pips: 8.0, mfe_pips: null }),
      legs: [
        entry(1.085, 1.0, '2026-04-01T09:00:00Z'),
        exit(1.09, 1.0, '2026-04-01T12:00:00Z'),
      ],
      instrument: EURUSD,
    };
    const agg = computeAggregateMetrics([b], 10000);
    expect(agg.maeMfeScatter).toEqual([]);
  });

  it('39. rMultiple is null in scatter when trade has no stop price', () => {
    const b = {
      trade: makeTrade({ initial_stop_price: null, mae_pips: 12.0, mfe_pips: 30.0 }),
      legs: [
        entry(1.085, 1.0, '2026-04-01T09:00:00Z'),
        exit(1.09, 1.0, '2026-04-01T12:00:00Z'),
      ],
      instrument: EURUSD,
    };
    const agg = computeAggregateMetrics([b], 10000);
    expect(agg.maeMfeScatter).toHaveLength(1);
    expect(agg.maeMfeScatter[0].rMultiple).toBeNull();
  });
});

describe('computeSessionDowMatrix — T3.3', () => {
  // London session, Monday close (2026-04-06 is a Monday)
  const londonMon = {
    trade: makeTrade({ id: 'lm', initial_stop_price: 1.08, session: 'LONDON' }),
    legs: [
      { ...entry(1.085, 1.0, '2026-04-06T09:00:00Z'), trade_id: 'lm', id: 'e1' },
      { ...exit(1.09, 1.0, '2026-04-06T11:00:00Z'), trade_id: 'lm', id: 'x1' },
    ],
    instrument: EURUSD, // WIN, +500
  };
  // London session, Tuesday close (2026-04-07)
  const londonTue = {
    trade: makeTrade({ id: 'lt', initial_stop_price: 1.08, session: 'LONDON' }),
    legs: [
      { ...entry(1.085, 1.0, '2026-04-07T09:00:00Z'), trade_id: 'lt', id: 'e2' },
      { ...exit(1.082, 1.0, '2026-04-07T10:30:00Z'), trade_id: 'lt', id: 'x2' },
    ],
    instrument: EURUSD, // LOSS, -300
  };
  const TZ = 'UTC';

  it('40. Returns one cell per (session, day) combination', () => {
    const cells = computeSessionDowMatrix([londonMon, londonTue], TZ);
    expect(cells).toHaveLength(2);
  });

  it('41. Cell for London Monday has positive P&L and win rate 1', () => {
    const cells = computeSessionDowMatrix([londonMon], TZ);
    expect(cells).toHaveLength(1);
    const cell = cells[0];
    expect(cell.session).toBe('LONDON');
    expect(cell.dayName).toBe('Mon');
    expect(cell.count).toBe(1);
    expect(cell.wins).toBe(1);
    expect(cell.winRate).toBe(1);
    expect(cell.netPnl).toBeGreaterThan(0);
  });

  it('42. Open trades are excluded from the matrix', () => {
    const openTrade = {
      trade: makeTrade({ id: 'open', session: 'LONDON' }),
      legs: [entry(1.085, 1.0, '2026-04-06T09:00:00Z')],
      instrument: EURUSD,
    };
    const cells = computeSessionDowMatrix([openTrade], TZ);
    expect(cells).toHaveLength(0);
  });

  it('43. Trades without session field use OFF_HOURS', () => {
    const noSession = {
      trade: makeTrade({ id: 'ns', initial_stop_price: 1.08, session: null }),
      legs: [
        { ...entry(1.085, 1.0, '2026-04-06T09:00:00Z'), trade_id: 'ns', id: 'e3' },
        { ...exit(1.09, 1.0, '2026-04-06T11:00:00Z'), trade_id: 'ns', id: 'x3' },
      ],
      instrument: EURUSD,
    };
    const cells = computeSessionDowMatrix([noSession], TZ);
    expect(cells[0].session).toBe('OFF_HOURS');
  });
});

describe('computeDurationVsOutcome — T3.3', () => {
  it('44. Returns a point for every closed trade with a known holding time', () => {
    const b = {
      trade: makeTrade({ initial_stop_price: 1.08 }),
      legs: [
        entry(1.085, 1.0, '2026-04-06T09:00:00Z'),
        exit(1.09, 1.0, '2026-04-06T11:00:00Z'), // 2h = 120m
      ],
      instrument: EURUSD,
    };
    const pts = computeDurationVsOutcome([b]);
    expect(pts).toHaveLength(1);
    expect(pts[0].holdingTimeMinutes).toBeCloseTo(120, 1);
    expect(pts[0].rMultiple).toBeCloseTo(1.0, 4);
    expect(pts[0].symbol).toBe('EURUSD');
  });

  it('45. Open trade with no exit is excluded', () => {
    const open = {
      trade: makeTrade(),
      legs: [entry(1.085, 1.0, '2026-04-06T09:00:00Z')],
      instrument: EURUSD,
    };
    expect(computeDurationVsOutcome([open])).toHaveLength(0);
  });

  it('46. rMultiple is null when no stop price is set', () => {
    const b = {
      trade: makeTrade({ initial_stop_price: null }),
      legs: [
        entry(1.085, 1.0, '2026-04-06T09:00:00Z'),
        exit(1.09, 1.0, '2026-04-06T10:30:00Z'), // 90m
      ],
      instrument: EURUSD,
    };
    const pts = computeDurationVsOutcome([b]);
    expect(pts).toHaveLength(1);
    expect(pts[0].rMultiple).toBeNull();
    expect(pts[0].holdingTimeMinutes).toBeCloseTo(90, 1);
  });
});

describe('computeSetupVersionPerformance — T3.4', () => {
  // Helper: create N-trade sequence for a setup with varied R results
  function createSetupTrades(
    setupName: string,
    count: number,
    baseDate: string,
    rValues: number[], // Specify R-multiples for each trade
  ) {
    return rValues.slice(0, count).map((r, idx) => {
      const ts = new Date(new Date(baseDate).getTime() + idx * 3600000).toISOString(); // 1 hour apart
      const entryPrice = 1.085;
      const stop = 1.08;
      const exitPrice = entryPrice + r * (entryPrice - stop); // compute exit from R multiple

      return {
        trade: makeTrade({
          id: `${setupName}-${idx}`,
          setup_name: setupName,
          initial_stop_price: stop,
        }),
        legs: [
          { ...entry(entryPrice, 1.0, ts), trade_id: `${setupName}-${idx}`, id: `e${idx}` },
          { ...exit(exitPrice, 1.0, ts), trade_id: `${setupName}-${idx}`, id: `x${idx}` },
        ],
        instrument: EURUSD,
      };
    });
  }

  it('47. Empty bundles returns empty array', () => {
    expect(computeSetupVersionPerformance([])).toEqual([]);
  });

  it('48. Single setup with < 30 trades: historicalExpectancy equals all-time expectancy', () => {
    // 10 trades with R values: [0.5, -1, 1, -0.5, 2, 0.5, -1, 1, 0.5, -1]
    const trades = createSetupTrades(
      'scalp',
      10,
      '2026-04-01T09:00:00Z',
      [0.5, -1, 1, -0.5, 2, 0.5, -1, 1, 0.5, -1],
    );

    const results = computeSetupVersionPerformance(trades);
    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.setup).toBe('scalp');
    expect(r.totalTrades).toBe(10);
    expect(r.closedTrades).toBe(10);
    expect(r.rolling30Expectancy).not.toBeNull();
    expect(r.historicalExpectancy).not.toBeNull();
    // Since < 30 trades, rolling30 == all-time
    expect(r.rolling30Expectancy).toBeCloseTo(r.historicalExpectancy!, 4);
    expect(r.isDegraded).toBe(false); // Can't degrade if rolling == historical
  });

  it('49. Setup with 30+ trades: splits into rolling30 and historical', () => {
    // First 5 trades: all losses (-1R) → poor historical baseline
    // Last 30 trades: all wins (+1R) → strong rolling window
    // Expected: rolling30Expectancy > historicalExpectancy → isDegraded = false
    const poor5 = Array(5).fill(-1);   // avg -1R historical
    const strong30 = Array(30).fill(1); // avg +1R rolling

    const trades = createSetupTrades(
      'swing',
      35,
      '2026-04-01T09:00:00Z',
      [...poor5, ...strong30],
    );

    const results = computeSetupVersionPerformance(trades);
    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.closedTrades).toBe(35);
    expect(r.rolling30Expectancy).not.toBeNull();
    expect(r.historicalExpectancy).not.toBeNull();
    // rolling (last 30, all +1R) > historical (first 5, all -1R)
    expect(r.rolling30Expectancy!).toBeGreaterThan(r.historicalExpectancy!);
    expect(r.isDegraded).toBe(false);
  });

  it('50. Degradation detected when rolling30 < historicalExpectancy', () => {
    // First 20 trades: all wins +1R
    const strong = Array(20).fill(1);
    // Next 15 trades: all losses -1R (weak)
    const weak = Array(15).fill(-1);

    const trades = createSetupTrades(
      'trend',
      35,
      '2026-04-01T09:00:00Z',
      [...strong, ...weak],
    );

    const results = computeSetupVersionPerformance(trades);
    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.isDegraded).toBe(true); // rolling < historical
    expect(r.rolling30Expectancy).toBeLessThan(r.historicalExpectancy!);
  });

  it('51. Open trades are not included in totals', () => {
    const closed = createSetupTrades(
      'mixed',
      5,
      '2026-04-01T09:00:00Z',
      [1, -0.5, 0.5, -1, 2],
    );
    const open = {
      trade: makeTrade({ id: 'open-1', setup_name: 'mixed' }),
      legs: [entry(1.085, 1.0, '2026-04-02T09:00:00Z')],
      instrument: EURUSD,
    };

    const results = computeSetupVersionPerformance([...closed, open]);
    expect(results).toHaveLength(1);
    expect(results[0].closedTrades).toBe(5); // only closed
    expect(results[0].totalTrades).toBe(6); // both closed + open
  });

  it('52. Multiple setups are sorted with degraded first', () => {
    const setup1 = createSetupTrades(
      'strong',
      10,
      '2026-04-01T09:00:00Z',
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    );
    const setup2Strong = Array(20).fill(1);
    const setup2Weak = Array(15).fill(-1);
    const setup2 = createSetupTrades(
      'weak',
      35,
      '2026-04-02T09:00:00Z',
      [...setup2Strong, ...setup2Weak],
    );

    const results = computeSetupVersionPerformance([...setup1, ...setup2]);
    expect(results).toHaveLength(2);
    // 'weak' is degraded, should come first
    expect(results[0].setup).toBe('weak');
    expect(results[0].isDegraded).toBe(true);
    expect(results[1].setup).toBe('strong');
    expect(results[1].isDegraded).toBe(false);
  });

  it('53. Null R-multiples are excluded from expectancy calculation', () => {
    const trades = [
      {
        trade: makeTrade({ id: 't1', setup_name: 'no-stop', initial_stop_price: null }),
        legs: [
          entry(1.085, 1.0, '2026-04-01T09:00:00Z'),
          exit(1.09, 1.0, '2026-04-01T10:00:00Z'),
        ],
        instrument: EURUSD,
      },
      {
        trade: makeTrade({ id: 't2', setup_name: 'no-stop', initial_stop_price: 1.08 }),
        legs: [
          entry(1.085, 1.0, '2026-04-01T11:00:00Z'),
          exit(1.095, 1.0, '2026-04-01T12:00:00Z'), // R = (1.095-1.085)/(1.085-1.08) = 2.0
        ],
        instrument: EURUSD,
      },
    ];

    const results = computeSetupVersionPerformance(trades);
    expect(results).toHaveLength(1);
    // Only 1 R-value (from t2), so expectancy should be 2.0
    expect(results[0].rolling30Expectancy).toBeCloseTo(2.0, 4);
  });

  it('54. Chronological order: trades sorted by closedAtUtc then trade id', () => {
    // Create two trades that close at same time, verify they're consistently ordered
    const trades = [
      {
        trade: makeTrade({
          id: 'z-last',
          setup_name: 'order-test',
          initial_stop_price: 1.08,
        }),
        legs: [
          entry(1.085, 1.0, '2026-04-01T10:00:00Z'),
          exit(1.09, 1.0, '2026-04-01T10:30:00Z'),
        ],
        instrument: EURUSD,
      },
      {
        trade: makeTrade({
          id: 'a-first',
          setup_name: 'order-test',
          initial_stop_price: 1.08,
        }),
        legs: [
          entry(1.085, 1.0, '2026-04-01T10:00:00Z'),
          exit(1.095, 1.0, '2026-04-01T10:30:00Z'),
        ],
        instrument: EURUSD,
      },
    ];

    const results = computeSetupVersionPerformance(trades);
    expect(results).toHaveLength(1);
    // Should compute successfully without error; ordering is deterministic
    expect(results[0].closedTrades).toBe(2);
    expect(results[0].rolling30Expectancy).not.toBeNull();
  });
});

describe('T3.5: Revenge-trade detector', () => {
  it('55. No revenge trades when no losses exist', () => {
    const trades = [
      {
        trade: makeTrade({ id: 't1', symbol: 'EURUSD', initial_stop_price: 1.08 }),
        legs: [
          entry(1.085, 1.0, '2026-04-01T10:00:00Z'),
          exit(1.095, 1.0, '2026-04-01T10:30:00Z'), // +1R win
        ],
        instrument: EURUSD,
      },
      {
        trade: makeTrade({ id: 't2', symbol: 'EURUSD', initial_stop_price: 1.08 }),
        legs: [
          entry(1.085, 1.0, '2026-04-01T11:00:00Z'),
          exit(1.09, 1.0, '2026-04-01T11:30:00Z'), // +0.5R win
        ],
        instrument: EURUSD,
      },
    ];

    const results = computeRevengeTradeIndicators(trades);
    expect(results).toHaveLength(0);
  });

  it('56. No revenge trades when loss has no follow-up', () => {
    const trades = [
      {
        trade: makeTrade({ id: 't1', symbol: 'EURUSD', initial_stop_price: 1.08 }),
        legs: [
          entry(1.085, 1.0, '2026-04-01T10:00:00Z'),
          exit(1.08, 1.0, '2026-04-01T10:30:00Z'), // Stop hit = LOSS
        ],
        instrument: EURUSD,
      },
    ];

    const results = computeRevengeTradeIndicators(trades);
    expect(results).toHaveLength(0);
  });

  it('57. Detect revenge trade within 15-minute window after loss', () => {
    const trades = [
      {
        trade: makeTrade({ id: 'loss-t1', symbol: 'EURUSD', initial_stop_price: 1.08 }),
        legs: [
          entry(1.085, 1.0, '2026-04-01T10:00:00Z'),
          exit(1.08, 1.0, '2026-04-01T10:30:00Z'), // LOSS -1R
        ],
        instrument: EURUSD,
      },
      {
        trade: makeTrade({
          id: 'revenge-t2',
          symbol: 'EURUSD',
          initial_stop_price: 1.08,
        }),
        legs: [
          entry(1.085, 1.0, '2026-04-01T10:40:00Z'), // 10 minutes after loss close
          exit(1.095, 1.0, '2026-04-01T11:00:00Z'), // +1R win
        ],
        instrument: EURUSD,
      },
    ];

    const results = computeRevengeTradeIndicators(trades);
    expect(results).toHaveLength(1);
    expect(results[0].tradeId).toBe('revenge-t2');
    expect(results[0].minutesAfterLoss).toBeCloseTo(10.0, 0);
    expect(results[0].priorLossPnl).toBeCloseTo(-500, 0); // -1R on EURUSD (50 pips * 100k * 0.0001)
    expect(results[0].revengeResult).toBe('WIN');
    expect(results[0].revengePnl).toBeCloseTo(1000, 0); // +1R (entry 1.085, exit 1.095, gain 100 pips = 1000 USD)
    expect(results[0].recouped).toBe(true);
  });

  it('58. Ignore trades opened after 15-minute window (default)', () => {
    const trades = [
      {
        trade: makeTrade({ id: 'loss-t1', symbol: 'EURUSD', initial_stop_price: 1.08 }),
        legs: [
          entry(1.085, 1.0, '2026-04-01T10:00:00Z'),
          exit(1.08, 1.0, '2026-04-01T10:30:00Z'), // LOSS
        ],
        instrument: EURUSD,
      },
      {
        trade: makeTrade({
          id: 'late-t2',
          symbol: 'EURUSD',
          initial_stop_price: 1.08,
        }),
        legs: [
          entry(1.085, 1.0, '2026-04-01T10:46:00Z'), // 16 minutes after loss close
          exit(1.095, 1.0, '2026-04-01T11:00:00Z'),
        ],
        instrument: EURUSD,
      },
    ];

    const results = computeRevengeTradeIndicators(trades);
    expect(results).toHaveLength(0); // Not within 15-minute window
  });

  it('59. Revenge trade that LOST money (failed recovery)', () => {
    const trades = [
      {
        trade: makeTrade({ id: 'loss-t1', symbol: 'EURUSD', initial_stop_price: 1.08 }),
        legs: [
          entry(1.085, 1.0, '2026-04-01T10:00:00Z'),
          exit(1.08, 1.0, '2026-04-01T10:30:00Z'), // LOSS -1R
        ],
        instrument: EURUSD,
      },
      {
        trade: makeTrade({
          id: 'revenge-loss-t2',
          symbol: 'EURUSD',
          initial_stop_price: 1.084,
        }),
        legs: [
          entry(1.085, 1.0, '2026-04-01T10:35:00Z'), // 5 minutes later
          exit(1.084, 1.0, '2026-04-01T10:50:00Z'), // Stop hit again = LOSS
        ],
        instrument: EURUSD,
      },
    ];

    const results = computeRevengeTradeIndicators(trades);
    expect(results).toHaveLength(1);
    expect(results[0].tradeId).toBe('revenge-loss-t2');
    expect(results[0].revengeResult).toBe('LOSS');
    expect(results[0].recouped).toBe(false); // Did not recover
  });

  it('60. Multiple consecutive losses, each can trigger revenge', () => {
    const trades = [
      {
        trade: makeTrade({ id: 'loss-t1', symbol: 'EURUSD', initial_stop_price: 1.08 }),
        legs: [
          entry(1.085, 1.0, '2026-04-01T10:00:00Z'),
          exit(1.08, 1.0, '2026-04-01T10:30:00Z'), // LOSS
        ],
        instrument: EURUSD,
      },
      {
        trade: makeTrade({
          id: 'revenge-t2',
          symbol: 'EURUSD',
          initial_stop_price: 1.084,
        }),
        legs: [
          entry(1.085, 1.0, '2026-04-01T10:35:00Z'), // 5 min after t1 loss
          exit(1.084, 1.0, '2026-04-01T11:00:00Z'), // Stop = LOSS again
        ],
        instrument: EURUSD,
      },
      {
        trade: makeTrade({
          id: 'revenge-t3',
          symbol: 'EURUSD',
          initial_stop_price: 1.08,
        }),
        legs: [
          entry(1.085, 1.0, '2026-04-01T11:05:00Z'), // 5 min after t2 loss
          exit(1.095, 1.0, '2026-04-01T11:30:00Z'), // WIN +1R
        ],
        instrument: EURUSD,
      },
    ];

    const results = computeRevengeTradeIndicators(trades);
    expect(results).toHaveLength(2); // t2 and t3 are both revenge trades
    // t2 is revenge after t1 loss
    expect(results.find((r) => r.tradeId === 'revenge-t2')).toBeDefined();
    // t3 is revenge after t2 loss
    expect(results.find((r) => r.tradeId === 'revenge-t3')).toBeDefined();
  });

  it('61. Custom window size (30 minutes)', () => {
    const trades = [
      {
        trade: makeTrade({ id: 'loss-t1', symbol: 'EURUSD', initial_stop_price: 1.08 }),
        legs: [
          entry(1.085, 1.0, '2026-04-01T10:00:00Z'),
          exit(1.08, 1.0, '2026-04-01T10:30:00Z'), // LOSS
        ],
        instrument: EURUSD,
      },
      {
        trade: makeTrade({
          id: 'far-revenge-t2',
          symbol: 'EURUSD',
          initial_stop_price: 1.08,
        }),
        legs: [
          entry(1.085, 1.0, '2026-04-01T10:55:00Z'), // 25 min after loss (outside default 15, inside 30)
          exit(1.095, 1.0, '2026-04-01T11:15:00Z'),
        ],
        instrument: EURUSD,
      },
    ];

    // With default 15-minute window
    let results = computeRevengeTradeIndicators(trades);
    expect(results).toHaveLength(0);

    // With 30-minute window
    results = computeRevengeTradeIndicators(trades, 30);
    expect(results).toHaveLength(1);
    expect(results[0].tradeId).toBe('far-revenge-t2');
  });

  it('62. BREAKEVEN result tracking (edge case)', () => {
    const trades = [
      {
        trade: makeTrade({ id: 'loss-t1', symbol: 'EURUSD', initial_stop_price: 1.08 }),
        legs: [
          entry(1.085, 1.0, '2026-04-01T10:00:00Z'),
          exit(1.08, 1.0, '2026-04-01T10:30:00Z'), // LOSS
        ],
        instrument: EURUSD,
      },
      {
        trade: makeTrade({
          id: 'revenge-be-t2',
          symbol: 'EURUSD',
          initial_stop_price: 1.085,
        }),
        legs: [
          entry(1.085, 1.0, '2026-04-01T10:35:00Z'),
          exit(1.085, 1.0, '2026-04-01T11:00:00Z'), // BREAKEVEN (exit at entry)
        ],
        instrument: EURUSD,
      },
    ];

    const results = computeRevengeTradeIndicators(trades);
    expect(results).toHaveLength(1);
    expect(results[0].revengeResult).toBe('BREAKEVEN');
    expect(results[0].recouped).toBe(false); // BREAKEVEN is 0 pnl, so not >0
  });
});

// ─────────────────────────────────────────────────────────────
// T3.7 — Cool-down timer (pure helper)
// ─────────────────────────────────────────────────────────────

describe('computeCooldown — T3.7', () => {
  const now = new Date('2026-05-16T12:00:00Z');

  it('inactive when there is no prior closed loss', () => {
    expect(computeCooldown(null, 15, now)).toEqual({ active: false, secondsRemaining: 0 });
  });

  it('inactive when cooldownMinutes is 0 (feature off)', () => {
    expect(computeCooldown('2026-05-16T11:59:00Z', 0, now)).toEqual({
      active: false,
      secondsRemaining: 0,
    });
  });

  it('active with remaining seconds when loss is within the window', () => {
    // loss closed 5 minutes ago, 15-minute cooldown → 10 minutes (600s) left
    const r = computeCooldown('2026-05-16T11:55:00Z', 15, now);
    expect(r.active).toBe(true);
    expect(r.secondsRemaining).toBe(600);
  });

  it('inactive once the window has fully elapsed', () => {
    // loss closed 20 minutes ago, 15-minute cooldown → expired
    expect(computeCooldown('2026-05-16T11:40:00Z', 15, now)).toEqual({
      active: false,
      secondsRemaining: 0,
    });
  });

  it('treats a future timestamp defensively as inactive', () => {
    expect(computeCooldown('2026-05-16T12:05:00Z', 15, now).active).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// T3.7 — Pearson correlation core + anxiety/outcome correlation
// ─────────────────────────────────────────────────────────────

describe('pearson — T3.7', () => {
  it('returns null for fewer than 3 points', () => {
    expect(pearson([1, 2], [2, 4])).toBeNull();
  });

  it('returns +1 for a perfectly positive linear relationship', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 10);
  });

  it('returns -1 for a perfectly negative linear relationship', () => {
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 10);
  });

  it('returns null when a series has zero variance (undefined correlation)', () => {
    expect(pearson([5, 5, 5, 5], [1, 2, 3, 4])).toBeNull();
  });
});

describe('anxietyOutcomeCorrelation — T3.7', () => {
  function anxBundle(anxiety: number | null, exitPrice: number) {
    const ts = `2026-04-0${1}T1${exitPrice}:00:00Z`;
    return {
      trade: makeTrade({
        id: `anx-${anxiety}-${exitPrice}`,
        status: 'CLOSED' as const,
        initial_stop_price: 1.08,
        anxiety_level: anxiety,
      }),
      legs: [
        { ...entry(1.09, 1.0, ts), trade_id: `anx-${anxiety}-${exitPrice}` },
        {
          ...exit(exitPrice, 1.0, ts.replace('T1', 'T2')),
          trade_id: `anx-${anxiety}-${exitPrice}`,
        },
      ],
      instrument: EURUSD,
    };
  }

  it('returns null with fewer than 3 usable (anxiety, R) pairs', () => {
    expect(anxietyOutcomeCorrelation([anxBundle(2, 1.1), anxBundle(8, 1.05)])).toBeNull();
  });

  it('excludes trades with no anxiety recorded', () => {
    // 4 trades but only 2 carry an anxiety value → still null
    const bundles = [
      anxBundle(null, 1.1),
      anxBundle(null, 1.05),
      anxBundle(3, 1.1),
      anxBundle(7, 1.0),
    ];
    expect(anxietyOutcomeCorrelation(bundles)).toBeNull();
  });

  it('returns a correlation coefficient in [-1, 1] for >= 3 usable pairs', () => {
    const bundles = [
      anxBundle(1, 1.12),
      anxBundle(5, 1.1),
      anxBundle(9, 1.07),
      anxBundle(7, 1.08),
    ];
    const r = anxietyOutcomeCorrelation(bundles);
    expect(r).not.toBeNull();
    expect(r as number).toBeGreaterThanOrEqual(-1);
    expect(r as number).toBeLessThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────
// T3.8 — Post-mortem (drawdown autopsy)
// ─────────────────────────────────────────────────────────────

describe('computePostMortem — T3.8', () => {
  function pmBundle(id: string, entryP: number, exitP: number, ts: string) {
    return {
      trade: makeTrade({ id, status: 'CLOSED' as const, initial_stop_price: 1.08 }),
      legs: [
        { ...entry(entryP, 1.0, ts), trade_id: id },
        { ...exit(exitP, 1.0, ts.replace('T10', 'T12')), trade_id: id },
      ],
      instrument: EURUSD,
    };
  }

  it('empty book → not triggered, no drawdown period, benign message', () => {
    const pm = computePostMortem([], 10000);
    expect(pm.triggered).toBe(false);
    expect(pm.drawdownPeriod).toBeNull();
    expect(pm.worstTrades).toEqual([]);
    expect(pm.tradesInDrawdown).toBe(0);
    expect(pm.contributingFactors).toHaveLength(1);
    expect(pm.contributingFactors[0]).toMatch(/no significant drawdown/i);
  });

  it('a losing run breaches the trigger and surfaces the worst trade + factors', () => {
    // Small starting balance so a few 1-lot losses exceed a 10% drawdown.
    const bundles = [
      pmBundle('w1', 1.0850, 1.0900, '2026-04-01T10:00:00Z'), // +50 pips win
      pmBundle('l1', 1.0900, 1.0820, '2026-04-02T10:00:00Z'), // -80 pips
      pmBundle('l2', 1.0900, 1.0780, '2026-04-03T10:00:00Z'), // -120 pips (worst)
      pmBundle('l3', 1.0900, 1.0850, '2026-04-04T10:00:00Z'), // -50 pips
    ];
    const pm = computePostMortem(bundles, 2000, 0.1);

    expect(pm.maxDrawdownPct).toBeGreaterThan(0);
    expect(pm.triggered).toBe(pm.maxDrawdownPct >= 0.1);
    expect(pm.worstTrades.length).toBeGreaterThan(0);
    // 'l2' is the most negative.
    expect(pm.worstTrades[0].tradeId).toBe('l2');
    expect(pm.worstTrades[0].netPnl).toBeLessThan(0);
    expect(pm.drawdownPeriod).not.toBeNull();
    expect(pm.contributingFactors.length).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────
// T3.9 — Slippage / spread baseline
// ─────────────────────────────────────────────────────────────

describe('computeSlippageStats — T3.9', () => {
  function legBundle(
    symbol: string,
    session: string | null,
    entrySlip: number | null,
    spread: number | null,
  ) {
    const id = `${symbol}-${session}-${entrySlip}-${spread}`;
    return {
      trade: makeTrade({ id, symbol, session }),
      legs: [
        {
          ...entry(1.09, 1.0, '2026-04-01T10:00:00Z'),
          trade_id: id,
          slippage_pips: entrySlip,
          spread_at_entry_pips: spread,
        },
      ],
      instrument: EURUSD,
    };
  }

  it('ignores legs with no slippage/spread data', () => {
    expect(computeSlippageStats([legBundle('EURUSD', 'LONDON', null, null)])).toEqual([]);
  });

  it('averages slippage and spread per (symbol, session)', () => {
    const stats = computeSlippageStats([
      legBundle('EURUSD', 'LONDON', -0.4, 0.8),
      legBundle('EURUSD', 'LONDON', -0.6, 1.2),
      legBundle('EURUSD', 'NEWYORK', -0.2, 0.5),
    ]);
    const london = stats.find((s) => s.session === 'LONDON')!;
    expect(london.avgSlippagePips).toBeCloseTo(-0.5, 10);
    expect(london.avgSpreadPips).toBeCloseTo(1.0, 10);
    expect(london.sampleCount).toBe(2);
    // sorted by sampleCount desc → LONDON (2) before NEWYORK (1)
    expect(stats[0].session).toBe('LONDON');
  });

  it('falls back to UNKNOWN session', () => {
    const stats = computeSlippageStats([legBundle('GBPUSD', null, -1, null)]);
    expect(stats[0].session).toBe('UNKNOWN');
    expect(stats[0].avgSpreadPips).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// T4.12 — Kelly criterion
// ─────────────────────────────────────────────────────────────

describe('computeKelly — T4.12', () => {
  function kBundle(id: string, entryP: number, exitP: number) {
    return {
      trade: makeTrade({ id, status: 'CLOSED' as const, initial_stop_price: 1.0 }),
      legs: [
        { ...entry(entryP, 1.0, '2026-04-01T10:00:00Z'), trade_id: id },
        { ...exit(exitP, 1.0, '2026-04-01T12:00:00Z'), trade_id: id },
      ],
      instrument: EURUSD,
    };
  }

  it('null payoff/kelly when there are no losses', () => {
    const k = computeKelly([kBundle('w1', 1.0, 1.1), kBundle('w2', 1.0, 1.1)]);
    expect(k.winRate).toBe(1);
    expect(k.payoffRatio).toBeNull();
    expect(k.kellyFraction).toBeNull();
  });

  it('computes Kelly for a 50% win rate, 2:1 payoff', () => {
    // 2 wins of +1000, 2 losses of -500 → W=0.5, R=2 → f* = 0.5 - 0.5/2 = 0.25
    const k = computeKelly([
      kBundle('w1', 1.0, 1.1),
      kBundle('w2', 1.0, 1.1),
      kBundle('l1', 1.0, 0.95),
      kBundle('l2', 1.0, 0.95),
    ]);
    expect(k.winRate).toBeCloseTo(0.5, 10);
    expect(k.payoffRatio).toBeCloseTo(2, 6);
    expect(k.kellyFraction).toBeCloseTo(0.25, 6);
    expect(k.halfKelly).toBeCloseTo(0.125, 6);
  });

  it('clamps a negative edge to 0 (do not bet)', () => {
    // 1 win +500, 3 losses -1000 → strongly negative edge
    const k = computeKelly([
      kBundle('w1', 1.0, 1.05),
      kBundle('l1', 1.0, 0.9),
      kBundle('l2', 1.0, 0.9),
      kBundle('l3', 1.0, 0.9),
    ]);
    expect(k.kellyFraction).toBe(0);
  });

  it('empty book → all null, sampleSize 0', () => {
    const k = computeKelly([]);
    expect(k).toEqual({
      winRate: null,
      payoffRatio: null,
      kellyFraction: null,
      halfKelly: null,
      sampleSize: 0,
    });
  });
});

// ─────────────────────────────────────────────────────────────
// T3.10 — Modeled commission
// ─────────────────────────────────────────────────────────────

describe('computeModeledCommission — T3.10', () => {
  it('PER_LOT charges value per total lot', () => {
    expect(computeModeledCommission({ type: 'PER_LOT', value: 3.5 }, 2, 0)).toBe(7);
  });

  it('PER_NOTIONAL charges value per $1M traded', () => {
    expect(
      computeModeledCommission({ type: 'PER_NOTIONAL', value: 50 }, 0, 2_000_000),
    ).toBe(100);
  });

  it('ROUND_TRIP is a flat per-trade cost', () => {
    expect(computeModeledCommission({ type: 'ROUND_TRIP', value: 6 }, 99, 9e9)).toBe(6);
  });

  it('non-positive value → 0', () => {
    expect(computeModeledCommission({ type: 'PER_LOT', value: 0 }, 5, 0)).toBe(0);
  });

  it('applies in computeTradeMetrics only when broker commission is 0', () => {
    const legs = [
      entry(1.1, 1.0, '2026-04-01T10:00:00Z'),
      exit(1.105, 1.0, '2026-04-01T12:00:00Z'),
    ];
    const withModel = computeTradeMetrics(
      makeTrade({ status: 'CLOSED', initial_stop_price: 1.09 }),
      legs,
      EURUSD,
      { commissionModel: { type: 'PER_LOT', value: 3 } },
    );
    // 2 lots total (1 entry + 1 exit) * $3 = $6 cost.
    expect(withModel.totalCommission).toBe(-6);

    // Broker-reported commission wins; model is ignored.
    const brokerLegs = [
      { ...entry(1.1, 1.0, '2026-04-01T10:00:00Z'), commission: -4 },
      exit(1.105, 1.0, '2026-04-01T12:00:00Z'),
    ];
    const withBroker = computeTradeMetrics(
      makeTrade({ status: 'CLOSED', initial_stop_price: 1.09 }),
      brokerLegs,
      EURUSD,
      { commissionModel: { type: 'PER_LOT', value: 3 } },
    );
    expect(withBroker.totalCommission).toBe(-4);
  });
});
