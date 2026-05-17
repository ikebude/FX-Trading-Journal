/**
 * equity-curve.ts — Modified Dietz equity curve builder.
 *
 * Merges trade-close events with external cash flows (deposits / withdrawals)
 * into a single timeline, then applies the Modified Dietz method to produce
 * a performance return that is not distorted by the timing of deposits.
 *
 * Sub-period return  = periodPnl / periodStartBalance
 * Cumulative return  = ∏(1 + subPeriodReturn_i) − 1   (chain-linked)
 *
 * Each sub-period spans the time between two consecutive cash-flow events.
 * This is equivalent to Modified Dietz when all cash flows fall exactly on
 * sub-period boundaries — the standard assumption for a single-account journal.
 */

import type { EquityPoint } from './pnl';

// ─────────────────────────────────────────────────────────────
// Public API types
// ─────────────────────────────────────────────────────────────

export interface CashFlow {
  timestampUtc: string;
  amount: number;   // signed: positive = deposit/bonus, negative = withdrawal/charge
  opType: string;
}

export interface DietzPoint {
  timestamp: string;
  balance: number;
  modDietzReturn: number;   // cumulative return as decimal (0.15 = +15%)
  drawdown: number;         // drawdown from all-time peak balance
  drawdownPct: number;      // drawdown % from peak
  cashFlowAmount?: number;  // non-zero when this point is a deposit/withdrawal event
}

// ─────────────────────────────────────────────────────────────
// Internal event union
// ─────────────────────────────────────────────────────────────

type TradeEvent = { kind: 'trade'; timestamp: string; netPnl: number };
type CashFlowEvent = { kind: 'cashflow'; timestamp: string; amount: number; opType: string };
type Event = TradeEvent | CashFlowEvent;

// ─────────────────────────────────────────────────────────────
// Core builder
// ─────────────────────────────────────────────────────────────

/**
 * Builds a Modified Dietz equity curve.
 *
 * @param startingBalance  Account balance before the first trade.
 * @param equityPoints     Chronological equity-curve points from pnl.computeAggregateMetrics().
 *                         Per-trade P&L is reconstructed from successive equity differences.
 * @param cashFlows        External deposits / withdrawals from the balance_operations table.
 */
export function buildModifiedDietzCurve(
  startingBalance: number,
  equityPoints: EquityPoint[],
  cashFlows: CashFlow[],
): DietzPoint[] {
  // Derive per-trade P&L from equity differences
  const tradeEvents: TradeEvent[] = equityPoints.map((pt, i) => ({
    kind: 'trade',
    timestamp: pt.timestamp,
    netPnl: i === 0 ? pt.equity - startingBalance : pt.equity - equityPoints[i - 1].equity,
  }));

  const cashFlowEvents: CashFlowEvent[] = cashFlows.map((cf) => ({
    kind: 'cashflow',
    timestamp: cf.timestampUtc,
    amount: cf.amount,
    opType: cf.opType,
  }));

  // Merge chronologically; at equal timestamps cash flows are processed before trades
  // so that a same-day deposit is already in the account when trades are recorded.
  const events: Event[] = [...tradeEvents, ...cashFlowEvents].sort((a, b) => {
    const cmp = a.timestamp.localeCompare(b.timestamp);
    if (cmp !== 0) return cmp;
    return a.kind === 'cashflow' ? -1 : 1;
  });

  const points: DietzPoint[] = [];
  let balance = startingBalance;
  let peakBalance = startingBalance;

  // Modified Dietz sub-period state
  let periodStartBalance = startingBalance;
  let periodPnl = 0;
  let prevLinkedReturn = 0; // chained return from all completed sub-periods

  function calcLinkedReturn(intraperiodPnl: number): number {
    if (periodStartBalance <= 0) return prevLinkedReturn;
    const r = intraperiodPnl / periodStartBalance;
    return (1 + prevLinkedReturn) * (1 + r) - 1;
  }

  for (const event of events) {
    if (event.kind === 'cashflow') {
      // Close the current sub-period before applying the cash flow
      prevLinkedReturn = calcLinkedReturn(periodPnl);
      periodPnl = 0;

      balance += event.amount;
      periodStartBalance = balance; // new sub-period starts at post-deposit balance

      if (balance > peakBalance) peakBalance = balance;
      const drawdown = Math.max(0, peakBalance - balance);
      const drawdownPct = peakBalance > 0 ? (drawdown / peakBalance) * 100 : 0;

      points.push({
        timestamp: event.timestamp,
        balance,
        modDietzReturn: prevLinkedReturn,
        drawdown,
        drawdownPct,
        cashFlowAmount: event.amount,
      });
    } else {
      balance += event.netPnl;
      periodPnl += event.netPnl;

      if (balance > peakBalance) peakBalance = balance;
      const drawdown = Math.max(0, peakBalance - balance);
      const drawdownPct = peakBalance > 0 ? (drawdown / peakBalance) * 100 : 0;

      points.push({
        timestamp: event.timestamp,
        balance,
        modDietzReturn: calcLinkedReturn(periodPnl),
        drawdown,
        drawdownPct,
      });
    }
  }

  return points;
}
