/**
 * Tests for src/lib/risk-calc.ts
 */
import { describe, it, expect } from 'vitest';
import { computeLotSize, computePipValuePerLot } from '../src/lib/risk-calc';

// ─────────────────────────────────────────────────────────────
// computePipValuePerLot
// ─────────────────────────────────────────────────────────────

describe('computePipValuePerLot', () => {
  it('EURUSD (quote=USD, account=USD) — pip value = pipSize * contractSize', () => {
    const v = computePipValuePerLot(0.0001, 100000, 1.0850, 'USD', 'USD');
    expect(v).toBeCloseTo(10, 5); // 0.0001 * 100000 = $10 per pip per lot
  });

  it('USDJPY (quote=JPY, account=USD) — pip value = pipSize * contractSize / entry', () => {
    const v = computePipValuePerLot(0.01, 100000, 150.00, 'JPY', 'USD');
    // 0.01 * 100000 / 150 = ~$6.67
    expect(v).toBeCloseTo(6.6667, 3);
  });

  it('GBPUSD (quote=USD, account=USD) — same as EURUSD formula', () => {
    const v = computePipValuePerLot(0.0001, 100000, 1.2700, 'USD', 'USD');
    expect(v).toBeCloseTo(10, 5);
  });

  it('AUDUSD (quote=USD, account=USD)', () => {
    const v = computePipValuePerLot(0.0001, 100000, 0.6500, 'USD', 'USD');
    expect(v).toBeCloseTo(10, 5);
  });

  it('zero entry price returns raw pip value (no division by zero)', () => {
    const v = computePipValuePerLot(0.0001, 100000, 0, 'JPY', 'USD');
    expect(v).toBeCloseTo(10, 5); // falls back to rawPipValue
  });
});

// ─────────────────────────────────────────────────────────────
// computeLotSize
// ─────────────────────────────────────────────────────────────

describe('computeLotSize', () => {
  const base = {
    accountBalance: 10000,
    riskPercent: 1,          // risk $100
    entryPrice: 1.0850,
    stopPrice: 1.0800,       // 50 pip stop
    pipSize: 0.0001,
    contractSize: 100000,
    quoteCurrency: 'USD',
    accountCurrency: 'USD',
  };

  it('EURUSD — 1% of $10k with 50-pip stop = 0.20 lots', () => {
    const r = computeLotSize(base);
    // risk = $100, pipsAtRisk = 50, pipValue = $10/lot
    // lots = 100 / (50 * 10) = 0.20
    expect(r.riskAmount).toBeCloseTo(100);
    expect(r.pipsAtRisk).toBeCloseTo(50);
    expect(r.lotSize).toBeCloseTo(0.20, 4);
    expect(r.lotSizeRounded).toBe(0.20);
  });

  it('2% risk doubles the lot size', () => {
    const r = computeLotSize({ ...base, riskPercent: 2 });
    expect(r.lotSize).toBeCloseTo(0.40, 4);
    expect(r.lotSizeRounded).toBe(0.40);
  });

  it('wider stop reduces lot size', () => {
    const r = computeLotSize({ ...base, stopPrice: 1.0750 }); // 100-pip stop
    expect(r.pipsAtRisk).toBeCloseTo(100);
    expect(r.lotSize).toBeCloseTo(0.10, 4);
  });

  it('lotSizeRounded floors to 0.01 precision (never rounds up)', () => {
    // $100 / (33 * $10) = 0.30303... → floored to 0.30
    const r = computeLotSize({ ...base, stopPrice: 1.0850 - 33 * 0.0001 });
    expect(r.lotSizeRounded).toBe(0.30);
  });

  it('zero stop distance returns lotSize 0 (no division by zero)', () => {
    const r = computeLotSize({ ...base, stopPrice: base.entryPrice });
    expect(r.lotSize).toBe(0);
    expect(r.lotSizeRounded).toBe(0);
  });

  it('projected R:R when target is provided', () => {
    const r = computeLotSize({ ...base, targetPrice: 1.0950 }); // 100 pips target
    // pipsAtRisk=50, pipsToTarget=100 → R:R = 2.0
    expect(r.projectedRR).toBeCloseTo(2.0, 4);
    // reward = 100 pips * $10/pip * 0.20 lots = $200
    expect(r.projectedReward).toBeCloseTo(200, 1);
  });

  it('no target → projectedReward and projectedRR are null', () => {
    const r = computeLotSize(base);
    expect(r.projectedReward).toBeNull();
    expect(r.projectedRR).toBeNull();
  });

  it('USDJPY — pip value adjusted by price, lot size reflects cross-pair conversion', () => {
    const r = computeLotSize({
      accountBalance: 10000,
      riskPercent: 1,
      entryPrice: 150.00,
      stopPrice: 150.00 - 0.50, // 50 pip stop (pip = 0.01)
      pipSize: 0.01,
      contractSize: 100000,
      quoteCurrency: 'JPY',
      accountCurrency: 'USD',
    });
    expect(r.pipsAtRisk).toBeCloseTo(50);
    // pipValue = 0.01 * 100000 / 150 ≈ $6.667/lot
    // lots = 100 / (50 * 6.667) ≈ 0.30
    expect(r.lotSize).toBeGreaterThan(0.28);
    expect(r.lotSize).toBeLessThan(0.32);
  });

  it('large account size scales linearly', () => {
    const small = computeLotSize(base);
    const big = computeLotSize({ ...base, accountBalance: 100000 });
    expect(big.lotSize).toBeCloseTo(small.lotSize * 10, 4);
  });
});
