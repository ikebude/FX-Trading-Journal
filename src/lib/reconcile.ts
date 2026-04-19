/**
 * Reconciliation engine — Milestone 8.
 *
 * Pure logic for matching manually-logged trades with imported broker data.
 * The actual DB query lives in the IPC layer; this module provides types,
 * the match-scoring algorithm, and the merge-payload builder.
 *
 * Match criteria (per PROJECT_BRIEF §6.9):
 *  - Same account, symbol, direction
 *  - No existing externalPositionId/externalTicket (manual trade)
 *  - Open time within 5 minutes
 *  - Entry volume within 0.05 lots
 *
 * A merge preserves qualitative fields from the manual trade and overwrites
 * broker data (precise prices, commissions, external IDs, leg structure) from
 * the imported trade. The manual trade's id is kept so audit history survives.
 */

import type { Trade } from './db/schema';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

// T4-1/T-2: Derive ReconcileManualTrade from the authoritative Trade type so
// that any future column additions or renames in schema.ts automatically
// surface as type errors here rather than silently diverging.
export type ReconcileManualTrade = Pick<
  Trade,
  | 'id'
  | 'symbol'
  | 'direction'
  | 'openedAtUtc'
  | 'totalEntryVolume'
  | 'setupName'
  | 'marketCondition'
  | 'entryModel'
  | 'confidence'
  | 'preTradeEmotion'
  | 'postTradeEmotion'
  | 'initialStopPrice'
  | 'initialTargetPrice'
  | 'plannedRr'
  | 'plannedRiskAmount'
  | 'plannedRiskPct'
>;

export interface ReconcileImportedTrade {
  externalPositionId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  openedAtUtc: string | null;   // from first entry leg
  entryVolume: number;          // sum of entry leg volumes
}

export interface ReconcileCandidate {
  importedPositionId: string;
  manualTrade: ReconcileManualTrade;
  /** 0–100 — higher is a stronger match */
  score: number;
}

/** User decision for a reconcile candidate pair */
export type ReconcileAction = 'merge' | 'keep_both' | 'skip_import';

export interface ReconcileChoice {
  importedPositionId: string;
  manualTradeId: string;
  action: ReconcileAction;
}

// ─────────────────────────────────────────────────────────────
// Match scoring
// ─────────────────────────────────────────────────────────────

/**
 * Score how well an existing manual trade matches an imported trade.
 * Both must already pass the hard filters (symbol, direction, account,
 * no externalPositionId, within 5 min, within 0.05 lots).
 * Returns a score in [0, 100].
 */
export function scoreCandidate(
  importedTrade: ReconcileImportedTrade,
  manualTrade: ReconcileManualTrade,
): number {
  let score = 50; // base score for passing the hard filter

  // Time proximity (tighter = better)
  if (importedTrade.openedAtUtc && manualTrade.openedAtUtc) {
    const diffMs = Math.abs(
      new Date(importedTrade.openedAtUtc).getTime() -
        new Date(manualTrade.openedAtUtc).getTime(),
    );
    const diffMin = diffMs / 60000;
    // 0 min → +30, 5 min → +0
    score += Math.max(0, 30 - diffMin * 6);
  }

  // Volume proximity (closer = better)
  if (manualTrade.totalEntryVolume !== null) {
    const volumeDiff = Math.abs(importedTrade.entryVolume - manualTrade.totalEntryVolume);
    // 0 diff → +20, 0.05 diff → +0
    score += Math.max(0, 20 - volumeDiff * 400);
  }

  return Math.min(100, Math.round(score));
}

// ─────────────────────────────────────────────────────────────
// Merge payload builder
// ─────────────────────────────────────────────────────────────

/**
 * Qualitative fields that must be preserved from the manual trade during a merge.
 * These are the trader's own annotations — never overwritten by broker data.
 */
export const QUALITATIVE_FIELDS = [
  'setupName',
  'marketCondition',
  'entryModel',
  'confidence',
  'preTradeEmotion',
  'postTradeEmotion',
  'initialStopPrice',
  'initialTargetPrice',
  'plannedRr',
  'plannedRiskAmount',
  'plannedRiskPct',
] as const;

export type QualitativeField = (typeof QUALITATIVE_FIELDS)[number];

/** Extract just the qualitative fields from a manual trade row. */
export function extractQualitative(
  manual: ReconcileManualTrade,
): Pick<ReconcileManualTrade, QualitativeField> {
  return {
    setupName: manual.setupName,
    marketCondition: manual.marketCondition,
    entryModel: manual.entryModel,
    confidence: manual.confidence,
    preTradeEmotion: manual.preTradeEmotion,
    postTradeEmotion: manual.postTradeEmotion,
    initialStopPrice: manual.initialStopPrice,
    initialTargetPrice: manual.initialTargetPrice,
    plannedRr: manual.plannedRr,
    plannedRiskAmount: manual.plannedRiskAmount,
    plannedRiskPct: manual.plannedRiskPct,
  };
}

// ─────────────────────────────────────────────────────────────
// Balance reconciliation (T1.5)
// ─────────────────────────────────────────────────────────────

/**
 * Balance reconciliation: compares actual account equity (from balance_operations)
 * vs. computed equity (from trade P&L). Drift detection and correction workflow.
 *
 * Hard rules:
 * - All timestamps are UTC ISO-8601 strings
 * - All DB writes go through Drizzle
 * - Soft-deleted balance ops are excluded (deletedAtUtc IS NOT NULL)
 * - Drift threshold: 0.01% of account equity
 */

