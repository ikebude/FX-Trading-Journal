import { describe, it, expect } from 'vitest';
import {
  sealAuditChain,
  verifyAuditChain,
  type SealableAuditRow,
} from '../src/lib/audit-seal';

const row = (o: Partial<SealableAuditRow> & { id: string }): SealableAuditRow => ({
  entityType: 'TRADE',
  entityId: 't1',
  action: 'CREATE',
  timestampUtc: '2026-04-01T10:00:00.000Z',
  changedFields: null,
  ...o,
});

describe('audit seal — T6.5', () => {
  const rows = [row({ id: 'a' }), row({ id: 'b', action: 'UPDATE' }), row({ id: 'c', action: 'DELETE' })];

  it('seals chain deterministically and verifies clean', () => {
    const seals = sealAuditChain(rows);
    expect(seals).toHaveLength(3);
    expect(sealAuditChain(rows)).toEqual(seals); // deterministic
    expect(verifyAuditChain(rows, seals)).toEqual({ ok: true, brokenAt: -1 });
  });

  it('detects a tampered field at the right index', () => {
    const seals = sealAuditChain(rows);
    const tampered = rows.map((r, i) => (i === 1 ? { ...r, action: 'HARD_DELETE' } : r));
    expect(verifyAuditChain(tampered, seals)).toEqual({ ok: false, brokenAt: 1 });
  });

  it('detects a deleted row (length mismatch)', () => {
    const seals = sealAuditChain(rows);
    expect(verifyAuditChain([rows[0], rows[2]], seals).ok).toBe(false);
  });

  it('detects reorder', () => {
    const seals = sealAuditChain(rows);
    const reordered = [rows[1], rows[0], rows[2]];
    expect(verifyAuditChain(reordered, seals).ok).toBe(false);
  });

  it('empty chain verifies trivially', () => {
    expect(verifyAuditChain([], [])).toEqual({ ok: true, brokenAt: -1 });
  });
});
