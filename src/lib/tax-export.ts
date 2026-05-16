/**
 * T4.5 — Tax-prep export.
 *
 * Pure mapping from closed trades to tax-lot rows. Deposits/bonuses are NOT
 * trades and never appear here (credit segregation is enforced upstream by
 * only passing closed trades). Realized P&L only; open trades are excluded.
 */

export interface TaxInputTrade {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  openedAtUtc: string | null;
  closedAtUtc: string | null;
  netPnl: number | null;
  totalCommission: number | null;
  totalSwap: number | null;
}

export interface TaxRow {
  taxYear: number;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  openedAtUtc: string;
  closedAtUtc: string;
  holdingDays: number;
  /** Realized P&L gross of fees. */
  grossPnl: number;
  commission: number;
  swap: number;
  /** Net = gross + commission + swap (commission/swap are signed costs). */
  netPnl: number;
}

/** Whole calendar days between two ISO timestamps (UTC), min 0. */
export function holdingDays(openIso: string, closeIso: string): number {
  const ms = new Date(closeIso).getTime() - new Date(openIso).getTime();
  if (Number.isNaN(ms) || ms < 0) return 0;
  return Math.floor(ms / 86_400_000);
}

/**
 * Map closed trades → tax rows, optionally filtered to a single tax year
 * (calendar year of the close date, UTC). Trades missing a close are skipped.
 */
export function toTaxRows(trades: TaxInputTrade[], taxYear?: number): TaxRow[] {
  const rows: TaxRow[] = [];
  for (const t of trades) {
    if (!t.closedAtUtc || !t.openedAtUtc) continue;
    const year = new Date(t.closedAtUtc).getUTCFullYear();
    if (taxYear != null && year !== taxYear) continue;
    const commission = t.totalCommission ?? 0;
    const swap = t.totalSwap ?? 0;
    const net = t.netPnl ?? 0;
    rows.push({
      taxYear: year,
      symbol: t.symbol,
      direction: t.direction,
      openedAtUtc: t.openedAtUtc,
      closedAtUtc: t.closedAtUtc,
      holdingDays: holdingDays(t.openedAtUtc, t.closedAtUtc),
      grossPnl: net - commission - swap,
      commission,
      swap,
      netPnl: net,
    });
  }
  return rows.sort((a, b) => a.closedAtUtc.localeCompare(b.closedAtUtc));
}

/** Serialize tax rows to a tax-prep CSV string. */
export function taxRowsToCsv(rows: TaxRow[]): string {
  const header = [
    'Tax Year',
    'Symbol',
    'Direction',
    'Opened (UTC)',
    'Closed (UTC)',
    'Holding Days',
    'Gross P&L',
    'Commission',
    'Swap',
    'Net P&L',
  ].join(',');
  const body = rows.map((r) =>
    [
      r.taxYear,
      r.symbol,
      r.direction,
      r.openedAtUtc,
      r.closedAtUtc,
      r.holdingDays,
      r.grossPnl.toFixed(2),
      r.commission.toFixed(2),
      r.swap.toFixed(2),
      r.netPnl.toFixed(2),
    ].join(','),
  );
  return [header, ...body].join('\n');
}
