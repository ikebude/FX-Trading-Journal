/**
 * T5.5 — Funded-account payout, consistency, and weekend-flat tracking.
 * Pure, fully unit-tested. UTC ISO-8601 timestamps throughout (Rule 2).
 */

export interface PayoutInputTrade {
  closedAtUtc: string | null;
  netPnl: number | null;
}

export interface PayoutProgress {
  totalProfit: number;
  target: number;
  /** 0–1, clamped. */
  progress: number;
  eligible: boolean;
  remaining: number;
}

/** Profit toward a payout/profit target. Losses count (can go negative). */
export function computePayoutProgress(
  trades: PayoutInputTrade[],
  target: number,
): PayoutProgress {
  const totalProfit = trades.reduce((s, t) => s + (t.netPnl ?? 0), 0);
  const progress = target > 0 ? Math.max(0, Math.min(1, totalProfit / target)) : 0;
  return {
    totalProfit,
    target,
    progress,
    eligible: target > 0 && totalProfit >= target,
    remaining: Math.max(0, target - totalProfit),
  };
}

export interface ConsistencyResult {
  /** Best single UTC day's profit. */
  bestDayProfit: number;
  bestDay: string | null;
  totalProfit: number;
  /** bestDayProfit / totalProfit (0 when no positive total). */
  bestDayShare: number;
  /** Max allowed share (e.g. 0.4 = no day may exceed 40% of total). */
  maxShare: number;
  passed: boolean;
}

/**
 * Consistency rule: no single trading day may contribute more than
 * `maxShare` of total profit. Only meaningful with a positive total.
 */
export function checkConsistencyRule(
  trades: PayoutInputTrade[],
  maxShare: number,
): ConsistencyResult {
  const byDay = new Map<string, number>();
  let total = 0;
  for (const t of trades) {
    if (!t.closedAtUtc) continue;
    const day = t.closedAtUtc.slice(0, 10);
    const v = t.netPnl ?? 0;
    byDay.set(day, (byDay.get(day) ?? 0) + v);
    total += v;
  }
  let bestDay: string | null = null;
  let bestDayProfit = -Infinity;
  for (const [day, v] of byDay) {
    if (v > bestDayProfit) {
      bestDayProfit = v;
      bestDay = day;
    }
  }
  if (bestDay === null) bestDayProfit = 0;
  const bestDayShare = total > 0 ? bestDayProfit / total : 0;
  return {
    bestDayProfit,
    bestDay,
    totalProfit: total,
    bestDayShare,
    maxShare,
    passed: total <= 0 ? true : bestDayShare <= maxShare,
  };
}

export interface WeekendOpenInput {
  tradeId: string;
  symbol: string;
  openedAtUtc: string;
  closedAtUtc: string | null;
}

/**
 * Positions that were still open across a weekend (held past Friday
 * 22:00 UTC into the market close). Pure.
 */
export function detectWeekendOpenPositions(
  positions: WeekendOpenInput[],
  now: Date,
): WeekendOpenInput[] {
  const nowMs = now.getTime();
  return positions.filter((p) => {
    if (p.closedAtUtc) return false;
    const opened = new Date(p.openedAtUtc);
    if (Number.isNaN(opened.getTime())) return false;
    // Walk forward from open to now; if any Friday 22:00 UTC boundary is
    // crossed while still open, it spans a weekend.
    const cursor = new Date(opened);
    while (cursor.getTime() <= nowMs) {
      if (cursor.getUTCDay() === 5 && cursor.getUTCHours() >= 22) return true;
      if (cursor.getUTCDay() === 6) return true; // Saturday
      cursor.setUTCHours(cursor.getUTCHours() + 1);
    }
    return false;
  });
}
