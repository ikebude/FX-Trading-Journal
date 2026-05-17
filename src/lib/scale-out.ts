/**
 * T5.6 — Scale-out / partial-close ladder planner (pure).
 *
 * Plan TP1/TP2/TP3 (price + % of position) at entry; the planner returns
 * the R-multiple and weighted blended R for the ladder. trackScaleOut
 * compares realized exits against the plan. No P&L currency math here —
 * R-multiples only, and the R formula itself comes from pnl.ts
 * (rMultipleFromPrices) — Rule 3: no reimplemented P&L/R math here.
 */
import { rMultipleFromPrices, type Direction } from './pnl';

export type { Direction };

export interface ScaleOutLeg {
  /** Take-profit price for this rung. */
  price: number;
  /** Fraction of the position closed at this rung (0–1). */
  sizePct: number;
}

export interface PlannedRung extends ScaleOutLeg {
  /** R-multiple at this rung's price given entry/stop. */
  rMultiple: number;
}

export interface ScaleOutPlan {
  rungs: PlannedRung[];
  /** Σ sizePct·R over all rungs (blended expectancy if plan is followed). */
  blendedR: number;
  /** Σ sizePct — should be ≤ 1; flagged when it exceeds 1. */
  totalSizePct: number;
  valid: boolean;
}

export function computeScaleOutPlan(
  entry: number,
  stop: number,
  direction: Direction,
  legs: ScaleOutLeg[],
): ScaleOutPlan {
  const rungs = legs.map((l) => ({
    ...l,
    rMultiple: rMultipleFromPrices(entry, stop, l.price, direction),
  }));
  const totalSizePct = rungs.reduce((s, r) => s + r.sizePct, 0);
  const blendedR = rungs.reduce((s, r) => s + r.sizePct * r.rMultiple, 0);
  return {
    rungs,
    blendedR,
    totalSizePct,
    valid:
      legs.length > 0 &&
      totalSizePct > 0 &&
      totalSizePct <= 1 + 1e-9 &&
      legs.every((l) => l.sizePct > 0),
  };
}

export interface RealizedExit {
  price: number;
  sizePct: number;
}

export interface ScaleOutTracking {
  plannedBlendedR: number;
  realizedBlendedR: number;
  /** realized − planned (positive = beat the plan). */
  deltaR: number;
  /** Fraction of the position actually exited. */
  realizedSizePct: number;
  followedPlan: boolean;
}

/**
 * Compare realized exits to the plan. "Followed plan" = realized size
 * within 5% of planned and blended-R within 0.1R.
 */
export function trackScaleOut(
  entry: number,
  stop: number,
  direction: Direction,
  plan: ScaleOutPlan,
  realized: RealizedExit[],
): ScaleOutTracking {
  const realizedSizePct = realized.reduce((s, r) => s + r.sizePct, 0);
  const realizedBlendedR = realized.reduce(
    (s, r) => s + r.sizePct * rMultipleFromPrices(entry, stop, r.price, direction),
    0,
  );
  const deltaR = realizedBlendedR - plan.blendedR;
  return {
    plannedBlendedR: plan.blendedR,
    realizedBlendedR,
    deltaR,
    realizedSizePct,
    followedPlan:
      Math.abs(realizedSizePct - plan.totalSizePct) <= 0.05 &&
      Math.abs(deltaR) <= 0.1,
  };
}
