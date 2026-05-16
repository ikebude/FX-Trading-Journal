/**
 * PostMortemPage — T3.8
 *
 * Drawdown autopsy / blown-account root cause. Reuses the dashboard:stats
 * bundle path (no new IPC) and renders the computePostMortem result.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '@/stores/app-store';
import { getDashboardDateRange, type DashboardPreset } from '@/lib/dashboard-presets';
import { formatCurrency, formatPct } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { PostMortem } from '@/lib/pnl';

interface StatsShape {
  postMortem: PostMortem;
}

export function PostMortemPage() {
  const { activeAccountId, displayTimezone } = useAppStore();
  const [preset, setPreset] = useState<DashboardPreset>('all');

  const filters = useMemo(() => {
    const range = getDashboardDateRange(preset);
    return { ...(activeAccountId ? { accountId: activeAccountId } : {}), ...range };
  }, [activeAccountId, preset]);

  const { data, isLoading, error } = useQuery<StatsShape>({
    queryKey: ['dashboard:stats', filters, displayTimezone],
    queryFn: () => window.ledger.dashboard.stats(filters, displayTimezone),
    staleTime: 60_000,
  });

  const pm = data?.postMortem;

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Post-mortem</h1>
          <p className="text-sm text-muted-foreground">
            Drawdown autopsy — what went wrong and why.
          </p>
        </div>
        <select
          aria-label="Post-mortem date range"
          title="Post-mortem date range"
          value={preset}
          onChange={(e) => setPreset(e.target.value as DashboardPreset)}
          className="rounded-md border border-border bg-transparent px-2 py-1 text-sm"
        >
          <option value="all">All time</option>
          <option value="ytd">Year to date</option>
          <option value="90d">Last 90 days</option>
          <option value="30d">Last 30 days</option>
        </select>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Analyzing…</p>}
      {error && <p className="text-sm text-rose-400">Failed to load post-mortem.</p>}

      {pm && (
        <div className="flex flex-col gap-4">
          <div
            className={cn(
              'rounded-lg border p-4',
              pm.triggered
                ? 'border-rose-500/40 bg-rose-500/10'
                : 'border-emerald-500/40 bg-emerald-500/10',
            )}
          >
            <p className="text-sm font-medium">
              {pm.triggered
                ? `Significant drawdown detected — ${formatPct(pm.maxDrawdownPct * 100)} peak-to-trough.`
                : 'No significant drawdown. Account is within normal variance.'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Max drawdown {formatCurrency(pm.maxDrawdown)} ({formatPct(pm.maxDrawdownPct * 100)})
              {pm.drawdownPeriod
                ? ` · ${pm.drawdownPeriod.startUtc.slice(0, 10)} → ${pm.drawdownPeriod.endUtc.slice(0, 10)} · ${pm.tradesInDrawdown} trades in window`
                : ''}
            </p>
          </div>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">Contributing factors</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {pm.contributingFactors.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </section>

          {pm.worstTrades.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-2 text-sm font-semibold">Worst trades</h2>
              <div className="flex flex-col divide-y divide-border">
                {pm.worstTrades.map((t) => (
                  <div key={t.tradeId} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-medium">{t.symbol}</span>
                    <span className="text-xs text-muted-foreground">
                      {t.closedAtUtc ? t.closedAtUtc.slice(0, 10) : '—'}
                    </span>
                    <span className="font-bold tabular-nums text-rose-400">
                      {formatCurrency(t.netPnl)}
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
