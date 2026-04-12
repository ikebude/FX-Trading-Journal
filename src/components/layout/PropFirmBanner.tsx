/**
 * PropFirmBanner — persistent guardrail status strip for PROP accounts.
 *
 * Rendered in AppShell below the TopBar. Only visible when the active account
 * has accountType = 'PROP' and at least one prop rule is configured.
 *
 * Colors:
 *  - OK      → subtle teal/blue tint
 *  - WARNING → amber (>70% of any limit consumed)
 *  - BREACH  → rose/red with pulsing indicator
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ShieldCheck, ShieldAlert } from 'lucide-react';
import {
  startOfDay,
  endOfDay,
  formatISO,
} from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { computeGuardrails } from '@/lib/prop-firm';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useAppStore } from '@/stores/app-store';
import type { Account } from '@/lib/db/schema';
import type { TradeRow } from '@/lib/db/queries';

// ─────────────────────────────────────────────────────────────
// Progress bar
// ─────────────────────────────────────────────────────────────

function Bar({ pct, level }: { pct: number; level: string }) {
  const fill =
    level === 'BREACH'
      ? 'bg-rose-500'
      : level === 'WARNING'
        ? 'bg-amber-400'
        : 'bg-emerald-500';

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/50">
      <div
        className={cn('h-full rounded-full transition-all', fill)}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Stat cell
// ─────────────────────────────────────────────────────────────

function Stat({
  label,
  current,
  limit,
  pct,
  level,
  invert = false,
}: {
  label: string;
  current: string;
  limit: string | null;
  pct: number | null;
  level: string;
  invert?: boolean; // true for profit (higher is better)
}) {
  return (
    <div className="flex min-w-[140px] flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="text-xs font-semibold tabular-nums text-foreground">
          {current}
          {limit !== null && (
            <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">
              {' '}/ {limit}
            </span>
          )}
        </span>
      </div>
      {pct !== null && (
        <Bar pct={invert ? (pct / 100) * 100 : pct} level={invert ? 'OK' : level} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export function PropFirmBanner() {
  const { activeAccountId, displayTimezone } = useAppStore();

  // Fetch account record
  const { data: accountData } = useQuery<Account | null>({
    queryKey: ['account', activeAccountId],
    queryFn: async () => {
      if (!activeAccountId) return null;
      return window.ledger.accounts.get(activeAccountId);
    },
    enabled: !!activeAccountId,
  });

  const account = accountData ?? null;

  // Only show for PROP accounts with at least one rule configured
  const hasPropRules =
    account?.accountType === 'PROP' &&
    (account.propDailyLossLimit != null ||
      account.propDailyLossPct != null ||
      account.propMaxDrawdown != null ||
      account.propMaxDrawdownPct != null ||
      account.propProfitTarget != null ||
      account.propProfitTargetPct != null);

  // All closed trades for drawdown calculation
  const { data: allTradeData } = useQuery<{ rows: TradeRow[]; total: number }>({
    queryKey: ['trades-prop-all', activeAccountId],
    queryFn: () =>
      window.ledger.trades.list({
        accountId: activeAccountId,
        status: ['CLOSED'],
        includeDeleted: false,
        includeSample: false,
        sortBy: 'closed_at_utc',
        sortDir: 'asc',
        pageSize: 10000,
      }),
    enabled: hasPropRules,
    staleTime: 1000 * 60, // 1 minute
  });

  // Today's closed trades (in account timezone)
  const todayStart = formatISO(
    startOfDay(new Date()),
  );
  const todayEnd = formatISO(endOfDay(new Date()));

  const { data: todayTradeData } = useQuery<{ rows: TradeRow[]; total: number }>({
    queryKey: ['trades-prop-today', activeAccountId, todayStart],
    queryFn: () =>
      window.ledger.trades.list({
        accountId: activeAccountId,
        status: ['CLOSED'],
        dateFrom: todayStart,
        dateTo: todayEnd,
        includeDeleted: false,
        includeSample: false,
        pageSize: 500,
      }),
    enabled: hasPropRules,
    staleTime: 1000 * 30,
  });

  const guardrails = useMemo(() => {
    if (!account || !hasPropRules) return null;
    const allPnls = (allTradeData?.rows ?? []).map((t) => t.netPnl ?? 0);
    const todayPnls = (todayTradeData?.rows ?? []).map((t) => t.netPnl ?? 0);
    return computeGuardrails(account, allPnls, todayPnls);
  }, [account, hasPropRules, allTradeData, todayTradeData]);

  if (!hasPropRules || !guardrails) return null;

  const { level } = guardrails;

  const bannerBg =
    level === 'BREACH'
      ? 'bg-rose-950/60 border-rose-500/40'
      : level === 'WARNING'
        ? 'bg-amber-950/60 border-amber-500/40'
        : 'bg-card border-border';

  const Icon =
    level === 'BREACH'
      ? ShieldAlert
      : level === 'WARNING'
        ? AlertTriangle
        : ShieldCheck;

  const iconColor =
    level === 'BREACH'
      ? 'text-rose-400'
      : level === 'WARNING'
        ? 'text-amber-400'
        : 'text-emerald-400';

  const phaseLabel = guardrails.phase
    ? { PHASE_1: 'Phase 1', PHASE_2: 'Phase 2', FUNDED: 'Funded', VERIFIED: 'Verified' }[
        guardrails.phase
      ]
    : null;

  return (
    <div className={cn('flex shrink-0 items-center gap-4 border-b px-4 py-2', bannerBg)}>
      {/* Icon + label */}
      <div className="flex items-center gap-1.5">
        <Icon className={cn('h-3.5 w-3.5', iconColor, level === 'BREACH' && 'animate-pulse')} />
        <span className={cn('text-[10px] font-semibold uppercase tracking-wide', iconColor)}>
          {level === 'BREACH' ? 'Rule Breached' : level === 'WARNING' ? 'Approaching Limit' : 'Prop Guardrails'}
        </span>
        {phaseLabel && (
          <span className="rounded border border-border px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
            {phaseLabel}
          </span>
        )}
      </div>

      <div className="h-4 w-px bg-border" />

      {/* Daily loss */}
      {guardrails.dailyLossLimit !== null && (
        <Stat
          label="Daily Loss"
          current={formatCurrency(guardrails.dailyLossCurrent)}
          limit={formatCurrency(guardrails.dailyLossLimit)}
          pct={guardrails.dailyLossPct}
          level={level}
        />
      )}

      {/* Drawdown */}
      {guardrails.drawdownLimit !== null && (
        <Stat
          label="Max Drawdown"
          current={formatCurrency(-guardrails.drawdownCurrent)}
          limit={formatCurrency(guardrails.drawdownLimit)}
          pct={guardrails.drawdownPct}
          level={level}
        />
      )}

      {/* Profit target */}
      {guardrails.profitTarget !== null && (
        <Stat
          label="Profit Target"
          current={formatCurrency(guardrails.profitCurrent)}
          limit={formatCurrency(guardrails.profitTarget)}
          pct={
            guardrails.profitTarget > 0
              ? (guardrails.profitCurrent / guardrails.profitTarget) * 100
              : null
          }
          level="OK"
          invert
        />
      )}
    </div>
  );
}
