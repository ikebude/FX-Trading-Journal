/**
 * Dashboard — Milestone 9.
 *
 * 12 widgets (spec §6.12):
 *  1. Stats row (KPIs)
 *  2. Equity curve + drawdown overlay
 *  3. R-multiple distribution
 *  4. Setup performance
 *  5. Session performance
 *  6. Day-of-week heatmap
 *  7. Hour-of-day heatmap
 *  8. Win rate by confidence
 *  9. Holding-time distribution
 * 10. Win/loss streak
 * 11. Monthly P&L comparison
 * 12. Calendar heatmap
 *
 * All data flows from a single `dashboard:stats` IPC call.
 * All math lives in pnl.ts.
 */

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { buildModifiedDietzCurve } from '@/lib/equity-curve';
import type { BalanceOperation } from '@/lib/db/schema';
import { Button } from '@/components/ui/button';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  ZAxis,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  ReferenceLine,
} from 'recharts';

import { cn } from '@/lib/cn';
import { formatCurrency, formatPct, formatR } from '@/lib/format';
import {
  Tooltip as HintTooltip,
  TooltipContent as HintTooltipContent,
  TooltipTrigger as HintTooltipTrigger,
} from '@/components/ui/tooltip';
import { MetricTooltip } from '@/components/help/MetricTooltip';
import { MoodCheckin } from '@/components/dashboard/MoodCheckin';
import { useAppStore } from '@/stores/app-store';
import {
  getDashboardDateRange,
  type DashboardPreset,
} from '@/lib/dashboard-presets';
import type {
  AggregateMetrics,
  RBucket,
  SetupPerformance,
  SetupVersionPerformance,
  RevengeTradeIndicator,
  SessionPerformance,
  DayHeatmapCell,
  HourHeatmapCell,
  ConfidencePerformance,
  HoldingTimeBucket,
  CalendarHeatmapCell,
  StreakInfo,
  MonthlyPnl,
  MaeMfePoint,
  SessionDowCell,
  DurationOutcomePoint,
  PostMortem,
  SlippageStat,
} from '@/lib/pnl';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface DashboardData {
  aggregate: AggregateMetrics;
  rDistribution: RBucket[];
  setupPerformance: SetupPerformance[];
  setupVersionPerformance: SetupVersionPerformance[];
  revengeTradeIndicators: RevengeTradeIndicator[];
  sessionPerformance: SessionPerformance[];
  dayOfWeekHeatmap: DayHeatmapCell[];
  hourOfDayHeatmap: HourHeatmapCell[];
  winRateByConfidence: ConfidencePerformance[];
  holdingTimeDistribution: HoldingTimeBucket[];
  calendarHeatmap: CalendarHeatmapCell[];
  streakInfo: StreakInfo;
  monthlyPnl: MonthlyPnl[];
  sessionDowMatrix: SessionDowCell[];
  durationVsOutcome: DurationOutcomePoint[];
  postMortem: PostMortem;
  slippageStats: SlippageStat[];
}

// ─────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────

function pnlColor(value: number): string {
  if (value > 0) return 'text-emerald-400';
  if (value < 0) return 'text-rose-400';
  return 'text-muted-foreground';
}

function pnlFill(value: number): string {
  if (value > 0) return '#34d399';
  if (value < 0) return '#f87171';
  return '#6b7280';
}

function WidgetCard({
  title,
  metric,
  children,
  className,
}: {
  title: string;
  metric?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-4', className)}>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {metric ? <MetricTooltip metric={metric}>{title}</MetricTooltip> : title}
      </h3>
      {children}
    </div>
  );
}

