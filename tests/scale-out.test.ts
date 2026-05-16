import { describe, it, expect } from 'vitest';
import { computeScaleOutPlan, trackScaleOut } from '../src/lib/scale-out';

describe('computeScaleOutPlan — T5.6', () => {
  it('computes R per rung and blended R for a LONG ladder', () => {
    // entry 1.10, stop 1.09 → risk 0.01 (1R = 0.01)
    const plan = computeScaleOutPlan(1.1, 1.09, 'LONG', [
      { price: 1.11, sizePct: 0.5 }, // +1R
      { price: 1.12, sizePct: 0.3 }, // +2R
      { price: 1.13, sizePct: 0.2 }, // +3R
    ]);
    expect(plan.rungs.map((r) => Math.round(r.rMultiple))).toEqual([1, 2, 3]);
    // 0.5·1 + 0.3·2 + 0.2·3 = 1.7R
    expect(plan.blendedR).toBeCloseTo(1.7, 6);
    expect(plan.totalSizePct).toBeCloseTo(1, 6);
    expect(plan.valid).toBe(true);
  });

  it('handles SHORT direction', () => {
    const plan = computeScaleOutPlan(1.1, 1.11, 'SHORT', [{ price: 1.08, sizePct: 1 }]);
    expect(plan.rungs[0].rMultiple).toBeCloseTo(2, 6); // (1.10-1.08)/0.01
  });

  it('invalid when sizes exceed 100%', () => {
    const plan = computeScaleOutPlan(1.1, 1.09, 'LONG', [
      { price: 1.11, sizePct: 0.8 },
      { price: 1.12, sizePct: 0.5 },
    ]);
    expect(plan.valid).toBe(false);
  });

  it('zero risk → 0R, invalid', () => {
    const plan = computeScaleOutPlan(1.1, 1.1, 'LONG', [{ price: 1.12, sizePct: 1 }]);
    expect(plan.rungs[0].rMultiple).toBe(0);
  });
});

describe('trackScaleOut — T5.6', () => {
  const plan = computeScaleOutPlan(1.1, 1.09, 'LONG', [
    { price: 1.11, sizePct: 0.5 },
    { price: 1.12, sizePct: 0.5 },
  ]); // blended 1.5R

  it('detects following the plan', () => {
    const t = trackScaleOut(1.1, 1.09, 'LONG', plan, [
      { price: 1.11, sizePct: 0.5 },
      { price: 1.12, sizePct: 0.5 },
    ]);
    expect(t.followedPlan).toBe(true);
    expect(t.deltaR).toBeCloseTo(0, 6);
    expect(t.realizedSizePct).toBeCloseTo(1, 6);
  });

  it('flags deviation when exiting early below plan', () => {
    const t = trackScaleOut(1.1, 1.09, 'LONG', plan, [{ price: 1.105, sizePct: 1 }]);
    expect(t.followedPlan).toBe(false);
    expect(t.realizedBlendedR).toBeCloseTo(0.5, 6);
    expect(t.deltaR).toBeCloseTo(-1, 6);
  });
});
