/**
 * Virtualized blotter table — TanStack Table + @tanstack/react-virtual.
 *
 * Renders a fixed-height scrollable list of trade rows.
 * Clicking a row sets detailTradeId in the app store (opens detail drawer).
 */

import { useRef, useMemo } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/badge';
import { MetricTooltip } from '@/components/help/MetricTooltip';
import { formatCurrency, formatDate, formatPips, formatR, formatLots, pnlClass } from '@/lib/format';
import { useAppStore } from '@/stores/app-store';
import type { TradeRow } from '@/lib/db/queries';

// Re-export the type for callers
export type { TradeRow };

const ROW_HEIGHT = 40; // px

interface BlotterTableProps {
  rows: TradeRow[];
  isLoading: boolean;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function BlotterTable({ rows, isLoading, selectedIds, onSelectionChange }: BlotterTableProps) {
  const { displayTimezone, setDetailTradeId } = useAppStore();
  const parentRef = useRef<HTMLDivElement>(null);

  // Convert selectedIds array ↔ TanStack Table RowSelectionState (keyed by row index)
  // We use trade ID as the row ID for stable selection across re-renders.
  const rowSelection: RowSelectionState = useMemo(() => {
    const set = new Set(selectedIds);
    return Object.fromEntries(rows.map((r) => [r.id, set.has(r.id)]));
  }, [selectedIds, rows]);

  function handleRowSelectionChange(updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) {
    const next = typeof updater === 'function' ? updater(rowSelection) : updater;
    const selected = rows.filter((r) => next[r.id]).map((r) => r.id);
    onSelectionChange(selected);
  }

  const columns: ColumnDef<TradeRow>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllRowsSelected()}
          ref={(el) => { if (el) el.indeterminate = table.getIsSomeRowsSelected(); }}
          onChange={table.getToggleAllRowsSelectedHandler()}
          onClick={(e) => e.stopPropagation()}
          className="h-3.5 w-3.5 accent-primary"
        />
      ),
      size: 40,
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          onClick={(e) => e.stopPropagation()}
          className="h-3.5 w-3.5 accent-primary"
        />
      ),
    },
    {
      id: 'direction',
      header: '',
      size: 56,
      cell: ({ row }) => (
        <Badge variant={row.original.direction === 'LONG' ? 'long' : 'short'} className="w-12 justify-center text-[10px]">
          {row.original.direction}
        </Badge>
      ),
    },
    {
      accessorKey: 'symbol',
      header: 'Symbol',
      size: 80,
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-foreground">
          {row.original.symbol}
        </span>
      ),
    },
    {
      accessorKey: 'openedAtUtc',
      header: 'Open',
      size: 110,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDate(row.original.openedAtUtc, displayTimezone)}
        </span>
      ),
    },
    {
      accessorKey: 'closedAtUtc',
      header: 'Close',
      size: 110,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDate(row.original.closedAtUtc, displayTimezone)}
        </span>
      ),
    },
    {
      accessorKey: 'totalEntryVolume',
      header: 'Lots',
      size: 64,
      cell: ({ row }) => (
        <span className="text-xs tabular-nums">{formatLots(row.original.totalEntryVolume)}</span>
      ),
    },
    {
      accessorKey: 'netPips',
      header: () => <MetricTooltip metric="Pip / Pip Size">Pips</MetricTooltip>,
      size: 72,
      cell: ({ row }) => (
        <span className={cn('text-xs tabular-nums', pnlClass(row.original.netPips))}>
          {formatPips(row.original.netPips)}
        </span>
      ),
    },
    {
      accessorKey: 'netPnl',
      header: () => <MetricTooltip metric="Profit Factor">P&L</MetricTooltip>,
      size: 88,
      cell: ({ row }) => (
        <span className={cn('text-xs font-semibold tabular-nums', pnlClass(row.original.netPnl))}>
          {formatCurrency(row.original.netPnl)}
        </span>
      ),
    },
    {
      accessorKey: 'rMultiple',
      header: () => <MetricTooltip metric="R-multiple">R</MetricTooltip>,
      size: 64,
      cell: ({ row }) => (
        <span className={cn('text-xs tabular-nums', pnlClass(row.original.rMultiple))}>
          {formatR(row.original.rMultiple)}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 104,
      cell: ({ row }) => {
        const s = row.original.status;
        const isLive =
          row.original.source === 'LIVE_BRIDGE' && s === 'OPEN';
        const variant =
          s === 'CLOSED'
            ? (row.original.netPnl ?? 0) >= 0
              ? 'win'
              : 'loss'
            : s === 'OPEN' || s === 'PARTIAL'
              ? 'secondary'
              : 'outline';
        return (
          <span className="flex items-center gap-1">
            <Badge variant={variant} className="text-[10px]">
              {s}
            </Badge>
            {isLive && (
              <span className="flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-400">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                LIVE
              </span>
            )}
          </span>
        );
      },
    },
    {
      accessorKey: 'setupName',
      header: 'Setup',
      size: 120,
      cell: ({ row }) => (
        <span className="max-w-[120px] truncate text-xs text-muted-foreground">
          {row.original.setupName ?? '—'}
        </span>
      ),
    },
  ];

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    enableRowSelection: true,
    state: { rowSelection },
    onRowSelectionChange: handleRowSelectionChange,
  });

  const { rows: tableRows } = table.getRowModel();

  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading trades…
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm">
        <p className="text-muted-foreground">No trades yet.</p>
        <p className="text-xs text-muted-foreground/60">
          Click <span className="text-foreground">New Trade</span> to add your first entry.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 border-b border-border bg-card">
        {table.getHeaderGroups().map((hg) => (
          <div key={hg.id} className="flex w-full">
            {hg.headers.map((header) => (
              <div
                key={header.id}
                className="flex items-center px-3 py-2 text-xs font-medium text-muted-foreground"
                style={{ width: header.getSize() }}
              >
                {flexRender(header.column.columnDef.header, header.getContext())}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Virtual scroll body */}
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        <div
          style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
        >
          {virtualItems.map((vItem) => {
            const row = tableRows[vItem.index];
            return (
              <div
                key={row.id}
                data-index={vItem.index}
                ref={virtualizer.measureElement}
                className={cn(
                  'absolute left-0 right-0 flex cursor-pointer items-center border-b border-border/50 transition-colors hover:bg-accent/50',
                  row.original.deletedAtUtc ? 'opacity-50' : '',
                )}
                style={{ top: `${vItem.start}px`, height: `${ROW_HEIGHT}px` }}
                onClick={() => setDetailTradeId(row.original.id)}
              >
                {row.getVisibleCells().map((cell) => (
                  <div
                    key={cell.id}
                    className="flex items-center overflow-hidden px-3"
                    style={{ width: cell.column.getSize() }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
