/**
 * T6.5 — tamper-evident audit-log seal (pure).
 *
 * Each audit row gets a rolling hash: H(prevHash + canonical(row)). Any
 * insertion, deletion, reorder or field edit breaks the chain from that
 * point on, so `verifyAuditChain` pinpoints the first broken index.
 * SHA-256 via the shared hash util — no crypto here, fully unit-testable.
 */
import { sha256Hex } from './hash';

export interface SealableAuditRow {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  timestampUtc: string;
  changedFields?: string | null;
}

const GENESIS = 'GENESIS';

/** Stable, order-independent serialisation of the sealed fields. */
function canonical(r: SealableAuditRow): string {
  return [
    r.id,
    r.entityType,
    r.entityId,
    r.action,
    r.timestampUtc,
    r.changedFields ?? '',
  ].join('');
}

/** Hash for one row given the previous row's hash. */
export function rowSeal(prevHash: string, row: SealableAuditRow): string {
  return sha256Hex(`${prevHash}${canonical(row)}`);
}

/** Return the seal hash for every row in order (chained). */
export function sealAuditChain(rows: SealableAuditRow[]): string[] {
  const seals: string[] = [];
  let prev = GENESIS;
  for (const r of rows) {
    prev = rowSeal(prev, r);
    seals.push(prev);
  }
  return seals;
}

export interface ChainVerification {
  ok: boolean;
  /** Index of the first row whose recomputed seal != stored seal, or -1. */
  brokenAt: number;
}

/**
 * Verify rows against their stored seals. `storedSeals[i]` must equal the
 * recomputed chained hash for `rows[i]`. Length mismatch → broken at the
 * shorter length boundary.
 */
export function verifyAuditChain(
  rows: SealableAuditRow[],
  storedSeals: string[],
): ChainVerification {
  let prev = GENESIS;
  const n = Math.min(rows.length, storedSeals.length);
  for (let i = 0; i < n; i++) {
    prev = rowSeal(prev, rows[i]);
    if (prev !== storedSeals[i]) return { ok: false, brokenAt: i };
  }
  if (rows.length !== storedSeals.length) {
    return { ok: false, brokenAt: n };
  }
  return { ok: true, brokenAt: -1 };
}