function EmptyWidget({ message = 'No data yet' }: { message?: string }) {
  return (
    <div className="flex h-32 flex-col items-center justify-center gap-2 text-center">
      <p className="text-xs text-muted-foreground">{message}</p>
      <p className="text-xs text-muted-foreground/60">
        Import trades or add manual entries to see analytics.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Widget: Stats row
// ─────────────────────────────────────────────────────────────

function StatsRow({ agg }: { agg: AggregateMetrics }) {
  const stats: Array<{
    label: string;
    value: string;
    color?: string;
    metric?: string;
    tooltip?: React.ReactNode;
  }> = [
    { label: 'Trades', value: String(agg.closedTrades) },
    {
      label: 'Win rate',
      value: formatPct(agg.winRate * 100),
      color: agg.winRate >= 0.5 ? 'text-emerald-400' : 'text-rose-400',
    },
    {
      label: 'Avg R',
      value: agg.averageR !== null ? formatR(agg.averageR) : '—',
      metric: 'R-multiple',
      color:
        agg.averageR !== null
          ? agg.averageR >= 0
            ? 'text-emerald-400'
            : 'text-rose-400'
          : undefined,
    },
    {
      label: 'Profit factor',
      value:
        agg.profitFactor !== null
          ? Number.isFinite(agg.profitFactor)
            ? agg.profitFactor.toFixed(2)
            : '∞'
          : '—',
      metric: 'Profit Factor',
      color:
        agg.profitFactor !== null && agg.profitFactor >= 1
          ? 'text-emerald-400'
          : undefined,
    },
    {
      label: 'Expectancy',
      value: agg.expectancy !== null ? formatR(agg.expectancy) : '—',
      metric: 'Expectancy',
      tooltip:
        agg.expectancyCi95 && agg.expectancy !== null ? (
          <div className="text-left">
            <div className="font-medium">Expectancy</div>
            <div className="text-xs text-muted-foreground mt-1">
              Mean: {formatR(agg.expectancy)}
            </div>
            <div className="text-xs text-muted-foreground">
              95% CI: {formatR(agg.expectancyCi95.lower)} — {formatR(agg.expectancyCi95.upper)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">n = {agg.closedTrades} trade{agg.closedTrades !== 1 ? 's' : ''}</div>
          </div>
        ) : undefined,
    },
    {
      label: 'Net P&L',
      value: formatCurrency(agg.netPnl),
      color: pnlColor(agg.netPnl),
    },
    {
      label: 'Max DD',
      value: `-${formatCurrency(agg.maxDrawdown)}`,
      metric: 'Max Drawdown',
      color: agg.maxDrawdown > 0 ? 'text-rose-400' : undefined,
    },
    {
      label: 'Sharpe',
      value: agg.sharpePerTrade !== null ? agg.sharpePerTrade.toFixed(2) : '—',
      metric: 'Sharpe Ratio',
    },
    {
      label: 'Sortino',
      value: agg.sortinoPerTrade !== null ? agg.sortinoPerTrade.toFixed(2) : '—',
      metric: 'Sortino Ratio',
      tooltip: (
        <div className="text-left">
          <div className="font-medium">Sortino ratio</div>
          <div className="text-xs text-muted-foreground mt-1">Uses downside deviation (neg. returns only). Higher is better.</div>
          <div className="text-xs text-muted-foreground mt-1">n = {agg.closedTrades} trade{agg.closedTrades !== 1 ? 's' : ''}</div>
        </div>
      ),
      color:
        agg.sortinoPerTrade !== null
          ? agg.sortinoPerTrade >= 1
            ? 'text-emerald-400'
            : agg.sortinoPerTrade >= 0.5
            ? 'text-amber-400'
            : 'text-rose-400'
          : undefined,
    },
    {
      label: 'Calmar',
      value: agg.calmarRatio !== null ? agg.calmarRatio.toFixed(2) : '—',
      metric: 'Calmar Ratio',
      tooltip:
        agg.calmarRatio !== null ? (
          <div className="text-left">
            <div className="font-medium">Calmar Ratio (time-normalized)</div>
            <div className="text-xs text-muted-foreground mt-1">Calmar = annualized return ÷ max drawdown</div>
            <div className="text-xs text-muted-foreground mt-1">
              Annualized return: {agg.annualizedReturn != null ? `${(agg.annualizedReturn * 100).toFixed(2)}%` : '—'}
            </div>
            <div className="text-xs text-muted-foreground">Period used: {agg.calmarPeriodDays ?? '—'} day{(agg.calmarPeriodDays ?? 0) !== 1 ? 's' : ''}</div>
            <div className="text-xs text-muted-foreground mt-1">Max drawdown: {agg.maxDrawdownPct.toFixed(2)}%</div>
            <div className="text-xs text-muted-foreground mt-2 italic">Interpreting: higher is better. Values &lt;1 indicate annualized return smaller than drawdown.</div>
          </div>
        ) : (
          'Calmar requires a positive starting balance and a non-zero max drawdown.'
        ),
      color:
        agg.calmarRatio !== null
          ? agg.calmarRatio >= 2
            ? 'text-emerald-400'
            : agg.calmarRatio >= 1
            ? 'text-amber-400'
            : 'text-rose-400'
          : undefined,
    },
    {
      label: 'Recovery',
      value: agg.recoveryFactor !== null ? agg.recoveryFactor.toFixed(2) : '—',
      metric: 'Recovery Factor',
      tooltip: 'Recovery Factor = Net P&L / Max Drawdown — higher indicates efficient recovery',
      color:
        agg.recoveryFactor !== null
          ? agg.recoveryFactor >= 2
            ? 'text-emerald-400'
            : agg.recoveryFactor >= 1
            ? 'text-amber-400'
            : 'text-rose-400'
          : undefined,
    },
    {
      label: 'Anxiety↔R',
      value:
        agg.anxietyOutcomeCorrelation !== null
          ? agg.anxietyOutcomeCorrelation.toFixed(2)
          : '—',
      metric: 'Anxiety vs Outcome (T3.7)',
      tooltip:
        'Pearson r between pre-trade anxiety (0-10) and realized R-multiple. ' +
        'Negative → higher anxiety tends to worse outcomes. Needs ≥ 3 trades with anxiety logged.',
      color:
        agg.anxietyOutcomeCorrelation !== null
          ? agg.anxietyOutcomeCorrelation <= -0.3
            ? 'text-rose-400'
            : agg.anxietyOutcomeCorrelation >= 0.3
            ? 'text-emerald-400'
            : 'text-amber-400'
          : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-3 lg:grid-cols-8">
      {stats.map(({ label, value, color, metric, tooltip }) => (
        <div
          key={label}
          className="rounded-lg border border-border bg-card px-3 py-2.5 text-center"
        >
          <p
            className={cn(
              'text-base font-bold tabular-nums',
              color ?? 'text-foreground',
            )}
          >
            {value}
          </p>
          {/* Calmar short-period badge */}
          {label === 'Calmar' && agg.annualizedReturn == null && agg.calmarRatio !== null ? (
            <HintTooltip>
              <HintTooltipTrigger asChild>
                <div className="mx-auto mt-1 inline-block">
                  <span className="rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-medium text-white">Not annualized</span>
                </div>
              </HintTooltipTrigger>
              <HintTooltipContent className="max-w-48 text-left">
                <div className="font-medium">Calmar not annualized</div>
                <div className="text-xs text-muted-foreground mt-1">Measurement period is too short to annualize (shown value is non-annualized Calmar).</div>
                <div className="text-xs text-muted-foreground mt-1">Consider increasing the analysis window to get an annualized Calmar.</div>
              </HintTooltipContent>
            </HintTooltip>
          ) : null}
          {metric ? (
            <MetricTooltip metric={metric}>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
            </MetricTooltip>
          ) : tooltip ? (
            <HintTooltip>
              <HintTooltipTrigger asChild>
                <p className="mt-0.5 cursor-help text-[10px] text-muted-foreground border-b border-dashed border-muted-foreground/40 inline-block">
                  {label}
                </p>
              </HintTooltipTrigger>
              <HintTooltipContent className="max-w-56 text-center">
                {tooltip}
              </HintTooltipContent>
            </HintTooltip>
          ) : (
            <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Widget: Equity curve (Modified Dietz)
// ─────────────────────────────────────────────────────────────

interface EquityCurveWidgetProps {
  agg: AggregateMetrics;
  accountId: string | null;
  startingBalance: number;
}

function EquityCurveWidget({ agg, accountId, startingBalance }: EquityCurveWidgetProps) {
  const { data: balanceOps = [] } = useQuery<BalanceOperation[]>({
    queryKey: ['balance-ops', accountId ?? '__all__'],
    queryFn: () =>
      accountId
        ? (window.ledger.balanceOps.list(accountId) as Promise<BalanceOperation[]>)
        : Promise.resolve([]),
    enabled: !!accountId,
    staleTime: 60_000,
  });

  const dietzPoints = useMemo(
    () =>
      buildModifiedDietzCurve(
        startingBalance,
        agg.equityCurve,
        balanceOps
          .filter((op) => !op.deletedAtUtc)
          .map((op) => ({
            timestampUtc: op.occurredAtUtc,
            amount: op.amount,
            opType: op.opType,
          })),
      ),
    [startingBalance, agg.equityCurve, balanceOps],
  );

  if (dietzPoints.length === 0) return <EmptyWidget />;

  const depositTimestamps = dietzPoints
    .filter((p) => p.cashFlowAmount !== undefined)
    .map((p) => p.timestamp);

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart
        data={dietzPoints}
        margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
      >
        <defs>
          <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#34d399" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f87171" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="timestamp" hide />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: '#71717a' }}
          width={55}
          tickFormatter={(v) => formatCurrency(v)}
        />
        <Tooltip
          contentStyle={{
            background: '#18181b',
            border: '1px solid #27272a',
            borderRadius: 6,
            fontSize: 11,
          }}
          formatter={(value: number, name: string) => {
            if (name === 'balance') return [formatCurrency(value), 'Balance'];
            if (name === 'drawdown') return [`-${formatCurrency(value)}`, 'Drawdown'];
            return [value, name];
          }}
          labelFormatter={(ts: string) => ts.slice(0, 10)}
        />
        {depositTimestamps.map((ts) => (
          <ReferenceLine
            key={ts}
            x={ts}
            stroke="#60a5fa"
            strokeDasharray="3 3"
            strokeOpacity={0.6}
          />
        ))}
        <Area
          type="monotone"
          dataKey="balance"
          stroke="#34d399"
          strokeWidth={2}
          fill="url(#equityGrad)"
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="drawdown"
          stroke="#f87171"
          strokeWidth={1}
          fill="url(#ddGrad)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────────────────────
// Widget: R distribution
// ─────────────────────────────────────────────────────────────

function RDistributionWidget({ data }: { data: RBucket[] }) {
  if (data.length === 0 || data.every((b) => b.count === 0)) return <EmptyWidget />;

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#71717a' }} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: '#71717a' }}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: '#18181b',
            border: '1px solid #27272a',
            borderRadius: 6,
            fontSize: 11,
          }}
          formatter={(value: number) => [value, 'Trades']}
        />
        <ReferenceLine x="+0.0R" stroke="#52525b" strokeDasharray="4 2" />
        <Bar dataKey="count" radius={[2, 2, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.label} fill={entry.min >= 0 ? '#34d399' : '#f87171'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────────────────────
// Widget: Setup performance
// ─────────────────────────────────────────────────────────────

function SetupPerformanceWidget({ data }: { data: SetupPerformance[] }) {
  if (data.length === 0) return <EmptyWidget />;
  const top8 = data.slice(0, 8);

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart
        data={top8}
        layout="vertical"
        margin={{ top: 4, right: 40, bottom: 0, left: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
        <XAxis
          type="number"
          tickLine={false}
          tick={{ fontSize: 10, fill: '#71717a' }}
          tickFormatter={(v) => `${Number(v).toFixed(1)}R`}
        />
        <YAxis
          type="category"
          dataKey="setup"
          tick={{ fontSize: 10, fill: '#71717a' }}
          width={80}
        />
        <Tooltip
          contentStyle={{
            background: '#18181b',
            border: '1px solid #27272a',
            borderRadius: 6,
            fontSize: 11,
          }}
          formatter={(value: number) => [`${value.toFixed(2)}R`, 'Avg R']}
        />
        <Bar dataKey="avgR" radius={[0, 2, 2, 0]}>
          {top8.map((entry) => (
            <Cell
              key={entry.setup}
              fill={
                entry.avgR !== null && entry.avgR >= 0 ? '#34d399' : '#f87171'
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────────────────────
// Widget: Session performance
// ─────────────────────────────────────────────────────────────

const SESSION_LABELS: Record<string, string> = {
  SYDNEY: 'Sydney',
  TOKYO: 'Tokyo',
  ASIAN_RANGE: 'Asian',
  LONDON: 'London',
  NY_AM: 'NY AM',
  LONDON_CLOSE: 'Lon Close',
  NY_PM: 'NY PM',
  OFF_HOURS: 'Off Hours',
};

function SessionPerformanceWidget({ data }: { data: SessionPerformance[] }) {
  if (data.length === 0) return <EmptyWidget />;
  const mapped = data.map((s) => ({
    ...s,
    label: SESSION_LABELS[s.session] ?? s.session,
  }));

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={mapped} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#71717a' }} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: '#71717a' }}
          tickFormatter={(v) => formatCurrency(v)}
        />
        <Tooltip
          contentStyle={{
            background: '#18181b',
            border: '1px solid #27272a',
            borderRadius: 6,
            fontSize: 11,
          }}
          formatter={(value: number, name: string) => [
            name === 'netPnl' ? formatCurrency(value) : formatPct(value * 100),
            name === 'netPnl' ? 'P&L' : 'Win rate',
          ]}
        />
        <Bar dataKey="netPnl" radius={[2, 2, 0, 0]}>
          {mapped.map((entry) => (
            <Cell
              key={entry.session}
              fill={entry.netPnl >= 0 ? '#34d399' : '#f87171'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────────────────────
// Widget: Heatmap cell
// ─────────────────────────────────────────────────────────────

function HeatCell({ value, label }: { value: number; label: string }) {
  const intensity = Math.min(1, Math.abs(value) / 500);
  const bg =
    value > 0
      ? `rgba(52,211,153,${0.15 + intensity * 0.7})`
      : value < 0
        ? `rgba(248,113,113,${0.15 + intensity * 0.7})`
        : 'transparent';
  return (
    <div
      className="flex flex-col items-center justify-center rounded p-2 text-center"
      style={{ backgroundColor: bg }}
    >
      <span className="text-[9px] text-muted-foreground">{label}</span>
      <span className={cn('text-xs font-semibold tabular-nums', pnlColor(value))}>
        {value === 0 ? '—' : formatCurrency(value)}
      </span>
    </div>
  );
}

function DayHeatmapWidget({ data }: { data: DayHeatmapCell[] }) {
  if (data.every((d) => d.count === 0)) return <EmptyWidget />;
  return (
    <div className="grid grid-cols-7 gap-1">
      {data.map((d) => (
        <HeatCell key={d.dayIndex} value={d.netPnl} label={d.dayName} />
      ))}
    </div>
  );
}

function HourHeatmapWidget({ data }: { data: HourHeatmapCell[] }) {
  if (data.every((d) => d.count === 0)) return <EmptyWidget />;
  return (
    <div className="grid grid-cols-12 gap-1">
      {data.map((d) => (
        <HeatCell key={d.hour} value={d.netPnl} label={`${d.hour}h`} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Widget: Win rate by confidence
// ─────────────────────────────────────────────────────────────

function ConfidenceWidget({ data }: { data: ConfidencePerformance[] }) {
  if (data.length === 0) return <EmptyWidget />;
  const mapped = data.map((d) => ({
    ...d,
    label: '★'.repeat(d.confidence),
    winRatePct: d.winRate * 100,
  }));

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={mapped} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#71717a' }} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: '#71717a' }}
          tickFormatter={(v) => `${v}%`}
          domain={[0, 100]}
        />
        <Tooltip
          contentStyle={{
            background: '#18181b',
            border: '1px solid #27272a',
            borderRadius: 6,
            fontSize: 11,
          }}
          formatter={(value: number) => [
            `${Number(value).toFixed(0)}%`,
            'Win rate',
          ]}
        />
        <ReferenceLine y={50} stroke="#52525b" strokeDasharray="4 2" />
        <Bar dataKey="winRatePct" radius={[2, 2, 0, 0]}>
          {mapped.map((entry) => (
            <Cell
              key={entry.confidence}
              fill={entry.winRate >= 0.5 ? '#34d399' : '#f87171'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────────────────────
// Widget: Holding time distribution
// ─────────────────────────────────────────────────────────────

function HoldingTimeWidget({ data }: { data: HoldingTimeBucket[] }) {
  if (data.length === 0) return <EmptyWidget />;

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#71717a' }} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: '#71717a' }}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: '#18181b',
            border: '1px solid #27272a',
            borderRadius: 6,
            fontSize: 11,
          }}
          formatter={(value: number) => [value, 'Trades']}
        />
        <Bar dataKey="count" fill="#818cf8" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────────────────────
// Widget: Win/loss streak
// ─────────────────────────────────────────────────────────────

function StreakWidget({ info }: { info: StreakInfo }) {
  const {
    currentStreak,
    currentIsWin,
    longestWinStreak,
    longestLossStreak,
    last20Results,
  } = info;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'rounded-full px-3 py-1 text-sm font-bold',
            currentIsWin
              ? 'bg-emerald-500/20 text-emerald-300'
              : 'bg-rose-500/20 text-rose-300',
          )}
        >
          {currentStreak > 0
            ? `${currentStreak}${currentIsWin ? 'W' : 'L'} streak`
            : 'No streak'}
        </div>
        <div className="text-xs text-muted-foreground">
          Best win: {longestWinStreak}W · Worst loss: {longestLossStreak}L
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {last20Results.map((r, i) => (
          <div
            key={i}
            className={cn(
              'h-4 w-4 rounded-sm',
              r === 'WIN'
                ? 'bg-emerald-500'
                : r === 'LOSS'
                  ? 'bg-rose-500'
                  : 'bg-zinc-600',
            )}
            title={r}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Widget: Monthly P&L
// ─────────────────────────────────────────────────────────────

function MonthlyPnlWidget({ data }: { data: MonthlyPnl[] }) {
  if (data.length === 0) return <EmptyWidget />;

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 9, fill: '#71717a' }}
          tickFormatter={(v: string) => v.slice(5)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: '#71717a' }}
          tickFormatter={(v) => formatCurrency(v)}
        />
        <Tooltip
          contentStyle={{
            background: '#18181b',
            border: '1px solid #27272a',
            borderRadius: 6,
            fontSize: 11,
          }}
          formatter={(value: number) => [formatCurrency(value), 'Net P&L']}
          labelFormatter={(m: string) => m}
        />
        <ReferenceLine y={0} stroke="#52525b" />
        <Bar dataKey="netPnl" radius={[2, 2, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.month} fill={pnlFill(entry.netPnl)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────────────────────
// Widget: Calendar heatmap
// ─────────────────────────────────────────────────────────────

function CalendarHeatmapWidget({ data }: { data: CalendarHeatmapCell[] }) {
  if (data.length === 0) return <EmptyWidget />;

  const byMonth = new Map<string, CalendarHeatmapCell[]>();
  for (const cell of data) {
    const month = cell.date.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)!.push(cell);
  }

  const months = [...byMonth.keys()].sort().slice(-3);
  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.netPnl)));

  return (
    <div className="space-y-3 overflow-x-auto">
      {months.map((month) => {
        const cells = byMonth.get(month)!;
        return (
          <div key={month}>
            <p className="mb-1 text-[10px] text-muted-foreground">{month}</p>
            <div className="flex flex-wrap gap-1">
              {cells.map((c) => {
                const intensity = Math.min(0.9, Math.abs(c.netPnl) / maxAbs);
                const bg =
                  c.netPnl > 0
                    ? `rgba(52,211,153,${0.15 + intensity * 0.75})`
                    : c.netPnl < 0
                      ? `rgba(248,113,113,${0.15 + intensity * 0.75})`
                      : '#27272a';
                return (
                  <div
                    key={c.date}
                    className="h-5 w-5 rounded-sm"
                    style={{ backgroundColor: bg }}
                    title={`${c.date}: ${formatCurrency(c.netPnl)} (${c.count} trade${c.count !== 1 ? 's' : ''})`}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Widget: Session × Day-of-week matrix (T3.3)
// ─────────────────────────────────────────────────────────────

const SESSION_ORDER_DISPLAY = ['LONDON', 'NY_AM', 'LONDON_CLOSE', 'TOKYO', 'SYDNEY', 'ASIAN_RANGE', 'NY_PM', 'OFF_HOURS'];
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function SessionDowMatrixWidget({ data }: { data: SessionDowCell[] }) {
  if (data.length === 0) return <EmptyWidget />;

  // Build lookup: session → dayIndex → cell
  const lookup = new Map<string, Map<number, SessionDowCell>>();
  for (const cell of data) {
    if (!lookup.has(cell.session)) lookup.set(cell.session, new Map());
    lookup.get(cell.session)!.set(cell.dayIndex, cell);
  }

  const sessions = SESSION_ORDER_DISPLAY.filter((s) => lookup.has(s));
  const days = [1, 2, 3, 4, 5]; // Mon–Fri only (forex)

  const allNetPnl = data.map((c) => c.netPnl);
  const maxAbs = Math.max(1, ...allNetPnl.map(Math.abs));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px]">
        <thead>
          <tr>
            <th className="py-1 pr-2 text-left text-muted-foreground font-normal">Session</th>
            {days.map((d) => (
              <th key={d} className="px-1 py-1 text-center text-muted-foreground font-normal">
                {DOW_LABELS[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr key={session}>
              <td className="py-0.5 pr-2 text-muted-foreground whitespace-nowrap">
                {SESSION_LABELS[session] ?? session}
              </td>
              {days.map((d) => {
                const cell = lookup.get(session)?.get(d);
                if (!cell) {
                  return <td key={d} className="px-1 py-0.5 text-center">—</td>;
                }
                const intensity = Math.min(0.9, Math.abs(cell.netPnl) / maxAbs);
                const bg =
                  cell.netPnl > 0
                    ? `rgba(52,211,153,${0.12 + intensity * 0.65})`
                    : `rgba(248,113,113,${0.12 + intensity * 0.65})`;
                return (
                  <td
                    key={d}
                    className="px-1 py-0.5 text-center rounded-sm"
                    style={{ backgroundColor: bg }}
                    title={`${SESSION_LABELS[session] ?? session} ${DOW_LABELS[d]}: ${formatCurrency(cell.netPnl)} (${cell.count} trades, ${(cell.winRate * 100).toFixed(0)}% WR)`}
                  >
                    <span className={pnlColor(cell.netPnl)}>
                      {cell.netPnl >= 0 ? '+' : ''}{cell.netPnl.toFixed(0)}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Widget: Time-of-day P&L curve (T3.3)
// ─────────────────────────────────────────────────────────────

import { LineChart, Line } from 'recharts';

function TimeOfDayCurveWidget({ data }: { data: HourHeatmapCell[] }) {
  const curve = data
    .filter((c) => c.count > 0)
    .map((c) => ({ hour: c.hour, avgPnl: c.netPnl / c.count, count: c.count }));

  if (curve.length === 0) return <EmptyWidget />;

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={curve} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis
          dataKey="hour"
          tick={{ fontSize: 9, fill: '#71717a' }}
          tickFormatter={(h: number) => `${h}:00`}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10, fill: '#71717a' }}
          tickFormatter={(v) => formatCurrency(v)}
        />
        <ReferenceLine y={0} stroke="#52525b" />
        <Tooltip
          contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 6, fontSize: 11 }}
          formatter={(v: number) => [formatCurrency(v), 'Avg P&L / trade']}
          labelFormatter={(h: number) => `${h}:00–${h + 1}:00`}
        />
        <Line
          type="monotone"
          dataKey="avgPnl"
          stroke="#818cf8"
          dot={false}
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────────────────────
// Widget: Duration vs outcome scatter (T3.3)
// ─────────────────────────────────────────────────────────────

function DurationOutcomeWidget({ data }: { data: DurationOutcomePoint[] }) {
  if (data.length === 0) return <EmptyWidget />;

  const wins = data.filter((p) => p.rMultiple !== null && p.rMultiple > 0);
  const losses = data.filter((p) => p.rMultiple !== null && p.rMultiple <= 0);
  const noR = data.filter((p) => p.rMultiple === null);

  const tooltipStyle = { background: '#18181b', border: '1px solid #27272a', borderRadius: 6, fontSize: 11 };

  function fmtMins(mins: number): string {
    if (mins < 60) return `${Math.round(mins)}m`;
    if (mins < 1440) return `${(mins / 60).toFixed(1)}h`;
    return `${(mins / 1440).toFixed(1)}d`;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ScatterChart margin={{ top: 4, right: 12, bottom: 24, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis
          dataKey="holdingTimeMinutes"
          name="Duration"
          type="number"
          scale="log"
          domain={['auto', 'auto']}
          label={{ value: 'Holding time (log)', position: 'insideBottom', offset: -14, fontSize: 10, fill: '#71717a' }}
          tick={{ fontSize: 9, fill: '#71717a' }}
          tickFormatter={fmtMins}
        />
        <YAxis
          dataKey="rMultiple"
          name="R"
          type="number"
          label={{ value: 'R-multiple', angle: -90, position: 'insideLeft', offset: 12, fontSize: 10, fill: '#71717a' }}
          tick={{ fontSize: 10, fill: '#71717a' }}
          tickLine={false}
          axisLine={false}
        />
        <ZAxis range={[24, 24]} />
        <ReferenceLine y={0} stroke="#52525b" />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ strokeDasharray: '3 3' }}
          formatter={(value: number, name: string) =>
            name === 'Duration'
              ? [fmtMins(value), 'Duration']
              : [value !== null ? value.toFixed(2) + 'R' : '—', 'R-multiple']
          }
        />
        {wins.length > 0 && <Scatter name="Win" data={wins} fill="#34d399" fillOpacity={0.7} />}
        {losses.length > 0 && <Scatter name="Loss" data={losses} fill="#f87171" fillOpacity={0.7} />}
        {noR.length > 0 && <Scatter name="No R" data={noR} fill="#71717a" fillOpacity={0.7} />}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────────────────────
// Widget: MAE / MFE scatter (T3.2)
// ─────────────────────────────────────────────────────────────

function MaeMfeScatterWidget({ data }: { data: MaeMfePoint[] }) {
  if (data.length === 0) return <EmptyWidget message="No MAE/MFE data yet — set via EA v2.1+ or edit a trade" />;

  const wins = data.filter((p) => p.rMultiple !== null && p.rMultiple > 0);
  const losses = data.filter((p) => p.rMultiple !== null && p.rMultiple <= 0);
  const noR = data.filter((p) => p.rMultiple === null);

  const tooltipStyle = {
    background: '#18181b',
    border: '1px solid #27272a',
    borderRadius: 6,
    fontSize: 11,
  };

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ScatterChart margin={{ top: 4, right: 12, bottom: 24, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis
          dataKey="maePips"
          name="MAE"
          type="number"
          label={{ value: 'MAE (pips)', position: 'insideBottom', offset: -14, fontSize: 10, fill: '#71717a' }}
          tick={{ fontSize: 10, fill: '#71717a' }}
        />
        <YAxis
          dataKey="mfePips"
          name="MFE"
          type="number"
          label={{ value: 'MFE (pips)', angle: -90, position: 'insideLeft', offset: 12, fontSize: 10, fill: '#71717a' }}
          tick={{ fontSize: 10, fill: '#71717a' }}
          tickLine={false}
          axisLine={false}
        />
        <ZAxis range={[28, 28]} />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ strokeDasharray: '3 3' }}
          formatter={(value: number, name: string) => [
            value.toFixed(1) + ' pips',
            name === 'MAE' ? 'MAE' : 'MFE',
          ]}
        />
        {wins.length > 0 && (
          <Scatter name="Win" data={wins} fill="#34d399" fillOpacity={0.7} />
        )}
        {losses.length > 0 && (
          <Scatter name="Loss" data={losses} fill="#f87171" fillOpacity={0.7} />
        )}
        {noR.length > 0 && (
          <Scatter name="No R" data={noR} fill="#71717a" fillOpacity={0.7} />
        )}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────────────────────
// Widget: Setup version performance with degradation alerts (T3.4)
// ─────────────────────────────────────────────────────────────

function SetupVersionPerformanceWidget({ data }: { data: SetupVersionPerformance[] }) {
  const degraded = data.filter((s) => s.isDegraded);
  const healthy = data.filter((s) => !s.isDegraded);

  if (data.length === 0) return <EmptyWidget />;

  return (
    <div className="space-y-3 text-xs">
      {/* Degraded setups (red alert) */}
      {degraded.length > 0 && (
        <div className="space-y-2">
          <div className="font-medium text-rose-400">⚠ Degraded ({degraded.length})</div>
          {degraded.slice(0, 4).map((s) => (
            <div
              key={s.setup}
              className="flex items-start justify-between rounded border border-rose-900/40 bg-rose-950/20 p-2"
            >
              <div className="flex-1 space-y-0.5">
                <div className="font-medium text-rose-300">{s.setup}</div>
                <div className="text-muted-foreground">
                  <span>{s.closedTrades} trades</span> • 
                  <span className="ml-1">
                    Hist: {s.historicalExpectancy !== null ? formatR(s.historicalExpectancy) : '—'}
                  </span>
                </div>
              </div>
              <div className="ml-2 text-right">
                <div className="font-mono text-rose-400">
                  {s.rolling30Expectancy !== null ? formatR(s.rolling30Expectancy) : '—'}
                </div>
                <div className="text-muted-foreground text-xs">Rolling 30</div>
              </div>
            </div>
          ))}
          {degraded.length > 4 && (
            <div className="text-center text-muted-foreground/60">
              +{degraded.length - 4} more degraded
            </div>
          )}
        </div>
      )}

      {/* Healthy setups (green) */}
      {healthy.length > 0 && (
        <div className="space-y-2">
          <div className="font-medium text-emerald-400">✓ Healthy ({healthy.length})</div>
          {healthy.slice(0, 4).map((s) => (
            <div
              key={s.setup}
              className="flex items-start justify-between rounded border border-emerald-900/40 bg-emerald-950/20 p-2"
            >
              <div className="flex-1 space-y-0.5">
                <div className="font-medium text-emerald-300">{s.setup}</div>
                <div className="text-muted-foreground">
                  <span>{s.closedTrades} trades</span> •
                  <span className="ml-1">
                    {s.historicalExpectancy !== null ? formatR(s.historicalExpectancy) : '—'}
                  </span>
                </div>
              </div>
              <div className="ml-2 text-right">
                <div className="font-mono text-emerald-400">
                  {s.rolling30Expectancy !== null ? formatR(s.rolling30Expectancy) : '—'}
                </div>
                <div className="text-muted-foreground text-xs">Rolling 30</div>
              </div>
            </div>
          ))}
          {healthy.length > 4 && (
            <div className="text-center text-muted-foreground/60">
              +{healthy.length - 4} more healthy
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Widget: Slippage / spread baseline (T3.9)
function SlippageWidget({ data }: { data: SlippageStat[] }) {
  if (data.length === 0)
    return <EmptyWidget message="No execution data yet (EA v2 required)" />;
  return (
    <div className="flex flex-col divide-y divide-border text-sm">
      {data.slice(0, 8).map((s) => (
        <div
          key={`${s.symbol}-${s.session}`}
          className="flex items-center justify-between py-1.5"
        >
          <span className="font-medium">
            {s.symbol}{' '}
            <span className="text-xs text-muted-foreground">{s.session}</span>
          </span>
          <span className="flex gap-4 text-xs tabular-nums">
            <span
              className={cn(
                s.avgSlippagePips != null && s.avgSlippagePips < 0
                  ? 'text-rose-400'
                  : 'text-muted-foreground',
              )}
            >
              slip {s.avgSlippagePips != null ? s.avgSlippagePips.toFixed(2) : '—'}
            </span>
            <span className="text-muted-foreground">
              spread {s.avgSpreadPips != null ? s.avgSpreadPips.toFixed(2) : '—'}
            </span>
            <span className="text-muted-foreground">n={s.sampleCount}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function RevengeTradeWidget({ data }: { data: RevengeTradeIndicator[] }) {
  if (data.length === 0) return <EmptyWidget />;

  const recovered = data.filter((r) => r.recouped);
  const failed = data.filter((r) => !r.recouped);

  return (
    <div className="space-y-3 text-xs">
      {/* Failed recovery attempts (red) */}
      {failed.length > 0 && (
        <div className="space-y-2">
          <div className="font-medium text-rose-400">⚠ Failed ({failed.length})</div>
          {failed.slice(0, 4).map((r) => (
            <div
              key={r.tradeId}
              className="flex items-start justify-between rounded border border-rose-900/40 bg-rose-950/20 p-2"
            >
              <div className="flex-1 space-y-0.5">
                <div className="font-medium text-rose-300">Trade {r.tradeId.slice(0, 8)}</div>
                <div className="text-muted-foreground">
                  <span>{r.minutesAfterLoss.toFixed(1)}m after loss</span> •
                  <span className="ml-1">{r.revengeResult ?? 'OPEN'}</span>
                </div>
              </div>
              <div className="ml-2 text-right">
                <div className="font-mono text-rose-400">
                  {r.revengePnl !== null ? formatCurrency(r.revengePnl) : '—'}
                </div>
                <div className="text-muted-foreground text-xs">
                  Loss: {formatCurrency(r.priorLossPnl)}
                </div>
              </div>
            </div>
          ))}
          {failed.length > 4 && (
            <div className="text-center text-muted-foreground/60">
              +{failed.length - 4} more failed
            </div>
          )}
        </div>
      )}

      {/* Successful recovery (green) */}
      {recovered.length > 0 && (
        <div className="space-y-2">
          <div className="font-medium text-emerald-400">✓ Recovered ({recovered.length})</div>
          {recovered.slice(0, 4).map((r) => (
            <div
              key={r.tradeId}
              className="flex items-start justify-between rounded border border-emerald-900/40 bg-emerald-950/20 p-2"
            >
              <div className="flex-1 space-y-0.5">
                <div className="font-medium text-emerald-300">Trade {r.tradeId.slice(0, 8)}</div>
                <div className="text-muted-foreground">
                  <span>{r.minutesAfterLoss.toFixed(1)}m after loss</span> •
                  <span className="ml-1">{r.revengeResult ?? 'OPEN'}</span>
                </div>
              </div>
              <div className="ml-2 text-right">
                <div className="font-mono text-emerald-400">
                  {r.revengePnl !== null ? formatCurrency(r.revengePnl) : '—'}
                </div>
                <div className="text-muted-foreground text-xs">
                  Loss: {formatCurrency(r.priorLossPnl)}
                </div>
              </div>
            </div>
          ))}
          {recovered.length > 4 && (
            <div className="text-center text-muted-foreground/60">
              +{recovered.length - 4} more recovered
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Date range presets live in src/lib/dashboard-presets.ts so they can be
// unit-tested without pulling in the full renderer chain (see
// tests/dashboard-date-range.test.ts).
type Preset = DashboardPreset;

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────

export function DashboardPage() {
  const queryClient = useQueryClient();
  const { activeAccountId, displayTimezone } = useAppStore();
  const [preset, setPreset] = useState<Preset>('30d');

  const filters = useMemo(() => {
    const range = getDashboardDateRange(preset);
    return {
      ...(activeAccountId ? { accountId: activeAccountId } : {}),
      ...range,
    };
  }, [activeAccountId, preset]);

  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['dashboard:stats', filters, displayTimezone],
    queryFn: () =>
      window.ledger.dashboard.stats(filters, displayTimezone),
    staleTime: 60_000,
  });

  const { data: activeAccount } = useQuery<{ initialBalance: number } | null>({
    queryKey: ['accounts', activeAccountId],
    queryFn: () =>
      activeAccountId
        ? (window.ledger.accounts.get(activeAccountId) as Promise<{ initialBalance: number }>)
        : Promise.resolve(null),
    enabled: !!activeAccountId,
    staleTime: 60_000,
  });

  const PRESETS: { key: Preset; label: string }[] = [
    { key: '7d', label: '7D' },
    { key: '30d', label: '30D' },
    { key: '90d', label: '90D' },
    { key: 'ytd', label: 'YTD' },
    { key: 'all', label: 'All' },
  ];

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading dashboard…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <div className="text-sm text-rose-400">Failed to load dashboard data.</div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['dashboard:stats'] })}
        >
          Retry
        </Button>
      </div>
    );
  }

  const {
    aggregate,
    rDistribution,
    setupPerformance,
    setupVersionPerformance,
    revengeTradeIndicators,
    sessionPerformance,
    dayOfWeekHeatmap,
    hourOfDayHeatmap,
    winRateByConfidence,
    holdingTimeDistribution,
    calendarHeatmap,
    streakInfo,
    monthlyPnl,
    sessionDowMatrix,
    durationVsOutcome,
  } = data;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Control bar */}
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
        <span className="text-sm font-medium text-foreground">Dashboard</span>
        <div className="ml-auto flex items-center gap-1">
          {PRESETS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setPreset(key)}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                preset === key
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Stats row */}
        <StatsRow agg={aggregate} />

        {/* Mood check-in (T3.7) — optional, standalone */}
        <div className="grid grid-cols-3 gap-4">
          <WidgetCard title="Mood check-in">
            <MoodCheckin />
          </WidgetCard>
        </div>

        {/* Row 1: Equity curve (wide) + Streak */}
        <div className="grid grid-cols-3 gap-4">
          <WidgetCard title="Equity curve" metric="Equity Curve" className="col-span-2">
            <EquityCurveWidget
              agg={aggregate}
              accountId={activeAccountId}
              startingBalance={activeAccount?.initialBalance ?? 0}
            />
          </WidgetCard>
          <WidgetCard title="Win / loss streak">
            <StreakWidget info={streakInfo} />
          </WidgetCard>
        </div>

        {/* Row 2: R distribution + Monthly P&L */}
        <div className="grid grid-cols-2 gap-4">
          <WidgetCard title="R-multiple distribution" metric="R-multiple">
            <RDistributionWidget data={rDistribution} />
          </WidgetCard>
          <WidgetCard title="Monthly P&L (last 12 months)">
            <MonthlyPnlWidget data={monthlyPnl} />
          </WidgetCard>
        </div>

        {/* Row 3: Setup perf + Session perf */}
        <div className="grid grid-cols-2 gap-4">
          <WidgetCard title="Setup performance (avg R)">
            <SetupPerformanceWidget data={setupPerformance} />
          </WidgetCard>
          <WidgetCard title="Session performance">
            <SessionPerformanceWidget data={sessionPerformance} />
          </WidgetCard>
        </div>

        {/* Row 3.5: Setup version performance with degradation alerts (T3.4) */}
        <div className="grid grid-cols-1 gap-4">
          <WidgetCard title="Setup version performance (degradation alerts)">
            <SetupVersionPerformanceWidget data={setupVersionPerformance} />
          </WidgetCard>
        </div>

        {/* Row 3.6: Revenge-trade detector (T3.5) */}
        <div className="grid grid-cols-1 gap-4">
          <WidgetCard title="Revenge trades (emotional recovery attempts)">
            <RevengeTradeWidget data={revengeTradeIndicators} />
          </WidgetCard>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <WidgetCard title="Execution quality — slippage & spread (T3.9)">
            <SlippageWidget data={data.slippageStats} />
          </WidgetCard>
        </div>

        {/* Row 4: Day heatmap + Hour heatmap */}
        <div className="grid grid-cols-2 gap-4">
          <WidgetCard title="Day of week">
            <DayHeatmapWidget data={dayOfWeekHeatmap} />
          </WidgetCard>
          <WidgetCard title="Hour of day">
            <HourHeatmapWidget data={hourOfDayHeatmap} />
          </WidgetCard>
        </div>

        {/* Row 5: Confidence + Holding time + Calendar */}
        <div className="grid grid-cols-3 gap-4">
          <WidgetCard title="Win rate by confidence">
            <ConfidenceWidget data={winRateByConfidence} />
          </WidgetCard>
          <WidgetCard title="Holding time distribution">
            <HoldingTimeWidget data={holdingTimeDistribution} />
          </WidgetCard>
          <WidgetCard title="Calendar heatmap">
            <CalendarHeatmapWidget data={calendarHeatmap} />
          </WidgetCard>
        </div>

        {/* Row 6: MAE / MFE scatter */}
        <div className="grid grid-cols-1 gap-4">
          <WidgetCard title="MAE / MFE scatter (pips)" metric="MAE MFE">
            <MaeMfeScatterWidget data={aggregate.maeMfeScatter} />
          </WidgetCard>
        </div>

        {/* Row 7: Session × DoW matrix */}
        <div className="grid grid-cols-1 gap-4">
          <WidgetCard title="Session × day-of-week (net P&L)">
            <SessionDowMatrixWidget data={sessionDowMatrix} />
          </WidgetCard>
        </div>

        {/* Row 8: Duration vs outcome + Time-of-day curve */}
        <div className="grid grid-cols-2 gap-4">
          <WidgetCard title="Duration vs outcome">
            <DurationOutcomeWidget data={durationVsOutcome} />
          </WidgetCard>
          <WidgetCard title="Avg P&L by time of day">
            <TimeOfDayCurveWidget data={hourOfDayHeatmap} />
          </WidgetCard>
        </div>
      </div>
    </div>
  );
}
