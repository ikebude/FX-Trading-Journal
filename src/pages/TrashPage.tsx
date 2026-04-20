/**
 * TrashPage — Milestone 17
 *
 * Shows soft-deleted trades. Supports:
 *  - Restore selected trades (moves back to active blotter)
 *  - Permanently delete selected trades (hard delete — irreversible)
 *  - Select all / clear selection
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatCurrency, formatDate, formatPips, pnlClass } from '@/lib/format';
import { useAppStore } from '@/stores/app-store';
import type { TradeRow } from '@/lib/db/queries';

export function TrashPage() {
  const { activeAccountId, displayTimezone } = useAppStore();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, isLoading } = useQuery<{ rows: TradeRow[]; total: number }>({
    queryKey: ['trades-trash', activeAccountId],
    queryFn: () =>
      window.ledger.trades.list({
        accountId: activeAccountId, // null means all accounts
        includeDeleted: true,
        deletedOnly: true,
        includeSample: false,
        pageSize: 500,
        sortBy: 'opened_at_utc',
        sortDir: 'desc',
      }),
    enabled: true, // Always enabled - can show deleted trades from all accounts
  });

  const rows = data?.rows ?? [];

  const restoreMutation = useMutation({
    mutationFn: (ids: string[]) => window.ledger.trades.restore(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades-trash'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      setSelected(new Set());
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => window.ledger.trades.permanentlyDelete(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades-trash'] });
      setSelected(new Set());
      setConfirmDelete(false);
    },
  });

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.id)));
    }
  }

  const selectedIds = Array.from(selected);
  const hasSelection = selectedIds.length > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-2">
        <Trash2 className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Trash</span>
        <span className="text-xs text-muted-foreground">({rows.length} deleted trades)</span>

        <div className="ml-auto flex items-center gap-2">
          {hasSelection && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => restoreMutation.mutate(selectedIds)}
                disabled={restoreMutation.isPending}
              >
                <RotateCcw className="h-3 w-3" />
                Restore ({selectedIds.length})
              </Button>

              {!confirmDelete ? (
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-3 w-3" />
                  Delete Permanently ({selectedIds.length})
                </Button>
              ) : (
                <div className="flex items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-950/40 px-2 py-1">
                  <AlertTriangle className="h-3 w-3 text-rose-400" />
                  <span className="text-xs text-rose-400">Irreversible!</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => deleteMutation.mutate(selectedIds)}
                    disabled={deleteMutation.isPending}
                  >
                    Confirm
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <Trash2 className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Trash is empty</p>
          <p className="text-xs text-muted-foreground/60">
            Deleted trades appear here before being permanently removed.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Column headers */}
          <div className="flex shrink-0 items-center border-b border-border bg-card/50 px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <div className="mr-3 flex w-5 items-center">
              <input
                type="checkbox"
                checked={selected.size === rows.length && rows.length > 0}
                onChange={toggleAll}
                className="h-3.5 w-3.5 cursor-pointer accent-primary"
              />
            </div>
            <span className="w-14">Dir</span>
            <span className="w-20">Symbol</span>
            <span className="flex-1">Open</span>
            <span className="w-24">Pips</span>
            <span className="w-24">P&L</span>
            <span className="w-24">Deleted</span>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto">
            {rows.map((trade) => (
              <div
                key={trade.id}
                onClick={() => toggleRow(trade.id)}
                className={cn(
                  'flex cursor-pointer items-center border-b border-border/50 px-3 py-2 text-xs transition-colors hover:bg-muted/30',
                  selected.has(trade.id) && 'bg-muted/20',
                )}
              >
                <div className="mr-3 flex w-5 items-center">
                  <input
                    type="checkbox"
                    checked={selected.has(trade.id)}
                    onChange={() => toggleRow(trade.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-3.5 w-3.5 cursor-pointer accent-primary"
                  />
                </div>
                <span
                  className={cn(
                    'mr-2 w-12 rounded px-1.5 py-0.5 text-center text-[10px] font-semibold',
                    trade.direction === 'LONG'
                      ? 'bg-emerald-950 text-emerald-400'
                      : 'bg-rose-950 text-rose-400',
                  )}
                >
                  {trade.direction}
                </span>
                <span className="w-20 font-mono font-semibold text-foreground">
                  {trade.symbol}
                </span>
                <span className="flex-1 text-muted-foreground">
                  {formatDate(trade.openedAtUtc, displayTimezone)}
                </span>
                <span className={cn('w-24 tabular-nums', pnlClass(trade.netPips))}>
                  {formatPips(trade.netPips)}
                </span>
                <span className={cn('w-24 font-semibold tabular-nums', pnlClass(trade.netPnl))}>
                  {formatCurrency(trade.netPnl)}
                </span>
                <span className="w-24 text-muted-foreground/60">
                  {formatDate(trade.deletedAtUtc ?? null, displayTimezone)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
