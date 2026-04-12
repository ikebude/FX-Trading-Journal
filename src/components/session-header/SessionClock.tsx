/**
 * SessionClock — live market session indicator strip.
 *
 * Shows:
 *  - Current UTC time
 *  - Current time in NY and London
 *  - Active trading session badge (Sydney / Tokyo / London / NY AM / NY PM / etc.)
 *  - Quick blotter stats: open trades count, today's P&L
 *
 * Rendered inside the TopBar.
 * Uses setInterval to refresh every second.
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { cn } from '@/lib/cn';
import { detectSession } from '@/lib/tz';
import { useAppStore } from '@/stores/app-store';
import type { TradeRow } from '@/lib/db/queries';

// ─────────────────────────────────────────────────────────────
// Session display metadata
// ─────────────────────────────────────────────────────────────

const SESSION_META: Record<string, { label: string; color: string }> = {
  NY_AM:        { label: 'NY AM',         color: 'text-emerald-400 bg-emerald-950/60' },
  NY_PM:        { label: 'NY PM',         color: 'text-emerald-300 bg-emerald-950/40' },
  LONDON:       { label: 'London',        color: 'text-sky-400    bg-sky-950/60' },
  LONDON_CLOSE: { label: 'London Close',  color: 'text-sky-300    bg-sky-950/40' },
  TOKYO:        { label: 'Tokyo',         color: 'text-violet-400 bg-violet-950/60' },
  SYDNEY:       { label: 'Sydney',        color: 'text-amber-400  bg-amber-950/60' },
  ASIAN_RANGE:  { label: 'Asian Range',   color: 'text-violet-300 bg-violet-950/40' },
  OFF_HOURS:    { label: 'Off Hours',     color: 'text-muted-foreground bg-muted/40' },
};

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export function SessionClock() {
  const { activeAccountId } = useAppStore();
  const [now, setNow] = useState(new Date());

  // Tick every second
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Today's closed trades for quick P&L
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: todayTrades } = useQuery<{ rows: TradeRow[]; total: number }>({
    queryKey: ['trades-today-quick', activeAccountId, todayStart.toDateString()],
    queryFn: () =>
      window.ledger.trades.list({
        accountId: activeAccountId,
        dateFrom: todayStart.toISOString(),
        includeDeleted: false,
        includeSample: false,
        pageSize: 500,
      }),
    enabled: !!activeAccountId,
    staleTime: 1000 * 30,
  });

  // Open trade count
  const { data: openTrades } = useQuery<{ rows: TradeRow[]; total: number }>({
    queryKey: ['trades-open-count', activeAccountId],
    queryFn: () =>
      window.ledger.trades.list({
        accountId: activeAccountId,
        status: ['OPEN', 'PARTIAL'],
        includeDeleted: false,
        includeSample: false,
        pageSize: 1,
      }),
    enabled: !!activeAccountId,
    staleTime: 1000 * 10,
    refetchInterval: 30000,
  });

  const session = detectSession(now);
  const meta = SESSION_META[session] ?? SESSION_META.OFF_HOURS;

  const utcTime = formatInTimeZone(now, 'UTC', 'HH:mm:ss');
  const nyTime = formatInTimeZone(now, 'America/New_York', 'HH:mm');
  const ldnTime = formatInTimeZone(now, 'Europe/London', 'HH:mm');

  const closedToday = (todayTrades?.rows ?? []).filter((t) => t.status === 'CLOSED');
  const todayPnl = closedToday.reduce((a, t) => a + (t.netPnl ?? 0), 0);
  const openCount = openTrades?.total ?? 0;

  return (
    <div className="flex items-center gap-3 text-[10px]">
      {/* Session badge */}
      <span className={cn('rounded px-2 py-0.5 font-semibold', meta.color)}>
        {meta.label}
      </span>

      {/* Clock: UTC + NY + London */}
      <span className="tabular-nums text-muted-foreground">
        UTC <span className="font-mono text-foreground">{utcTime}</span>
      </span>
      <span className="text-border">|</span>
      <span className="tabular-nums text-muted-foreground">
        NY <span className="font-mono text-foreground">{nyTime}</span>
      </span>
      <span className="text-border">|</span>
      <span className="tabular-nums text-muted-foreground">
        LDN <span className="font-mono text-foreground">{ldnTime}</span>
      </span>

      {/* Quick stats */}
      {activeAccountId && (
        <>
          <span className="text-border">|</span>
          {openCount > 0 && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              {openCount} open
            </span>
          )}
          <span
            className={cn(
              'font-semibold tabular-nums',
              closedToday.length === 0
                ? 'text-muted-foreground/50'
                : todayPnl >= 0
                  ? 'text-emerald-400'
                  : 'text-rose-400',
            )}
          >
            {closedToday.length > 0
              ? `${todayPnl >= 0 ? '+' : ''}$${todayPnl.toFixed(2)} today`
              : 'no trades today'}
          </span>
        </>
      )}
    </div>
  );
}
