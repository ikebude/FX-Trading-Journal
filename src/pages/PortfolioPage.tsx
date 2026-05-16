/**
 * PortfolioPage — T5.1
 *
 * Consolidated multi-account view. FX rates are not fetched (Rule 11 — no
 * network); unconvertible currencies are surfaced as a warning instead of
 * being silently mis-summed.
 */
import { useQuery } from '@tanstack/react-query';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { PortfolioSummary } from '@/lib/portfolio';

export function PortfolioPage() {
  const { data, isLoading, error } = useQuery<PortfolioSummary>({
    queryKey: ['portfolio:summary'],
    queryFn: () => window.ledger.portfolio.summary(),
    staleTime: 60_000,
  });

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold">Portfolio</h1>
        <p className="text-sm text-muted-foreground">
          Consolidated performance across all accounts.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-rose-400">Failed to load portfolio.</p>}

      {data && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">
              Total net P&amp;L ({data.baseCurrency})
            </p>
            <p
              className={cn(
                'text-2xl font-bold tabular-nums',
                data.totalNetPnlBase >= 0 ? 'text-emerald-400' : 'text-rose-400',
              )}
            >
              {formatCurrency(data.totalNetPnlBase)}
            </p>
            {data.missingRates.length > 0 && (
              <p className="mt-1 text-xs text-amber-400">
                No FX rate for {data.missingRates.join(', ')} — those accounts are
                excluded from the total. Set rates in Settings to include them.
              </p>
            )}
          </div>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">Accounts</h2>
            <div className="flex flex-col divide-y divide-border text-sm">
              {data.accounts.map((a) => (
                <div key={a.accountId} className="flex items-center justify-between py-2">
                  <span className="font-medium">
                    {a.name}{' '}
                    <span className="text-xs text-muted-foreground">
                      {a.currency}
                      {a.group ? ` · ${a.group}` : ''}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'tabular-nums',
                      a.rateUsed == null
                        ? 'text-amber-400'
                        : a.netPnlBase >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400',
                    )}
                  >
                    {a.rateUsed == null
                      ? `${formatCurrency(a.netPnlNative)} ${a.currency} (no rate)`
                      : formatCurrency(a.netPnlBase)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {data.hedges.length > 0 && (
            <section className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
              <h2 className="mb-2 text-sm font-semibold text-amber-300">
                Cross-account hedges detected
              </h2>
              <div className="flex flex-col gap-1 text-xs text-amber-200/90">
                {data.hedges.map((h) => (
                  <div key={h.symbol}>
                    <strong>{h.symbol}</strong>: long in {h.longAccounts.join(', ')} (
                    {h.longLots} lots) vs short in {h.shortAccounts.join(', ')} (
                    {h.shortLots} lots) — {h.hedgedLots} lots effectively flat
                    (double cost, no edge).
                  </div>
                ))}
              </div>
            </section>
          )}

          {data.openRisk.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-2 text-sm font-semibold">Open risk by account</h2>
              <div className="flex flex-col divide-y divide-border text-sm">
                {data.openRisk.map((r) => (
                  <div key={r.accountId} className="flex items-center justify-between py-2">
                    <span>
                      {r.accountName}{' '}
                      <span className="text-xs text-muted-foreground">
                        {r.openPositions} open
                      </span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatCurrency(r.totalRiskAmount)} at risk
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {data.byGroup.length > 1 && (
            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-2 text-sm font-semibold">By group</h2>
              <div className="flex flex-col divide-y divide-border text-sm">
                {data.byGroup.map((g) => (
                  <div key={g.group} className="flex items-center justify-between py-2">
                    <span>{g.group}</span>
                    <span
                      className={cn(
                        'tabular-nums',
                        g.netPnlBase >= 0 ? 'text-emerald-400' : 'text-rose-400',
                      )}
                    >
                      {formatCurrency(g.netPnlBase)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
