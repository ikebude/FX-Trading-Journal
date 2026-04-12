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
