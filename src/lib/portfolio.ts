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
  /** T5.2 — cross-account hedges (empty when no open positions supplied). */
  hedges: CrossAccountHedge[];
  /** T5.2 — per-account open-risk rollup. */
  openRisk: AccountOpenRisk[];
}

// ─────────────────────────────────────────────────────────────
// T5.2 — cross-account hedge detection + per-account open risk
// ─────────────────────────────────────────────────────────────

export interface OpenPositionInput {
  accountId: string;
  accountName: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  lots: number;
  /** Open risk in base/account currency (planned risk amount), if known. */
  riskAmount?: number | null;
}

export interface CrossAccountHedge {
  symbol: string;
  longAccounts: string[];
  shortAccounts: string[];
  longLots: number;
  shortLots: number;
  /** min(longLots, shortLots) — the offset (effectively flat) exposure. */
  hedgedLots: number;
}

export interface AccountOpenRisk {
  accountId: string;
  accountName: string;
  openPositions: number;
  totalRiskAmount: number;
}

/**
 * Detect symbols held LONG in ≥1 account and SHORT in ≥1 *different*
 * account — a cross-account hedge that nets exposure while doubling cost.
 * Pure. Same-account opposite legs are ignored (that's just a closed/partial).
 */
export function detectCrossAccountHedges(
  positions: OpenPositionInput[],
): CrossAccountHedge[] {
  const bySymbol = new Map<string, OpenPositionInput[]>();
  for (const p of positions) {
    const arr = bySymbol.get(p.symbol) ?? [];
    arr.push(p);
    bySymbol.set(p.symbol, arr);
  }

  const hedges: CrossAccountHedge[] = [];
  for (const [symbol, ps] of bySymbol) {
    const longs = ps.filter((p) => p.direction === 'LONG');
    const shorts = ps.filter((p) => p.direction === 'SHORT');
    const longAccts = new Set(longs.map((p) => p.accountId));
    const shortAccts = new Set(shorts.map((p) => p.accountId));
    // Require the hedge to span at least two distinct accounts.
    const distinct = new Set([...longAccts, ...shortAccts]);
    if (longs.length === 0 || shorts.length === 0 || distinct.size < 2) continue;
    const longLots = longs.reduce((s, p) => s + p.lots, 0);
    const shortLots = shorts.reduce((s, p) => s + p.lots, 0);
    hedges.push({
      symbol,
      longAccounts: [...longAccts],
      shortAccounts: [...shortAccts],
      longLots,
      shortLots,
      hedgedLots: Math.min(longLots, shortLots),
    });
  }
  return hedges.sort((a, b) => b.hedgedLots - a.hedgedLots);
}

/** Per-account open-position count + summed open risk. Pure. */
export function computeAccountOpenRisk(
  positions: OpenPositionInput[],
): AccountOpenRisk[] {
  const map = new Map<string, AccountOpenRisk>();
  for (const p of positions) {
    let r = map.get(p.accountId);
    if (!r) {
      r = {
        accountId: p.accountId,
        accountName: p.accountName,
        openPositions: 0,
        totalRiskAmount: 0,
      };
      map.set(p.accountId, r);
    }
    r.openPositions += 1;
    r.totalRiskAmount += p.riskAmount ?? 0;
  }
  return [...map.values()].sort((a, b) => b.totalRiskAmount - a.totalRiskAmount);
}

export function computePortfolioSummary(
  accounts: PortfolioAccountInput[],
  baseCurrency: string,
  rates: Record<string, number> = {},
  openPositions: OpenPositionInput[] = [],
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
    hedges: detectCrossAccountHedges(openPositions),
    openRisk: computeAccountOpenRisk(openPositions),
  };
}
