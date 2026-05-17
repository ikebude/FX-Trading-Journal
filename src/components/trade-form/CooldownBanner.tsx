/**
 * CooldownBanner — T3.7
 *
 * Advisory, dismissible post-loss cool-down. Never blocks submission — it is
 * a gentle nudge. Countdown is derived from the pure, tested computeCooldown
 * helper in pnl.ts; this component only handles ticking + dismissal.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { computeCooldown } from '@/lib/pnl';
import type { TradeRow } from '@/lib/db/queries';

interface CooldownBannerProps {
  /** closedAtUtc of the account's most recent losing trade, or null. */
  lastClosedLossAtUtc: string | null;
  /** 0 disables the feature entirely. */
  cooldownMinutes: number;
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function CooldownBanner({ lastClosedLossAtUtc, cooldownMinutes }: CooldownBannerProps) {
  const [now, setNow] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState(false);

  const { active, secondsRemaining } = computeCooldown(
    lastClosedLossAtUtc,
    cooldownMinutes,
    new Date(now),
  );

  // Tick once a second only while a cool-down is actually running.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  if (!active || dismissed) return null;

  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        You closed a losing trade recently. Consider a {cooldownMinutes}-minute pause —{' '}
        <span className="font-medium tabular-nums">{fmt(secondsRemaining)}</span> left. This is
        advisory; you can still log a trade.
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="rounded px-1.5 py-0.5 text-amber-200/80 hover:bg-amber-500/20 hover:text-amber-100"
      >
        Dismiss
      </button>
    </div>
  );
}

/**
 * Self-contained wrapper: reads cool-down config from app settings and the
 * account's most recent closed losing trade, then renders <CooldownBanner>.
 * Drop one of these at the top of a trade form. Renders nothing when the
 * feature is off or there is no qualifying recent loss.
 */
export function CooldownNotice({ accountId }: { accountId: string | null | undefined }) {
  const { data: settings } = useQuery<Record<string, unknown>>({
    queryKey: ['settings'],
    queryFn: () => window.ledger.settings.get() as Promise<Record<string, unknown>>,
    staleTime: 60_000,
  });

  const enabled = settings?.cooldown_enabled === true;
  const minutes = Number(settings?.cooldown_minutes ?? 15) || 0;

  const { data } = useQuery<{ rows: TradeRow[]; total: number }>({
    queryKey: ['trades', 'cooldown', accountId],
    queryFn: () =>
      window.ledger.trades.list({
        accountId: accountId ?? undefined,
        status: ['CLOSED'],
        sortBy: 'closed_at_utc',
        sortDir: 'desc',
        pageSize: 20,
      }) as Promise<{ rows: TradeRow[]; total: number }>,
    enabled: enabled && minutes > 0,
    staleTime: 30_000,
  });

  if (!enabled || minutes <= 0) return null;

  const lastLoss = (data?.rows ?? []).find(
    (t) => (t.netPnl ?? 0) < 0 && t.closedAtUtc != null,
  );

  return (
    <CooldownBanner
      lastClosedLossAtUtc={lastLoss?.closedAtUtc ?? null}
      cooldownMinutes={minutes}
    />
  );
}
