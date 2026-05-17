/**
 * Balance reconciliation engine — v1.1 T1.5
 *
 * Purpose: an account's current balance is a *ledger*, not just a sum of
 * trade P&L. The reconciliation engine verifies:
 *
 *   expectedBalance = initialBalance
 *                   + Σ(balance_operations.amount)  // signed: + credit, - debit
 *                   + Σ(closed trade netPnl)        // includes commission + swap
 *
 * If |reportedBalance - expectedBalance| > tolerance, the account is "drifting"
 * and the UI must surface a non-dismissable drift banner so the trader can
 * investigate *before* trusting any downstream analytics (dashboard, equity
 * curve, prop-firm rule checks).
 *
 * This module is PURE — no DB, no IO, no globals. That's what makes the
 * "1000 synthetic deal events with zero drift" property test (v1.1 plan
 * §1.5) enforceable: the IPC handler is a thin wrapper that loads rows
 * from Drizzle and delegates to `reconcileBalance`.
 *
 * Sign convention (mirrors `balance_operations.amount` in schema.ts):
 *   positive = credit  (DEPOSIT, BONUS, INTEREST, CORRECTION+, CREDIT)
 *   negative = debit   (WITHDRAWAL, CHARGE, COMMISSION, PAYOUT, CORRECTION-)
 *
 * Currency: the caller is responsible for passing all amounts in the
 * account's base currency. Multi-currency reconciliation is handled one
 * level up; this engine is deliberately currency-agnostic.
 */

import type { BalanceOperation } from './db/schema';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

/**
 * Minimal shape needed from a closed trade. We intentionally do NOT take the
 * full `Trade` row — the reconcile engine cares only about realised P&L.
 * Open / partial trades must be excluded by the caller; unrealised P&L
 * belongs in *equity*, not *balance*.
 */
export interface ReconcileTradePnl {
  tradeId: string;
  closedAtUtc: string; // ISO-8601 UTC
  netPnl: number;      // already includes commission + swap
}

/**
 * Minimal shape needed from a balance operation row. We accept either the
 * full Drizzle row or a plain-object projection.
 */
export type ReconcileBalanceOp = Pick<
  BalanceOperation,
  'id' | 'accountId' | 'opType' | 'amount' | 'occurredAtUtc' | 'deletedAtUtc'
>;

export interface ReconcileInput {
  accountId: string;
  initialBalance: number;
  /**
   * All non-soft-deleted balance operations for this account. The engine
   * filters deletedAtUtc defensively but the caller should prefer to
   * exclude them in the DB query for efficiency.
   */
  balanceOperations: ReconcileBalanceOp[];
  /** Only CLOSED trades (trades.status === 'CLOSED'). Open/partial excluded. */
  closedTrades: ReconcileTradePnl[];
  /**
   * The balance the broker / bridge / import most recently reported.
   * When null, the engine returns a "computed-only" view with no drift
   * value — used when no broker balance is available yet.
   */
  reportedBalance: number | null;
  /**
   * Drift tolerance in the account's base currency. Default: 0.01 (one cent).
   * Rationale: MT4/MT5 brokers round balance to two decimals; FP noise in
   * P&L calc can accrue at the fifth decimal. 1¢ covers both without
   * swallowing genuine bookkeeping drift.
   */
  tolerance?: number;
}

export type DriftSeverity = 'NONE' | 'MINOR' | 'MAJOR';

export interface ReconcileResult {
  accountId: string;
  initialBalance: number;
  tradePnlTotal: number;
  balanceOpsTotal: number;
  expectedBalance: number;
  reportedBalance: number | null;
  /** reportedBalance - expectedBalance. Null when reportedBalance is null. */
  drift: number | null;
  /** |drift|. Null when reportedBalance is null. */
  absDrift: number | null;
  tolerance: number;
  /** True when |drift| <= tolerance, OR when reportedBalance is null. */
  withinTolerance: boolean;
  severity: DriftSeverity;
  /**
   * Human-readable summary suitable for the drift banner's tooltip / details.
   * Never throws; safe to render directly.
   */
  summary: string;
  /** Counts for the drift banner's secondary line. */
  counts: {
    closedTrades: number;
    balanceOps: number;
    balanceOpsByType: Partial<Record<BalanceOperation['opType'], number>>;
  };
  /** Timestamp of the most recent input signal (trade close OR balance op). */
  lastActivityUtc: string | null;
}

// ─────────────────────────────────────────────────────────────
// Core engine
// ─────────────────────────────────────────────────────────────

const DEFAULT_TOLERANCE = 0.01;

/** MAJOR threshold: drift > max(1% of initialBalance, 10 × tolerance, $10). */
function classifySeverity(
  absDrift: number,
  tolerance: number,
  initialBalance: number,
): DriftSeverity {
  if (absDrift <= tolerance) return 'NONE';
  const majorFloor = Math.max(
    Math.abs(initialBalance) * 0.01,
    tolerance * 10,
    10,
  );
  return absDrift >= majorFloor ? 'MAJOR' : 'MINOR';
}

function round2(n: number): number {
  // Banker's half-even is unnecessary here — we only round for display;
  // the stored values remain full precision. We use round-half-away-from-zero
  // because that's what MT4/MT5 statements do.
  return Math.round(n * 100) / 100;
}

