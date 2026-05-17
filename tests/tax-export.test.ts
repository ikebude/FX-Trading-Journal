import { describe, it, expect } from 'vitest';
import { toTaxRows, taxRowsToCsv, holdingDays, type TaxInputTrade } from '../src/lib/tax-export';

const t = (over: Partial<TaxInputTrade> = {}): TaxInputTrade => ({
  symbol: 'EURUSD',
  direction: 'LONG',
  openedAtUtc: '2026-03-01T10:00:00.000Z',
  closedAtUtc: '2026-03-04T10:00:00.000Z',
  netPnl: 100,
  totalCommission: -4,
  totalSwap: -1,
  ...over,
});

describe('holdingDays — T4.5', () => {
  it('counts whole UTC days', () => {
    expect(holdingDays('2026-03-01T10:00:00Z', '2026-03-04T12:00:00Z')).toBe(3);
  });
  it('is 0 for same-day or inverted', () => {
    expect(holdingDays('2026-03-01T10:00:00Z', '2026-03-01T18:00:00Z')).toBe(0);
    expect(holdingDays('2026-03-05T00:00:00Z', '2026-03-01T00:00:00Z')).toBe(0);
  });
});

describe('toTaxRows — T4.5', () => {
  it('skips open trades (no close)', () => {
    expect(toTaxRows([t({ closedAtUtc: null })])).toEqual([]);
  });

  it('derives gross from net minus fees and computes holding days', () => {
    const [r] = toTaxRows([t()]);
    expect(r.netPnl).toBe(100);
    expect(r.commission).toBe(-4);
    expect(r.swap).toBe(-1);
    expect(r.grossPnl).toBe(105); // 100 - (-4) - (-1)
    expect(r.holdingDays).toBe(3);
    expect(r.taxYear).toBe(2026);
  });

  it('filters by tax year on the close date', () => {
    const rows = toTaxRows(
      [
        t({ closedAtUtc: '2025-12-31T23:00:00.000Z' }),
        t({ closedAtUtc: '2026-01-02T01:00:00.000Z' }),
      ],
      2026,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].taxYear).toBe(2026);
  });

  it('CSV has a header and one line per row', () => {
    const csv = taxRowsToCsv(toTaxRows([t(), t({ symbol: 'GBPUSD' })]));
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Tax Year');
    expect(lines).toHaveLength(3);
  });
});
