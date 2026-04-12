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
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, Camera, CameraOff, Star, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { QuickTradeSchema } from '@/lib/schemas';
import type { Account, Instrument } from '@/lib/db/schema';
import type { z } from 'zod';

type QuickForm = z.input<typeof QuickTradeSchema>;

const EMOTIONS = [
  { value: 'CALM', label: 'Calm' },
  { value: 'NEUTRAL', label: 'Neutral' },
  { value: 'ANXIOUS', label: 'Anxious' },
  { value: 'EXCITED', label: 'Excited' },
  { value: 'FRUSTRATED', label: 'Frustrated' },
  { value: 'TIRED', label: 'Tired' },
] as const;

// ─────────────────────────────────────────────────────────────
// Star rating
// ─────────────────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n === value ? 0 : n)}
          className="focus:outline-none"
        >
          <Star
            className={cn(
              'h-4 w-4 transition-colors',
              n <= (value ?? 0)
                ? 'fill-amber-400 text-amber-400'
                : 'text-muted-foreground',
            )}
          />
        </button>
      ))}
    </div>
  );
}

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

  const defaultAccountId = accounts[0]?.id ?? '';
  const symbolList = instruments.map((i) => i.symbol);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<QuickForm>({
    resolver: zodResolver(QuickTradeSchema),
    defaultValues: {
      accountId: defaultAccountId,
      direction: 'LONG',
      volumeLots: 0.01,
    },
  });

  // Update accountId when accounts load
  useEffect(() => {
    if (defaultAccountId) setValue('accountId', defaultAccountId);
  }, [defaultAccountId, setValue]);

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

  const direction = watch('direction');
  const entryPrice = watch('price');
  const stopPrice = watch('initialStopPrice');
  const symbol = watch('symbol');

  // Compute pip distance for display
  const instrument = instruments.find((i) => i.symbol === symbol?.toUpperCase());
  const pipDistance =
    entryPrice && stopPrice && instrument
      ? Math.abs(entryPrice - stopPrice) / instrument.pipSize
      : null;

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
      <form
        onSubmit={handleSubmit((v) => saveMutation.mutate(v))}
        className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3"
      >
        {/* Symbol + Direction */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="mb-0.5 block text-[10px] text-muted-foreground">Symbol</label>
            <input
              {...register('symbol')}
              ref={(e) => {
                register('symbol').ref(e);
                (symbolInputRef as React.MutableRefObject<HTMLInputElement | null>).current = e;
              }}
              list="overlay-symbols"
              placeholder="EURUSD"
              className={cn(
                'h-7 w-full rounded border bg-input px-2 text-xs uppercase focus:outline-none focus:ring-1 focus:ring-primary',
                errors.symbol ? 'border-destructive' : 'border-border',
              )}
            />
            <datalist id="overlay-symbols">
              {symbolList.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] text-muted-foreground">Dir</label>
            <div className="flex h-7 rounded border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setValue('direction', 'LONG')}
                className={cn(
                  'flex-1 px-3 text-xs font-bold transition-colors',
                  direction === 'LONG'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-muted/20 text-muted-foreground hover:text-emerald-400',
                )}
              >
                BUY
              </button>
              <button
                type="button"
                onClick={() => setValue('direction', 'SHORT')}
                className={cn(
                  'flex-1 px-3 text-xs font-bold transition-colors',
                  direction === 'SHORT'
                    ? 'bg-rose-600 text-white'
                    : 'bg-muted/20 text-muted-foreground hover:text-rose-400',
                )}
              >
                SELL
              </button>
            </div>
          </div>
        </div>

        {/* Entry price + Volume */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="mb-0.5 block text-[10px] text-muted-foreground">Entry price</label>
            <input
              {...register('price', { valueAsNumber: true })}
              type="number"
              step="any"
              placeholder="1.08500"
              className={cn(
                'h-7 w-full rounded border bg-input px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary',
                errors.price ? 'border-destructive' : 'border-border',
              )}
            />
          </div>
          <div className="w-20">
            <label className="mb-0.5 block text-[10px] text-muted-foreground">Lots</label>
            <input
              {...register('volumeLots', { valueAsNumber: true })}
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.10"
              className={cn(
                'h-7 w-full rounded border bg-input px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary',
                errors.volumeLots ? 'border-destructive' : 'border-border',
              )}
            />
          </div>
        </div>

        {/* Stop loss */}
        <div>
          <label className="mb-0.5 block text-[10px] text-muted-foreground">
            Stop loss
            {pipDistance !== null && (
              <span className="ml-2 text-muted-foreground/60">
                {pipDistance.toFixed(1)} pips
              </span>
            )}
          </label>
          <input
            {...register('initialStopPrice', { valueAsNumber: true })}
            type="number"
            step="any"
            placeholder="1.08100"
            className="h-7 w-full rounded border border-border bg-input px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Setup */}
        <div>
          <label className="mb-0.5 block text-[10px] text-muted-foreground">Setup</label>
          <input
            {...register('setupName')}
            placeholder="e.g. BOS + FVG"
            className="h-7 w-full rounded border border-border bg-input px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Confidence + Emotion */}
        <div className="flex items-start gap-4">
          <div>
            <label className="mb-1 block text-[10px] text-muted-foreground">Confidence</label>
            <StarRating
              value={watch('confidence')}
              onChange={(v) => setValue('confidence', v || undefined)}
            />
          </div>
          <div className="flex-1">
            <label className="mb-0.5 block text-[10px] text-muted-foreground">Emotion</label>
            <select
              {...register('preTradeEmotion')}
              className="h-7 w-full rounded border border-border bg-input px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">—</option>
              {EMOTIONS.map((e) => (
                <option key={e.value} value={e.value}>{e.label}</option>
              ))}
            </select>
          </div>
        </div>

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

        {/* Account selector (hidden if only one account) */}
        {accounts.length > 1 && (
          <div>
            <label className="mb-0.5 block text-[10px] text-muted-foreground">Account</label>
            <select
              {...register('accountId')}
              className="h-7 w-full rounded border border-border bg-input px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Error display */}
        {saveMutation.isError && (
          <p className="text-[10px] text-destructive">
            {saveMutation.error instanceof Error
              ? saveMutation.error.message
              : 'Save failed'}
          </p>
        )}

        {/* Save button */}
        <div className="mt-auto pt-1">
          <Button
            type="submit"
            className="w-full"
            size="sm"
            disabled={isSubmitting || saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Saving…</>
            ) : (
              'Save trade  ↵'
            )}
          </Button>
          <p className="mt-1 text-center text-[10px] text-muted-foreground">
            Tab to navigate · Enter to save · Esc to cancel
          </p>
        </div>
      </form>
    </div>
  );
}