/**
 * Pure reconciliation function. Called by the IPC handler and by tests.
 *
 * Invariants (enforced by the test suite):
 *   1. For any input where reportedBalance === expectedBalance, drift is 0
 *      and withinTolerance is true regardless of tolerance >= 0.
 *   2. `expectedBalance` is deterministic in the multiset of inputs — the
 *      order of `balanceOperations` and `closedTrades` does NOT change it.
 *   3. Soft-deleted balance operations (deletedAtUtc != null) are ignored.
 *   4. `closedTrades` whose `netPnl` is not a finite number are treated as
 *      0 to avoid NaN poisoning the whole account — but this is logged in
 *      the summary so the operator can fix the source row.
 */
export function reconcileBalance(input: ReconcileInput): ReconcileResult {
  const tolerance = input.tolerance ?? DEFAULT_TOLERANCE;
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new Error(
      `reconcileBalance: tolerance must be a finite non-negative number, got ${tolerance}`,
    );
  }
  if (!Number.isFinite(input.initialBalance)) {
    throw new Error(
      `reconcileBalance: initialBalance must be finite, got ${input.initialBalance}`,
    );
  }

  // Balance operations — filter soft-deleted.
  const liveOps = input.balanceOperations.filter((o) => !o.deletedAtUtc);
  const balanceOpsTotal = liveOps.reduce((acc, o) => {
    return Number.isFinite(o.amount) ? acc + o.amount : acc;
  }, 0);

  // Op-type counts for the drift banner.
  const opTypeCounts: Partial<Record<BalanceOperation['opType'], number>> = {};
  for (const o of liveOps) {
    opTypeCounts[o.opType] = (opTypeCounts[o.opType] ?? 0) + 1;
  }

  // Trade P&L — any non-finite value is coerced to 0 and called out.
  let nanTradeCount = 0;
  const tradePnlTotal = input.closedTrades.reduce((acc, t) => {
    if (Number.isFinite(t.netPnl)) return acc + t.netPnl;
    nanTradeCount++;
    return acc;
  }, 0);

  const expectedBalance = input.initialBalance + balanceOpsTotal + tradePnlTotal;

  const drift =
    input.reportedBalance === null
      ? null
      : input.reportedBalance - expectedBalance;
  const absDrift = drift === null ? null : Math.abs(drift);

  const withinTolerance =
    absDrift === null ? true : absDrift <= tolerance;
  const severity =
    absDrift === null
      ? 'NONE'
      : classifySeverity(absDrift, tolerance, input.initialBalance);

  // Last activity (max ISO-8601 string wins — lexicographic sort works for
  // well-formed UTC timestamps, which is our invariant elsewhere).
  let lastActivityUtc: string | null = null;
  for (const o of liveOps) {
    if (!lastActivityUtc || o.occurredAtUtc > lastActivityUtc) {
      lastActivityUtc = o.occurredAtUtc;
    }
  }
  for (const t of input.closedTrades) {
    if (!lastActivityUtc || t.closedAtUtc > lastActivityUtc) {
      lastActivityUtc = t.closedAtUtc;
    }
  }

  const summary = buildSummary({
    initialBalance: input.initialBalance,
    balanceOpsTotal,
    tradePnlTotal,
    expectedBalance,
    reportedBalance: input.reportedBalance,
    drift,
    tolerance,
    withinTolerance,
    severity,
    nanTradeCount,
  });

  return {
    accountId: input.accountId,
    initialBalance: input.initialBalance,
    tradePnlTotal,
    balanceOpsTotal,
    expectedBalance,
    reportedBalance: input.reportedBalance,
    drift,
    absDrift,
    tolerance,
    withinTolerance,
    severity,
    summary,
    counts: {
      closedTrades: input.closedTrades.length,
      balanceOps: liveOps.length,
      balanceOpsByType: opTypeCounts,
    },
    lastActivityUtc,
  };
}

function buildSummary(p: {
  initialBalance: number;
  balanceOpsTotal: number;
  tradePnlTotal: number;
  expectedBalance: number;
  reportedBalance: number | null;
  drift: number | null;
  tolerance: number;
  withinTolerance: boolean;
  severity: DriftSeverity;
  nanTradeCount: number;
}): string {
  const parts: string[] = [];
  parts.push(
    `Expected ${round2(p.expectedBalance)} = initial ${round2(p.initialBalance)} ` +
      `${signed(p.balanceOpsTotal)} (cash ops) ${signed(p.tradePnlTotal)} (trade P&L)`,
  );
  if (p.reportedBalance === null) {
    parts.push('No reported broker balance yet — drift cannot be computed.');
  } else if (p.withinTolerance) {
    parts.push(
      `Reported ${round2(p.reportedBalance)} matches within ±${p.tolerance.toFixed(2)}.`,
    );
  } else {
    parts.push(
      `Reported ${round2(p.reportedBalance)} ⇒ drift ${signed(p.drift!)} ` +
        `(severity: ${p.severity}, tolerance ±${p.tolerance.toFixed(2)}).`,
    );
  }
  if (p.nanTradeCount > 0) {
    parts.push(
      `⚠ ${p.nanTradeCount} trade(s) had non-finite netPnl and were treated as 0.`,
    );
  }
  return parts.join(' ');
}

function signed(n: number): string {
  const r = round2(n);
  return r >= 0 ? `+${r.toFixed(2)}` : r.toFixed(2);
}
