/**
 * Blotter — main trade list view.
 *
 * Layout:
 *  [Filter panel (collapsible)] | [Virtualized table]
 *
 * Data: TanStack Query → window.ledger.trades.list()
 * Pagination: server-side, 100 rows/page
 */

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SlidersHorizontal, ChevronLeft, ChevronRight, Search, X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BlotterFilters } from '@/components/blotter/BlotterFilters';
import { BlotterTable } from '@/components/blotter/BlotterTable';
import { cn } from '@/lib/cn';
import { useAppStore } from '@/stores/app-store';
import type { TradeFilters } from '@/lib/schemas';
import type { TradeRow } from '@/lib/db/queries';

const DEFAULT_FILTERS: Partial<TradeFilters> = {
  sortBy: 'opened_at_utc',
  sortDir: 'desc',
};

export function BlotterPage() {
  const qc = useQueryClient();
  const { activeAccountId, filterPanelOpen, toggleFilterPanel } = useAppStore();
  const [filters, setFilters] = useState<Partial<TradeFilters>>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PAGE_SIZE = 100;

  // Debounce search input by 300 ms
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery]);

  const isSearching = debouncedSearch.length > 0;

  const queryFilters: Partial<TradeFilters> = {
    ...filters,
    accountId: activeAccountId ?? undefined,
    page,
    pageSize: PAGE_SIZE,
    includeDeleted: false,
    includeSample: false,
  };

  const { data, isLoading } = useQuery<{ rows: TradeRow[]; total: number }>({
    queryKey: ['trades', queryFilters],
    queryFn: () => window.ledger.trades.list(queryFilters),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    enabled: !isSearching,
  });

  const { data: searchData, isLoading: searchLoading } = useQuery<{ rows: TradeRow[]; total: number }>({
    queryKey: ['trades-search', debouncedSearch],
    queryFn: () => window.ledger.trades.search(debouncedSearch) as Promise<{ rows: TradeRow[]; total: number }>,
    staleTime: 10_000,
    enabled: isSearching,
  });

  const rows = isSearching ? (searchData?.rows ?? []) : (data?.rows ?? []);
  const total = isSearching ? (searchData?.total ?? 0) : (data?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const loading = isSearching ? searchLoading : isLoading;

  const softDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => window.ledger.trades.softDelete(ids),
    onSuccess: () => {
      setSelectedIds([]);
      qc.invalidateQueries({ queryKey: ['trades'] });
    },
  });

  function handleFilterChange(patch: Partial<TradeFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }

  function handleFilterReset() {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }

  function clearSearch() {
    setSearchQuery('');
    setDebouncedSearch('');
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Bulk action bar — visible only when rows are selected */}
      {selectedIds.length > 0 && (
        <div className="flex h-10 shrink-0 items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4">
          <span className="text-xs font-medium text-amber-400">
            {selectedIds.length} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-rose-400 hover:text-rose-300"
              onClick={() => {
                if (confirm(`Move ${selectedIds.length} trade(s) to Trash?`)) {
                  softDeleteMutation.mutate(selectedIds);
                }
              }}
              disabled={softDeleteMutation.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Move to Trash
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => setSelectedIds([])}
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Filter panel */}
        {filterPanelOpen && !isSearching && (
          <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-border bg-card">
            <BlotterFilters
              filters={filters}
              onChange={handleFilterChange}
              onReset={handleFilterReset}
            />
          </aside>
        )}

        {/* Main area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Blotter toolbar */}
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
            {!isSearching && (
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-7 w-7', filterPanelOpen && 'bg-accent')}
                onClick={toggleFilterPanel}
                title="Toggle filters"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </Button>
            )}

            {/* Search input */}
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search trades…"
                className="h-7 w-48 rounded-md border border-border bg-background pl-7 pr-6 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-1.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {isSearching && (
              <span className="text-xs text-amber-400">
                {total} result{total !== 1 ? 's' : ''} for &ldquo;{debouncedSearch}&rdquo;
              </span>
            )}

            <span className="ml-auto text-xs text-muted-foreground">
              {!isSearching && `${total} trade${total !== 1 ? 's' : ''}`}
            </span>

            {/* Pagination — hidden during search (search returns up to 100 results flat) */}
            {!isSearching && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="min-w-[4rem] text-center text-xs text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>

          <BlotterTable
            rows={rows}
            isLoading={loading}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
          />
        </div>
      </div>
    </div>
  );
}
