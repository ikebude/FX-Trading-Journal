import { describe, it, expect } from 'vitest';
import {
  computeMarginUsage,
  correlationAdjustedRisk,
  type ExposurePosition,
} from '../src/lib/risk-exposure';

const p = (o: Partial<ExposurePosition> & { symbol: string }): ExposurePosition => ({
  direction: 'LONG',
  notional: 100_000,
  ...o,
});

describe('computeMarginUsage — T5.10', () => {
  it('computes margin, utilisation and effective leverage', () => {
    const m = computeMarginUsage(
      [p({ symbol: 'EURUSD', notional: 100_000 }), p({ symbol: 'GBPUSD', notional: 100_000 })],
      10_000,
      100,
    );
    expect(m.totalNotional).toBe(200_000);
    expect(m.marginUsed).toBe(2_000); // 200k / 100
    expect(m.marginUtilisation).toBeCloseTo(0.2, 6);
    expect(m.effectiveLeverage).toBeCloseTo(20, 6);
  });
  it('handles zero equity / leverage safely', () => {
    const m = computeMarginUsage([p({ symbol: 'EURUSD' })], 0, 0);
    expect(m.marginUtilisation).toBe(0);
    expect(m.effectiveLeverage).toBe(0);
  });
});

describe('correlationAdjustedRisk — T5.10', () => {
  it('equals naive sum when uncorrelated independent (ρ=0 off-diagonal)', () => {
    const r = correlationAdjustedRisk([
      p({ symbol: 'EURUSD', riskAmount: 300 }),
      p({ symbol: 'USDJPY', riskAmount: 400 }),
    ]);
    expect(r.naiveRisk).toBe(700);
    // sqrt(300^2 + 400^2) = 500
    expect(r.adjustedRisk).toBeCloseTo(500, 6);
  });

  it('amplifies risk for positively-correlated same-direction positions', () => {
    const r = correlationAdjustedRisk(
      [
        p({ symbol: 'EURUSD', direction: 'LONG', riskAmount: 300 }),
        p({ symbol: 'GBPUSD', direction: 'LONG', riskAmount: 400 }),
      ],
      { EURUSD: { GBPUSD: 1 }, GBPUSD: { EURUSD: 1 } },
    );
    // perfectly correlated, same direction → sqrt((300+400)^2) = 700
    expect(r.adjustedRisk).toBeCloseTo(700, 6);
  });

  it('nets risk for an opposite-direction perfectly-correlated hedge', () => {
    const r = correlationAdjustedRisk(
      [
        p({ symbol: 'EURUSD', direction: 'LONG', riskAmount: 300 }),
        p({ symbol: 'GBPUSD', direction: 'SHORT', riskAmount: 300 }),
      ],
      { EURUSD: { GBPUSD: 1 }, GBPUSD: { EURUSD: 1 } },
    );
    expect(r.adjustedRisk).toBeCloseTo(0, 6);
    expect(r.naiveRisk).toBe(600);
  });
});
