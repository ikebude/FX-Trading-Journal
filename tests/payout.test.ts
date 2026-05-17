import { describe, it, expect } from 'vitest';
import {
  computePayoutProgress,
  checkConsistencyRule,
  detectWeekendOpenPositions,
} from '../src/lib/payout';

describe('computePayoutProgress — T5.5', () => {
  it('tracks profit toward target and flags eligibility', () => {
    const r = computePayoutProgress(
      [{ closedAtUtc: '2026-04-01T10:00:00Z', netPnl: 600 }, { closedAtUtc: '2026-04-02T10:00:00Z', netPnl: 450 }],
      1000,
    );
    expect(r.totalProfit).toBe(1050);
    expect(r.eligible).toBe(true);
    expect(r.progress).toBe(1);
    expect(r.remaining).toBe(0);
  });
  it('clamps progress and reports remaining when short', () => {
    const r = computePayoutProgress([{ closedAtUtc: 'x', netPnl: 250 }], 1000);
    expect(r.progress).toBeCloseTo(0.25, 6);
    expect(r.eligible).toBe(false);
    expect(r.remaining).toBe(750);
  });
});

describe('checkConsistencyRule — T5.5', () => {
  it('passes when no day exceeds the max share', () => {
    const r = checkConsistencyRule(
      [
        { closedAtUtc: '2026-04-01T10:00:00Z', netPnl: 300 },
        { closedAtUtc: '2026-04-02T10:00:00Z', netPnl: 300 },
        { closedAtUtc: '2026-04-03T10:00:00Z', netPnl: 400 },
      ],
      0.5,
    );
    expect(r.passed).toBe(true);
    expect(r.bestDayShare).toBeCloseTo(0.4, 6);
  });
  it('fails when one day dominates profit', () => {
    const r = checkConsistencyRule(
      [
        { closedAtUtc: '2026-04-01T10:00:00Z', netPnl: 900 },
        { closedAtUtc: '2026-04-02T10:00:00Z', netPnl: 100 },
      ],
      0.4,
    );
    expect(r.passed).toBe(false);
    expect(r.bestDay).toBe('2026-04-01');
    expect(r.bestDayShare).toBeCloseTo(0.9, 6);
  });
  it('passes trivially when total ≤ 0', () => {
    expect(checkConsistencyRule([{ closedAtUtc: 'x', netPnl: -50 }], 0.4).passed).toBe(true);
  });
});

describe('detectWeekendOpenPositions — T5.5', () => {
  const now = new Date('2026-04-06T12:00:00Z'); // Monday

  it('flags a position opened Thursday and still open Monday', () => {
    const w = detectWeekendOpenPositions(
      [{ tradeId: 't', symbol: 'EURUSD', openedAtUtc: '2026-04-02T10:00:00Z', closedAtUtc: null }],
      now,
    );
    expect(w).toHaveLength(1);
  });
  it('does not flag an intraday position closed Friday', () => {
    const w = detectWeekendOpenPositions(
      [{ tradeId: 't', symbol: 'EURUSD', openedAtUtc: '2026-04-03T08:00:00Z', closedAtUtc: '2026-04-03T20:00:00Z' }],
      now,
    );
    expect(w).toEqual([]);
  });
  it('does not flag a Monday-opened still-open position', () => {
    const w = detectWeekendOpenPositions(
      [{ tradeId: 't', symbol: 'EURUSD', openedAtUtc: '2026-04-06T09:00:00Z', closedAtUtc: null }],
      now,
    );
    expect(w).toEqual([]);
  });
});
