/**
 * Hotkey capture overlay — Milestone 10.
 *
 * 420×640 frameless always-on-top window.
 * On mount: captures foreground window screenshot, then shows quick-entry form.
 * On save: creates OPEN trade + ENTRY leg + attaches screenshot, then closes.
 * On Esc: closes without saving.
 *
 * Fields (per spec §6.6):
 *  - Symbol (combobox from instruments list)
 *  - Direction (BUY/SELL toggle)
 *  - Entry price
 *  - Stop loss (with live pip distance + risk % display)
 *  - Volume (lots)
 *  - Setup (combobox)
 *  - Confidence (1–5 stars)
 *  - Pre-trade emotion (dropdown)
 *  - One-line note (optional)
 *  - Screenshot thumbnail
 */

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { X, Camera, CameraOff, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { TradeForm } from '@/components/trade-form/TradeForm';
import { QuickTradeSchema } from '@/lib/schemas';
import type { Account, Instrument } from '@/lib/db/schema';
import type { z } from 'zod';

type QuickForm = z.input<typeof QuickTradeSchema>;

// ─────────────────────────────────────────────────────────────
// Main overlay page
// ─────────────────────────────────────────────────────────────

export function OverlayPage() {
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [screenshotPath, setScreenshotPath] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(true);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  const symbolInputRef = useRef<HTMLInputElement>(null);

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => window.ledger.accounts.list(),
  });

  const { data: instruments = [] } = useQuery<Instrument[]>({
    queryKey: ['instruments'],
    queryFn: () => window.ledger.instruments.list(),
  });

  // Capture screenshot on mount
  useEffect(() => {
    (async () => {
      try {
        const result = await window.ledger.capture.captureForegroundWindow();
        setScreenshotDataUrl((result as { dataUrl: string | null }).dataUrl);
        setScreenshotPath((result as { savedPath: string | null }).savedPath);
      } catch {
        // capture failed — overlay opens anyway
      } finally {
        setCapturing(false);
        setTimeout(() => symbolInputRef.current?.focus(), 100);
      }
    })();
  }, []);

  // Close overlay on Esc
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') window.ledger.capture.hide();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const saveMutation = useMutation({
    mutationFn: async (values: QuickForm) => {
      const now = new Date().toISOString();
      // Build CreateTradeSchema-compatible payload
      const payload = {
        accountId: values.accountId,
        symbol: values.symbol.toUpperCase(),
        direction: values.direction,
        source: 'MANUAL' as const,
        setupName: values.setupName ?? undefined,
        confidence: values.confidence ?? undefined,
        preTradeEmotion: values.preTradeEmotion ?? undefined,
        initialStopPrice: values.initialStopPrice ?? undefined,
        initialTargetPrice: values.initialTargetPrice ?? undefined,
        entryLeg: {
          timestampUtc: now,
          price: values.price,
          volumeLots: values.volumeLots,
          commission: 0,
          swap: 0,
        },
      };

      const trade = await window.ledger.trades.create(payload) as { id: string };

      // Attach screenshot if we have one
      if (screenshotPath && trade?.id) {
        try {
          await window.ledger.screenshots.saveFromPath(
            trade.id,
            'ENTRY',
            screenshotPath,
            'Captured at entry',
          );
        } catch {
          // Non-fatal — trade was saved, screenshot attachment failed
        }
      }

      // Add note if provided
      if (note.trim() && trade?.id) {
        try {
          await window.ledger.notes.create(trade.id, note.trim());
        } catch {
          // Non-fatal
        }
      }

      return trade;
    },
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => window.ledger.capture.hide(), 800);
    },
  });

  if (saved) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mb-2 text-2xl text-emerald-400">✓</div>
          <p className="text-sm font-medium text-foreground">Trade saved</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground select-none">
      {/* Drag handle / title bar */}
      <div
        className="flex h-8 shrink-0 items-center justify-between px-3"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-xs font-semibold tracking-wide text-muted-foreground">
          Quick Entry
        </span>
        <button
          type="button"
          onClick={() => window.ledger.capture.hide()}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Screenshot thumbnail */}
      <div className="mx-3 mb-2 h-24 shrink-0 overflow-hidden rounded-md border border-border bg-muted/20">
        {capturing ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Capturing…
          </div>
        ) : screenshotDataUrl ? (
          <img
            src={screenshotDataUrl}
            alt="Screenshot"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
            <CameraOff className="h-4 w-4" />
            No screenshot — paste with Win+Shift+S
          </div>
        )}
      </div>

      {/* Form */}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3">
        <TradeForm
          mode="quick"
          customSubmitHandler={async (data) => {
            await saveMutation.mutateAsync(data as QuickForm);
          }}
          onSuccess={() => {
            setSaved(true);
            setTimeout(() => window.ledger.capture.hide(), 800);
          }}
          onCancel={() => window.ledger.capture.hide()}
        />
        {/* Note */}
        <div>
          <label className="mb-0.5 block text-[10px] text-muted-foreground">Note</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional one-line note"
            className="h-7 w-full rounded border border-border bg-input px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Error display */}
        {saveMutation.isError && (
          <p className="text-[10px] text-destructive">
            {saveMutation.error instanceof Error
              ? saveMutation.error.message
              : 'Save failed'}
          </p>
        )}
      </div>
    </div>
  );
}