import { and, eq, isNull, isNotNull, lte } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from './db/client';
import { balanceOperations, trades, accounts, type Account } from './db/schema';

export interface ActualBalanceResult {
  totalDeposits: number;
  totalWithdrawals: number;
  totalCredits: number;
  totalCharges: number;
  netBalance: number;
}

export interface DriftResult {
  hasDrift: boolean;
  actualBalance: number;
  computedEquity: number;
  driftAmount: number;
  driftPercent: number;
}

function round(num: number, decimals = 2): number {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

/**
 * Sum all balance operations (excluding soft-deleted) for the account up to asOfUtc.
 *
 * Sign convention:
 *   Positive = credit (DEPOSIT, BONUS, INTEREST, CORRECTION+, CREDIT)
 *   Negative = debit  (WITHDRAWAL, CHARGE, COMMISSION, PAYOUT, CORRECTION-)
 */
export async function computeActualBalance(
  accountId: string,
  asOfUtc?: string,
): Promise<ActualBalanceResult> {
  const db = getDb();

  const ops = await db
    .select({
      opType: balanceOperations.opType,
      amount: balanceOperations.amount,
    })
    .from(balanceOperations)
    .where(
      and(
        eq(balanceOperations.accountId, accountId),
        isNull(balanceOperations.deletedAtUtc),
        asOfUtc ? lte(balanceOperations.occurredAtUtc, asOfUtc) : undefined,
      ),
    );

  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let totalCredits = 0;
  let totalCharges = 0;

  for (const op of ops) {
    if (op.opType === 'DEPOSIT') {
      totalDeposits += op.amount;
    } else if (op.opType === 'WITHDRAWAL') {
      totalWithdrawals += Math.abs(op.amount);
    } else if (op.opType === 'BONUS' || op.opType === 'INTEREST' || op.opType === 'CREDIT') {
      totalCredits += op.amount;
    } else if (
      op.opType === 'CHARGE' ||
      op.opType === 'COMMISSION' ||
      op.opType === 'PAYOUT'
    ) {
      totalCharges += Math.abs(op.amount);
    }
  }

  const netBalance = totalDeposits - totalWithdrawals + totalCredits - totalCharges;

  return {
    totalDeposits: round(totalDeposits, 2),
    totalWithdrawals: round(totalWithdrawals, 2),
    totalCredits: round(totalCredits, 2),
    totalCharges: round(totalCharges, 2),
    netBalance: round(netBalance, 2),
  };
}

/**
 * Compute equity by summing starting balance + all trade P&L up to asOfUtc.
 */
export async function computeComputedEquity(
  accountId: string,
  startingBalance: number,
  asOfUtc?: string,
): Promise<number> {
  const db = getDb();

  const closedTrades = await db
    .select({
      id: trades.id,
      netPnl: trades.netPnl,
    })
    .from(trades)
    .where(
      and(
        eq(trades.accountId, accountId),
        isNull(trades.deletedAtUtc),
        isNotNull(trades.closedAtUtc), // Only count trades that have been closed
        asOfUtc ? lte(trades.closedAtUtc, asOfUtc) : undefined,
      ),
    );

  let totalPnl = 0;
  for (const trade of closedTrades) {
    if (trade.netPnl !== null && trade.netPnl !== undefined) {
      totalPnl += trade.netPnl;
    }
  }

  const computedEquity = startingBalance + totalPnl;
  return round(computedEquity, 2);
}

/**
 * Compare actual balance vs. computed equity for an account.
 * Drift > 0.01% of account equity triggers hasDrift = true.
 */
export async function detectAccountDrift(account: Account): Promise<DriftResult> {
  const actualBalance = await computeActualBalance(account.id);
  const computedEquity = await computeComputedEquity(
    account.id,
    account.initialBalance,
  );

  const driftAmount = actualBalance.netBalance - computedEquity;
  const driftPercent =
    computedEquity !== 0 ? Math.abs(driftAmount / computedEquity) * 100 : 0;

  const DRIFT_THRESHOLD_PCT = 0.01;
  const hasDrift = driftPercent > DRIFT_THRESHOLD_PCT;

  return {
    hasDrift,
    actualBalance: actualBalance.netBalance,
    computedEquity,
    driftAmount: round(driftAmount, 2),
    driftPercent: round(driftPercent, 4),
  };
}

/**
 * Create a CORRECTION balance_op with driftAmount to zero out the drift.
 * driftAmount should be negative if actual < computed (credit needed),
 * or positive if actual > computed (debit needed).
 */
export async function createCorrectionBalanceOp(
  accountId: string,
  driftAmount: number,
  note?: string,
): Promise<string> {
  const db = getDb();

  const account = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!account || account.length === 0) {
    throw new Error(`Account ${accountId} not found`);
  }

  const id = nanoid();
  const now = new Date().toISOString();

  await db.insert(balanceOperations).values({
    id,
    accountId,
    opType: 'CORRECTION',
    amount: -driftAmount,
    currency: account[0].accountCurrency,
    occurredAtUtc: now,
    recordedAtUtc: now,
    source: 'RECONCILIATION',
    note:
      note ||
      `Auto-generated drift correction (${driftAmount >= 0 ? 'debit' : 'credit'})`,
    createdAtUtc: now,
    updatedAtUtc: now,
  });

  return id;
}
