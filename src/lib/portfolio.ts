/**
 * T5.1 — Multi-account portfolio consolidation (pure).
 *
 * Combines per-account results into a single portfolio view, converting
 * each account's currency into a chosen base currency via a supplied
 * rate map (rate = units of BASE per 1 unit of the account currency).
 * Missing rates are surfaced (never silently treated as 1) so the UI can
 * warn rather than mislead.
 */

export interface PortfolioAccountInput {
  accountId: string;
  name: string;
  currency: string;
  netPnl: number;
  /** Optional consolidated-equity series in the account's own currency. */
  equityCurve?: Array<{ timestamp: string; equity: number }>;
  /** Optional grouping tag (e.g. "Prop", "Personal"). */
  group?: string | null;
}

export interface PortfolioAccountRow {
  accountId: string;
  name: string;
  currency: string;
  group: string | null;
  netPnlNative: number;
  netPnlBase: number;
  rateUsed: number | null;
}

export interface PortfolioSummary {
  baseCurrency: string;
  totalNetPnlBase: number;
  accounts: PortfolioAccountRow[];
  /** Currencies with no rate supplied (excluded from totals). */
  missingRates: string[];
  /** Consolidated equity curve in base currency (timestamps unioned). */
  equityCurve: Array<{ timestamp: string; equity: number }>;
  byGroup: Array<{ group: string; netPnlBase: number }>;
}

export function computePortfolioSummary(
  accounts: PortfolioAccountInput[],
  baseCurrency: string,
  rates: Record<string, number> = {},
): PortfolioSummary {
  const rateFor = (ccy: string): number | null => {
    if (ccy === baseCurrency) return 1;
    const r = rates[ccy];
    return typeof r === 'number' && r > 0 ? r : null;
  };

  const missing = new Set<string>();
  const rows: PortfolioAccountRow[] = accounts.map((a) => {
    const rate = rateFor(a.currency);
    if (rate == null) missing.add(a.currency);
    return {
      accountId: a.accountId,
      name: a.name,
      currency: a.currency,
      group: a.group ?? null,
      netPnlNative: a.netPnl,
      netPnlBase: rate == null ? 0 : a.netPnl * rate,
      rateUsed: rate,
    };
  });

  const totalNetPnlBase = rows.reduce((s, r) => s + r.netPnlBase, 0);

  // Union equity timestamps; sum each account's last-known converted equity.
  const tsSet = new Set<string>();
  for (const a of accounts) for (const p of a.equityCurve ?? []) tsSet.add(p.timestamp);
  const timestamps = [...tsSet].sort();
  const equityCurve = timestamps.map((ts) => {
    let equity = 0;
    for (const a of accounts) {
      const rate = rateFor(a.currency);
      if (rate == null || !a.equityCurve?.length) continue;
      // Last point at or before ts (step-forward hold).
      let val = 0;
      for (const p of a.equityCurve) {
        if (p.timestamp <= ts) val = p.equity;
        else break;
      }
      equity += val * rate;
    }
    return { timestamp: ts, equity };
  });

  const groupMap = new Map<string, number>();
  for (const r of rows) {
    const g = r.group ?? 'Ungrouped';
    groupMap.set(g, (groupMap.get(g) ?? 0) + r.netPnlBase);
  }
  const byGroup = [...groupMap.entries()]
    .map(([group, netPnlBase]) => ({ group, netPnlBase }))
    .sort((a, b) => b.netPnlBase - a.netPnlBase);

  return {
    baseCurrency,
    totalNetPnlBase,
    accounts: rows,
    missingRates: [...missing],
    equityCurve,
    byGroup,
  };
}
