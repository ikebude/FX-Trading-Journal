/**
 * Trade detail drawer — slides in from the right when a blotter row is clicked.
 *
 * Contents (tabbed):
 *  - Overview: stat bar + edit form
 *  - Fills:    legs table
 *  - Notes:    timestamped reflection timeline
 *  - Media:    screenshot gallery
 *  - History:  audit log
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Trash2, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/cn';
import { useAppStore } from '@/stores/app-store';
import { TradeStatBar } from './TradeStatBar';
import { LegsTable } from './LegsTable';
import { NotesTimeline } from './NotesTimeline';
import { ScreenshotGallery } from './ScreenshotGallery';
import { AuditLog } from './AuditLog';
import { TradeForm } from '@/components/trade-form/TradeForm';
import type { TradeDetail } from '@/lib/db/queries';
import type { Trade } from '@/lib/db/schema';

export function TradeDetailDrawer() {
  const { detailTradeId, setDetailTradeId } = useAppStore();
  const queryClient = useQueryClient();
  const isOpen = !!detailTradeId;

  // Keyboard ESC to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDetailTradeId(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setDetailTradeId]);

  const { data: trade, isLoading } = useQuery<TradeDetail>({
    queryKey: ['trade', detailTradeId],
    queryFn: () => window.ledger.trades.get(detailTradeId!),
    enabled: !!detailTradeId,
  });

  async function handleSoftDelete() {
    if (!detailTradeId) return;
    await window.ledger.trades.softDelete([detailTradeId]);
    queryClient.invalidateQueries({ queryKey: ['trades'] });
    queryClient.invalidateQueries({ queryKey: ['trade', detailTradeId] });
  }

  async function handleRestore() {
    if (!detailTradeId) return;
    await window.ledger.trades.restore([detailTradeId]);
    queryClient.invalidateQueries({ queryKey: ['trades'] });
    queryClient.invalidateQueries({ queryKey: ['trade', detailTradeId] });
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setDetailTradeId(null)}
        />
      )}

      {/* Drawer */}
      <aside
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col border-l border-border bg-background shadow-2xl transition-transform duration-200',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Drawer header */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <span className="text-sm font-semibold text-foreground">Trade Detail</span>
          <div className="flex items-center gap-1">
            {trade && (
              trade.deletedAtUtc ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs text-yellow-400 border-yellow-400/30"
                  onClick={handleRestore}
                >
                  <RotateCcw className="h-3 w-3" />
                  Restore
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs text-muted-foreground hover:text-destructive"
                  onClick={handleSoftDelete}
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </Button>
              )
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setDetailTradeId(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        {isLoading || !trade ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {isLoading ? 'Loading…' : 'Select a trade from the blotter.'}
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            <TradeStatBar trade={trade} />

            <Tabs defaultValue="overview" className="flex flex-1 flex-col overflow-hidden">
              <TabsList className="mx-4 mt-3 self-start shrink-0">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="fills">Fills</TabsTrigger>
                <TabsTrigger value="notes">
                  Notes
                  {trade.notes.length > 0 && (
                    <span className="ml-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] text-primary">
                      {trade.notes.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="media">
                  Media
                  {trade.screenshotList.length > 0 && (
                    <span className="ml-1 rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] text-primary">
                      {trade.screenshotList.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="flex-1 overflow-y-auto px-4 pb-4 pt-2">
                <TradeForm
                  mode="full"
                  existingTrade={trade as unknown as Trade}
                  onSuccess={() => {
                    // Invalidate both the single-trade detail and the blotter list so
                    // edits made in the drawer are immediately reflected in both views.
                    queryClient.invalidateQueries({ queryKey: ['trade', detailTradeId] });
                    queryClient.invalidateQueries({ queryKey: ['trades'] });
                    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
                  }}
                />
              </TabsContent>

              <TabsContent value="fills" className="flex-1 overflow-y-auto px-4 pb-4 pt-2">
                <LegsTable tradeId={trade.id} legs={trade.legs} />
              </TabsContent>

              <TabsContent value="notes" className="flex-1 overflow-y-auto px-4 pb-4 pt-2">
                <NotesTimeline tradeId={trade.id} notes={trade.notes} />
              </TabsContent>

              <TabsContent value="media" className="flex-1 overflow-y-auto px-4 pb-4 pt-2">
                <ScreenshotGallery tradeId={trade.id} screenshots={trade.screenshotList} />
              </TabsContent>

              <TabsContent value="history" className="flex-1 overflow-y-auto px-4 pb-4 pt-2">
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Audit History</h3>
                  <AuditLog tradeId={trade.id} />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </aside>
    </>
  );
}
