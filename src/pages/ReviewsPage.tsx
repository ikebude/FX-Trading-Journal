/**
 * Reviews — Milestone 12
 *
 * Daily and weekly trade journal review pages.
 *
 * Layout:
 *  - Tab bar: Daily | Weekly
 *  - Date navigator: < [period label] >
 *  - Stats strip: trades, win rate, net P&L, avg R, mood/discipline/energy scores
 *  - Trade list for the period (symbol, direction, pips, P&L)
 *  - Qualitative form: followedPlan, biggestWin, biggestMistake, improvement,
 *    patternWinners, patternLosers, strategyAdjust
 *  - Score sliders: mood, discipline, energy (1–5)
 *
 * Data: reviews:list / reviews:get / reviews:upsert via IPC
 *       trades:list filtered by period for the stats strip
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  addDays,
  addWeeks,
  subDays,
  subWeeks,
  parseISO,
  isWithinInterval,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/cn';
import { formatCurrency, formatPips, pnlClass } from '@/lib/format';
import type { Review } from '@/lib/db/schema';
import type { TradeRow } from '@/lib/db/queries';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type ReviewKind = 'DAILY' | 'WEEKLY';

interface ReviewFormState {
  followedPlan: 'YES' | 'NO' | 'PARTIAL' | '';
  biggestWin: string;
  biggestMistake: string;
  improvement: string;
  patternWinners: string;
  patternLosers: string;
  strategyAdjust: string;
  moodScore: number;
  disciplineScore: number;
  energyScore: number;
}

const EMPTY_FORM: ReviewFormState = {
  followedPlan: '',
  biggestWin: '',
  biggestMistake: '',
  improvement: '',
  patternWinners: '',
  patternLosers: '',
  strategyAdjust: '',
  moodScore: 3,
  disciplineScore: 3,
  energyScore: 3,
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getPeriod(kind: ReviewKind, anchor: Date): { start: Date; end: Date; label: string } {
  if (kind === 'DAILY') {
    return {
      start: startOfDay(anchor),
      end: endOfDay(anchor),
      label: format(anchor, 'EEEE, dd MMM yyyy'),
    };
  }
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  const end = endOfWeek(anchor, { weekStartsOn: 1 });
  return {
    start,
    end,
    label: `Week of ${format(start, 'dd MMM')} – ${format(end, 'dd MMM yyyy')}`,
  };
}

function navigate(kind: ReviewKind, anchor: Date, dir: -1 | 1): Date {
  if (kind === 'DAILY') return dir === -1 ? subDays(anchor, 1) : addDays(anchor, 1);
  return dir === -1 ? subWeeks(anchor, 1) : addWeeks(anchor, 1);
}

function reviewToForm(r: Review): ReviewFormState {
  return {
    followedPlan: (r.followedPlan ?? '') as ReviewFormState['followedPlan'],
    biggestWin: r.biggestWin ?? '',
    biggestMistake: r.biggestMistake ?? '',
    improvement: r.improvement ?? '',
    patternWinners: r.patternWinners ?? '',
    patternLosers: r.patternLosers ?? '',
    strategyAdjust: r.strategyAdjust ?? '',
    moodScore: r.moodScore ?? 3,
    disciplineScore: r.disciplineScore ?? 3,
    energyScore: r.energyScore ?? 3,
  };
}

// ─────────────────────────────────────────────────────────────
// Score row (1-5 dots)
// ─────────────────────────────────────────────────────────────

function ScoreSelector({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              'h-6 w-6 rounded-full border text-[10px] font-semibold transition-colors',
              value >= n
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-transparent text-muted-foreground hover:border-primary/50',
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Followed-plan toggle
// ─────────────────────────────────────────────────────────────

function PlanToggle({
  value,
  onChange,
}: {
  value: ReviewFormState['followedPlan'];
  onChange: (v: ReviewFormState['followedPlan']) => void;
}) {
  const opts = [
    { v: 'YES' as const, label: 'Yes', color: 'text-emerald-400 border-emerald-500/40 bg-emerald-950/40' },
    { v: 'PARTIAL' as const, label: 'Partial', color: 'text-amber-400 border-amber-500/40 bg-amber-950/40' },
    { v: 'NO' as const, label: 'No', color: 'text-rose-400 border-rose-500/40 bg-rose-950/40' },
  ];
  return (
    <div className="flex gap-2">
      {opts.map((opt) => (
        <button
          key={opt.v}
          type="button"
          onClick={() => onChange(value === opt.v ? '' : opt.v)}
          className={cn(
            'rounded-md border px-3 py-1 text-xs font-medium transition-all',
            value === opt.v
              ? opt.color
              : 'border-border text-muted-foreground hover:border-border/80',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Trade row for the period
// ─────────────────────────────────────────────────────────────

function PeriodTradeRow({ trade }: { trade: TradeRow }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/50 px-4 py-2 text-xs last:border-b-0 hover:bg-muted/30">
      <span
        className={cn(
          'w-12 rounded px-1.5 py-0.5 text-center text-[10px] font-semibold',
          trade.direction === 'LONG'
            ? 'bg-emerald-950 text-emerald-400'
            : 'bg-rose-950 text-rose-400',
        )}
      >
        {trade.direction}
      </span>
      <span className="w-20 font-mono font-semibold text-foreground">{trade.symbol}</span>
      <span className="flex-1 text-muted-foreground">{trade.setupName ?? '—'}</span>
      <span className={cn('w-16 text-right tabular-nums', pnlClass(trade.netPips))}>
        {formatPips(trade.netPips)}
      </span>
      <span className={cn('w-20 text-right font-semibold tabular-nums', pnlClass(trade.netPnl))}>
        {formatCurrency(trade.netPnl)}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Stats strip
// ─────────────────────────────────────────────────────────────

function StatsStrip({ trades }: { trades: TradeRow[] }) {
  const closed = trades.filter((t) => t.status === 'CLOSED');
  const wins = closed.filter((t) => (t.netPnl ?? 0) > 0);
  const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : null;
  const netPnl = closed.reduce((acc, t) => acc + (t.netPnl ?? 0), 0);
  const avgR =
    closed.length > 0
      ? closed.reduce((acc, t) => acc + (t.rMultiple ?? 0), 0) / closed.length
      : null;

  const stats = [
    { label: 'Trades', value: String(closed.length) },
    { label: 'Win Rate', value: winRate !== null ? `${winRate.toFixed(0)}%` : '—' },
    {
      label: 'Net P&L',
      value: formatCurrency(netPnl),
      colorClass: pnlClass(netPnl),
    },
    {
      label: 'Avg R',
      value: avgR !== null ? `${avgR > 0 ? '+' : ''}${avgR.toFixed(2)}R` : '—',
      colorClass: pnlClass(avgR),
    },
  ];

  return (
    <div className="flex gap-4 border-b border-border bg-card/50 px-6 py-3">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {s.label}
          </span>
          <span className={cn('text-sm font-semibold tabular-nums', s.colorClass ?? 'text-foreground')}>
            {s.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Textarea field
// ─────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main ReviewsPage
// ─────────────────────────────────────────────────────────────

export function ReviewsPage() {
  const { activeAccountId } = useAppStore();
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<ReviewKind>('DAILY');
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [form, setForm] = useState<ReviewFormState>(EMPTY_FORM);
  const [dirty, setDirty] = useState(false);

  const period = getPeriod(kind, anchor);
  const periodKey = format(period.start, "yyyy-MM-dd'T'HH:mm:ss'Z'");

  // Fetch existing review for this period
  const { data: reviews } = useQuery<Review[]>({
    queryKey: ['reviews', kind, activeAccountId],
    queryFn: () => window.ledger.reviews.list(kind),
    enabled: !!activeAccountId,
  });

  // Fetch trades for the period stats
  const { data: tradeData } = useQuery<{ rows: TradeRow[]; total: number }>({
    queryKey: ['trades-period', period.start.toISOString(), period.end.toISOString(), activeAccountId],
    queryFn: () =>
      window.ledger.trades.list({
        accountId: activeAccountId,
        dateFrom: period.start.toISOString(),
        dateTo: period.end.toISOString(),
        includeDeleted: false,
        includeSample: false,
        pageSize: 500,
      }),
    enabled: !!activeAccountId,
  });

  const periodTrades = tradeData?.rows ?? [];

  // Populate form when review data loads or period changes
  const currentReview = reviews?.find((r) => r.periodStartUtc === periodKey);

  useEffect(() => {
    if (currentReview) {
      setForm(reviewToForm(currentReview));
    } else {
      setForm(EMPTY_FORM);
    }
    setDirty(false);
  }, [currentReview?.id, periodKey]);

  const mutation = useMutation({
    mutationFn: (data: unknown) => window.ledger.reviews.upsert(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews', kind, activeAccountId] });
      setDirty(false);
    },
  });

  const handleSave = useCallback(() => {
    if (!activeAccountId) return;
    mutation.mutate({
      accountId: activeAccountId,
      kind,
      periodStartUtc: period.start.toISOString(),
      periodEndUtc: period.end.toISOString(),
      followedPlan: form.followedPlan || undefined,
      biggestWin: form.biggestWin || undefined,
      biggestMistake: form.biggestMistake || undefined,
      improvement: form.improvement || undefined,
      patternWinners: form.patternWinners || undefined,
      patternLosers: form.patternLosers || undefined,
      strategyAdjust: form.strategyAdjust || undefined,
      moodScore: form.moodScore,
      disciplineScore: form.disciplineScore,
      energyScore: form.energyScore,
    });
  }, [form, kind, period, activeAccountId, mutation]);

  function patch(partial: Partial<ReviewFormState>) {
    setForm((prev) => ({ ...prev, ...partial }));
    setDirty(true);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border bg-card px-4 py-2">
        {(['DAILY', 'WEEKLY'] as ReviewKind[]).map((k) => (
          <button
            key={k}
            onClick={() => { setKind(k); setAnchor(new Date()); }}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              kind === k
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {k === 'DAILY' ? 'Daily' : 'Weekly'}
          </button>
        ))}

        {/* Date navigator */}
        <div className="ml-4 flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setAnchor((a) => navigate(kind, a, -1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="min-w-52 text-center text-xs font-medium text-foreground">
            {period.label}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setAnchor((a) => navigate(kind, a, 1))}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Save button */}
        <div className="ml-auto">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!dirty || mutation.isPending}
            className="h-7 gap-1.5 text-xs"
          >
            <Save className="h-3.5 w-3.5" />
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Stats strip */}
      <StatsStrip trades={periodTrades} />

      {/* Content */}
      <div className="flex flex-1 gap-0 overflow-hidden">
        {/* Trade list */}
        <div className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className="text-xs font-medium text-muted-foreground">
              Trades ({periodTrades.length})
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {periodTrades.length === 0 ? (
              <div className="flex flex-1 items-center justify-center p-6 text-xs text-muted-foreground">
                No trades this {kind === 'DAILY' ? 'day' : 'week'}
              </div>
            ) : (
              periodTrades.map((t) => <PeriodTradeRow key={t.id} trade={t} />)
            )}
          </div>
        </div>

        {/* Journal form */}
        <div className="flex flex-1 flex-col overflow-y-auto p-6">
          <div className="mx-auto w-full max-w-2xl space-y-6">
            {/* Followed plan */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground">Followed trading plan?</span>
              <PlanToggle
                value={form.followedPlan}
                onChange={(v) => patch({ followedPlan: v })}
              />
            </div>

            {/* Scores */}
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
              <span className="mb-1 text-xs font-medium text-foreground">Session Scores</span>
              <ScoreSelector
                label="Mood"
                value={form.moodScore}
                onChange={(v) => patch({ moodScore: v })}
              />
              <ScoreSelector
                label="Discipline"
                value={form.disciplineScore}
                onChange={(v) => patch({ disciplineScore: v })}
              />
              <ScoreSelector
                label="Energy"
                value={form.energyScore}
                onChange={(v) => patch({ energyScore: v })}
              />
            </div>

            {/* Journal fields */}
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Biggest Win"
                value={form.biggestWin}
                onChange={(v) => patch({ biggestWin: v })}
                placeholder="What went really well?"
              />
              <Field
                label="Biggest Mistake"
                value={form.biggestMistake}
                onChange={(v) => patch({ biggestMistake: v })}
                placeholder="What would you do differently?"
              />
            </div>

            <Field
              label="Improvement Focus"
              value={form.improvement}
              onChange={(v) => patch({ improvement: v })}
              placeholder="One concrete thing to improve tomorrow"
            />

            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Winning Patterns"
                value={form.patternWinners}
                onChange={(v) => patch({ patternWinners: v })}
                placeholder="Setups / conditions that worked"
              />
              <Field
                label="Losing Patterns"
                value={form.patternLosers}
                onChange={(v) => patch({ patternLosers: v })}
                placeholder="Setups / conditions to avoid"
              />
            </div>

            {kind === 'WEEKLY' && (
              <Field
                label="Strategy Adjustments"
                value={form.strategyAdjust}
                onChange={(v) => patch({ strategyAdjust: v })}
                placeholder="Any rule or plan changes for next week?"
                rows={4}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
