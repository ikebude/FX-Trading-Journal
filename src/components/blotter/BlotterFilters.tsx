/**
 * Blotter filter panel — collapsed/expanded toggle.
 * Filters are passed up to the parent as a partial TradeFilters object.
 */

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/cn';
import type { TradeFilters } from '@/lib/schemas';

type FilterPatch = Partial<
  Pick<
    TradeFilters,
    | 'status'
    | 'direction'
    | 'symbol'
    | 'setupName'
    | 'marketCondition'
    | 'dateFrom'
    | 'dateTo'
    | 'sortBy'
    | 'sortDir'
  >
>;

interface BlotterFiltersProps {
  filters: FilterPatch;
  onChange: (patch: FilterPatch) => void;
  onReset: () => void;
  className?: string;
}

export function BlotterFilters({ filters, onChange, onReset, className }: BlotterFiltersProps) {
  const STATUS_OPTIONS = ['OPEN', 'PARTIAL', 'CLOSED', 'CANCELLED'] as const;
  const SORT_OPTIONS = [
    { value: 'opened_at_utc', label: 'Open time' },
    { value: 'closed_at_utc', label: 'Close time' },
    { value: 'net_pnl', label: 'P&L' },
    { value: 'r_multiple', label: 'R-multiple' },
    { value: 'symbol', label: 'Symbol' },
  ] as const;

  const activeStatusSet = new Set(filters.status ?? []);

  function toggleStatus(s: (typeof STATUS_OPTIONS)[number]) {
    const next = new Set(activeStatusSet);
    if (next.has(s)) { next.delete(s); } else { next.add(s); }
    onChange({ status: next.size ? ([...next] as TradeFilters['status']) : undefined });
  }

  return (
    <div className={cn('flex flex-col gap-4 p-4 text-sm', className)}>
      {/* Status chips */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Status</Label>
        <div className="flex flex-wrap gap-1">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                activeStatusSet.has(s)
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground',
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Direction */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Direction</Label>
        <div className="flex gap-1">
          {(['LONG', 'SHORT'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onChange({ direction: filters.direction === d ? undefined : d })}
              className={cn(
                'flex-1 rounded-md border py-1 text-xs font-medium transition-colors',
                filters.direction === d
                  ? d === 'LONG'
                    ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                    : 'border-orange-500 bg-orange-500/10 text-orange-400'
                  : 'border-border text-muted-foreground',
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Symbol */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Symbol</Label>
        <Input
          value={filters.symbol ?? ''}
          onChange={(e) => onChange({ symbol: e.target.value.toUpperCase() || undefined })}
          placeholder="EURUSD"
          className="h-8 text-xs uppercase"
        />
      </div>

      {/* Setup */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Setup</Label>
        <Input
          value={filters.setupName ?? ''}
          onChange={(e) => onChange({ setupName: e.target.value || undefined })}
          placeholder="e.g. BOS retest"
          className="h-8 text-xs"
        />
      </div>

      {/* Date range */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Date from</Label>
        <Input
          type="date"
          value={filters.dateFrom?.slice(0, 10) ?? ''}
          onChange={(e) =>
            onChange({ dateFrom: e.target.value ? `${e.target.value}T00:00:00.000Z` : undefined })
          }
          className="h-8 text-xs"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Date to</Label>
        <Input
          type="date"
          value={filters.dateTo?.slice(0, 10) ?? ''}
          onChange={(e) =>
            onChange({ dateTo: e.target.value ? `${e.target.value}T23:59:59.999Z` : undefined })
          }
          className="h-8 text-xs"
        />
      </div>

      {/* Sort */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Sort by</Label>
        <Select
          value={filters.sortBy ?? 'opened_at_utc'}
          onValueChange={(v) => onChange({ sortBy: v as TradeFilters['sortBy'] })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-1">
          {(['asc', 'desc'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onChange({ sortDir: d })}
              className={cn(
                'flex-1 rounded-md border py-1 text-xs transition-colors',
                filters.sortDir === d
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground',
              )}
            >
              {d === 'asc' ? 'Oldest first' : 'Newest first'}
            </button>
          ))}
        </div>
      </div>

      <Button variant="ghost" size="sm" onClick={onReset} className="mt-auto text-xs">
        Reset filters
      </Button>
    </div>
  );
}
