/**
 * Horizontal stat bar shown at the top of the trade detail panel.
 * Displays the key metrics: P&L, pips, R, direction, status.
 */

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import {
  formatCurrency,
  formatPips,
  formatR,
  formatLots,
  formatDatetime,
  tradeDurationMins,
  pnlClass,
} from '@/lib/format';
import { useAppStore } from '@/stores/app-store';
import type { TradeDetail } from '@/lib/db/queries';

interface TradeStatBarProps {
  trade: TradeDetail;
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={cn('text-sm font-semibold tabular-nums', className)}>{value}</span>
    </div>
  );
}

export function TradeStatBar({ trade }: TradeStatBarProps) {
  const { displayTimezone } = useAppStore();

  const directionVariant = trade.direction === 'LONG' ? 'long' : 'short';
  const statusVariant =
    trade.status === 'CLOSED'
      ? (trade.netPnl ?? 0) >= 0
        ? 'win'
        : 'loss'
      : trade.status === 'OPEN' || trade.status === 'PARTIAL'
        ? 'secondary'
        : 'outline';

  return (
    <div className="flex flex-wrap items-start gap-x-6 gap-y-3 border-b border-border bg-card px-5 py-4">
      {/* Symbol + badges */}
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-xl font-bold tracking-tight text-foreground">
          {trade.symbol}
        </span>
        <div className="flex items-center gap-1.5">
          <Badge variant={directionVariant} className="text-[10px]">
            {trade.direction}
          </Badge>
          <Badge variant={statusVariant} className="text-[10px]">
            {trade.status}
          </Badge>
          {trade.setupName && (
            <Badge variant="outline" className="text-[10px]">
              {trade.setupName}
            </Badge>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="h-10 w-px bg-border" />

      {/* P&L */}
      <Stat
        label="Net P&L"
        value={formatCurrency(trade.netPnl)}
        className={pnlClass(trade.netPnl)}
      />
      <Stat
        label="Pips"
        value={formatPips(trade.netPips)}
        className={pnlClass(trade.netPips)}
      />
      <Stat
        label="R-multiple"
        value={formatR(trade.rMultiple)}
        className={pnlClass(trade.rMultiple)}
      />

      <div className="h-10 w-px bg-border" />

      {/* Volume / timing */}
      <Stat label="Volume" value={`${formatLots(trade.totalEntryVolume)} lots`} />
      <Stat
        label="Opened"
        value={formatDatetime(trade.openedAtUtc, displayTimezone, 'dd MMM HH:mm')}
      />
      {trade.closedAtUtc && (
        <>
          <Stat
            label="Closed"
            value={formatDatetime(trade.closedAtUtc, displayTimezone, 'dd MMM HH:mm')}
          />
          <Stat
            label="Duration"
            value={tradeDurationMins(trade.openedAtUtc, trade.closedAtUtc)}
          />
        </>
      )}

      {/* Avg entry / exit */}
      {trade.weightedAvgEntry != null && (
        <Stat label="Avg Entry" value={trade.weightedAvgEntry.toFixed(5)} />
      )}
      {trade.weightedAvgExit != null && (
        <Stat label="Avg Exit" value={trade.weightedAvgExit.toFixed(5)} />
      )}
    </div>
  );
}
