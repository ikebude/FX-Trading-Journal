/**
 * <TradeForm> — reused for manual entry, hotkey overlay, and trade editing.
 *
 * mode="full"  — Mode A: all fields, used in blotter new-trade dialog and detail page.
 * mode="quick" — Mode B: minimal fields, used in the hotkey overlay (420×640).
 *
 * On submit, calls window.ledger.trades.create (new) or trades.update (edit).
 * After success, invalidates the 'trades' query so the blotter refreshes.
 */

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useAppStore } from '@/stores/app-store';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/cn';
import { CreateTradeSchema, QuickTradeSchema } from '@/lib/schemas';
import type { Account, Instrument, Trade } from '@/lib/db/schema';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

// Use z.input so optional fields with defaults remain optional in the form values
type FullFormValues = z.input<typeof CreateTradeSchema>;
type QuickFormValues = z.input<typeof QuickTradeSchema>;

interface TradeFormProps {
  /** 'full' = Mode A (all fields), 'quick' = Mode B (minimal) */
  mode?: 'full' | 'quick';
  /** If provided, we're editing an existing trade (patch mode). */
  existingTrade?: Trade;
  /** Called after a successful save. */
  onSuccess?: () => void;
  /** Called when the user cancels. */
  onCancel?: () => void;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function nowLocalIso(): string {
  // Returns "YYYY-MM-DDTHH:MM" formatted for <input type="datetime-local">
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToUtc(localIso: string): string {
  // Convert "YYYY-MM-DDTHH:MM" (browser local) to UTC ISO-8601
  return new Date(localIso).toISOString();
}

// ─────────────────────────────────────────────────────────────
// Field row wrapper
// ─────────────────────────────────────────────────────────────

function Field({
  label,
  error,
  children,
  className,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Star confidence selector (1–5)
// ─────────────────────────────────────────────────────────────

function ConfidenceStars({
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
          onClick={() => onChange(n)}
          className={cn(
            'h-6 w-6 rounded text-lg leading-none transition-colors',
            (value ?? 0) >= n ? 'text-yellow-400' : 'text-muted-foreground/30',
          )}
        >
          ★
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Quick form (Mode B)
// ─────────────────────────────────────────────────────────────

function QuickForm({
  accounts,
  instruments,
  onSuccess,
  onCancel,
}: {
  accounts: Account[];
  instruments: Instrument[];
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingLotSize = useAppStore((s) => s.pendingLotSize);
  const setPendingLotSize = useAppStore((s) => s.setPendingLotSize);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<QuickFormValues>({
    resolver: zodResolver(QuickTradeSchema),
    defaultValues: {
      direction: 'LONG',
      ...(pendingLotSize != null ? { volumeLots: pendingLotSize } : {}),
    },
  });

  // Consume the pending lot size once
  useEffect(() => {
    if (pendingLotSize != null) {
      setPendingLotSize(null);
    }
  }, []); // intentional: run once on mount only

  const direction = watch('direction');
  const confidence = watch('confidence');

  async function onSubmit(data: QuickFormValues) {
    setSaving(true);
    setError(null);
    try {
      await window.ledger.trades.create({
        ...data,
        entryLeg: {
          timestampUtc: new Date().toISOString(),
          price: data.price,
          volumeLots: data.volumeLots,
          commission: 0,
          swap: 0,
        },
        source: 'HOTKEY',
      });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3 p-4">
      {/* Account */}
      <Field label="Account" error={errors.accountId?.message}>
        <Select onValueChange={(v) => setValue('accountId', v)}>
          <SelectTrigger>
            <SelectValue placeholder="Select account…" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {/* Symbol + Direction */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Symbol" error={errors.symbol?.message}>
          <Input
            {...register('symbol')}
            placeholder="EURUSD"
            className="uppercase"
            autoComplete="off"
          />
        </Field>
        <Field label="Direction">
          <div className="flex gap-1">
            {(['LONG', 'SHORT'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setValue('direction', d)}
                className={cn(
                  'flex-1 rounded-md border py-1.5 text-xs font-semibold transition-colors',
                  direction === d
                    ? d === 'LONG'
                      ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                      : 'border-orange-500 bg-orange-500/20 text-orange-400'
                    : 'border-border text-muted-foreground hover:border-border/80',
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </Field>
      </div>

      {/* Price + Volume */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Entry Price" error={errors.price?.message}>
          <Input
            {...register('price', { valueAsNumber: true })}
            type="number"
            step="any"
            placeholder="1.08500"
          />
        </Field>
        <Field label="Volume (lots)" error={errors.volumeLots?.message}>
          <Input
            {...register('volumeLots', { valueAsNumber: true })}
            type="number"
            step="0.01"
            placeholder="0.10"
          />
        </Field>
      </div>

      {/* Stop loss */}
      <Field label="Stop Loss (optional)">
        <Input
          {...register('initialStopPrice', { valueAsNumber: true })}
          type="number"
          step="any"
          placeholder="1.08200"
        />
      </Field>

      {/* Setup + Confidence */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Setup">
          <Input {...register('setupName')} placeholder="e.g. BOS retest" />
        </Field>
        <Field label="Confidence">
          <ConfidenceStars
            value={confidence}
            onChange={(v) => setValue('confidence', v)}
          />
        </Field>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" className="flex-1" disabled={saving}>
          {saving ? 'Saving…' : 'Log Trade'}
        </Button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// Full form (Mode A)
// ─────────────────────────────────────────────────────────────

function FullForm({
  accounts,
  instruments,
  existingTrade,
  onSuccess,
  onCancel,
}: {
  accounts: Account[];
  instruments: Instrument[];
  existingTrade?: Trade;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!existingTrade;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FullFormValues>({
    resolver: zodResolver(CreateTradeSchema),
    defaultValues: existingTrade
      ? {
          accountId: existingTrade.accountId,
          symbol: existingTrade.symbol,
          direction: existingTrade.direction,
          initialStopPrice: existingTrade.initialStopPrice ?? undefined,
          initialTargetPrice: existingTrade.initialTargetPrice ?? undefined,
          plannedRiskPct: existingTrade.plannedRiskPct ?? undefined,
          setupName: existingTrade.setupName ?? undefined,
          marketCondition: existingTrade.marketCondition ?? undefined,
          entryModel: existingTrade.entryModel ?? undefined,
          confidence: existingTrade.confidence ?? undefined,
          preTradeEmotion: existingTrade.preTradeEmotion ?? undefined,
          postTradeEmotion: existingTrade.postTradeEmotion ?? undefined,
          source: 'MANUAL',
        }
      : {
          direction: 'LONG',
          source: 'MANUAL',
        },
  });

  const direction = watch('direction');
  const confidence = watch('confidence');
  const preEmotion = watch('preTradeEmotion');
  const postEmotion = watch('postTradeEmotion');

  async function onSubmit(data: FullFormValues) {
    setSaving(true);
    setError(null);
    try {
      if (isEdit && existingTrade) {
        await window.ledger.trades.update(existingTrade.id, {
          symbol: data.symbol.toUpperCase(),
          direction: data.direction,
          initialStopPrice: data.initialStopPrice,
          initialTargetPrice: data.initialTargetPrice,
          plannedRr: data.plannedRr,
          plannedRiskAmount: data.plannedRiskAmount,
          plannedRiskPct: data.plannedRiskPct,
          setupName: data.setupName,
          marketCondition: data.marketCondition,
          entryModel: data.entryModel,
          confidence: data.confidence,
          preTradeEmotion: data.preTradeEmotion,
          postTradeEmotion: data.postTradeEmotion,
        });
      } else {
        await window.ledger.trades.create(data);
      }
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const EMOTIONS_PRE = ['CALM', 'NEUTRAL', 'ANXIOUS', 'EXCITED', 'FRUSTRATED', 'TIRED'] as const;
  const EMOTIONS_POST = ['SATISFIED', 'RELIEVED', 'DISAPPOINTED', 'FRUSTRATED', 'INDIFFERENT'] as const;
  const MARKET_CONDITIONS = ['TRENDING', 'RANGING', 'NEWS_VOLATILITY'] as const;
  const ENTRY_MODELS = ['LIMIT', 'MARKET', 'STOP_ENTRY', 'ON_RETEST'] as const;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-0 overflow-hidden">
      <Tabs defaultValue="basic" className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="mx-4 mt-4 self-start">
          <TabsTrigger value="basic">Basic</TabsTrigger>
          <TabsTrigger value="plan">Plan</TabsTrigger>
          <TabsTrigger value="context">Context</TabsTrigger>
        </TabsList>

        {/* ── Basic tab ── */}
        <TabsContent value="basic" className="flex flex-col gap-4 overflow-y-auto p-4">
          {/* Account (hidden in edit mode) */}
          {!isEdit && (
            <Field label="Account *" error={errors.accountId?.message}>
              <Select onValueChange={(v) => setValue('accountId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account…" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          {/* Symbol + Direction */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Symbol *" error={errors.symbol?.message}>
              <Input
                {...register('symbol')}
                placeholder="EURUSD"
                className="uppercase"
                autoComplete="off"
              />
            </Field>
            <Field label="Direction *" error={errors.direction?.message}>
              <div className="flex gap-1">
                {(['LONG', 'SHORT'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setValue('direction', d)}
                    className={cn(
                      'flex-1 rounded-md border py-1.5 text-xs font-semibold transition-colors',
                      direction === d
                        ? d === 'LONG'
                          ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                          : 'border-orange-500 bg-orange-500/20 text-orange-400'
                        : 'border-border text-muted-foreground hover:border-border/80',
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {/* Entry leg (new trade only) */}
          {!isEdit && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Field
                  label="Entry Time"
                  error={errors.entryLeg?.timestampUtc?.message}
                  className="col-span-2"
                >
                  <Input
                    type="datetime-local"
                    defaultValue={nowLocalIso()}
                    onChange={(e) => {
                      setValue('entryLeg', {
                        timestampUtc: localToUtc(e.target.value),
                        price: 0,
                        volumeLots: 0,
                        commission: 0,
                        swap: 0,
                      });
                    }}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Entry Price" error={errors.entryLeg?.price?.message}>
                  <Input
                    type="number"
                    step="any"
                    placeholder="1.08500"
                    onChange={(e) =>
                      setValue('entryLeg', {
                        timestampUtc: new Date().toISOString(),
                        price: parseFloat(e.target.value) || 0,
                        volumeLots: 0,
                        commission: 0,
                        swap: 0,
                      })
                    }
                  />
                </Field>
                <Field label="Volume (lots)" error={errors.entryLeg?.volumeLots?.message}>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.10"
                    onChange={(e) =>
                      setValue('entryLeg', {
                        timestampUtc: new Date().toISOString(),
                        price: 0,
                        volumeLots: parseFloat(e.target.value) || 0,
                        commission: 0,
                        swap: 0,
                      })
                    }
                  />
                </Field>
              </div>
            </>
          )}

          {/* Setup */}
          <Field label="Setup name">
            <Input {...register('setupName')} placeholder="e.g. BOS + retest" />
          </Field>

          {/* Confidence */}
          <Field label="Confidence">
            <ConfidenceStars
              value={confidence}
              onChange={(v) => setValue('confidence', v)}
            />
          </Field>
        </TabsContent>

        {/* ── Plan tab ── */}
        <TabsContent value="plan" className="flex flex-col gap-4 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stop Loss">
              <Input
                {...register('initialStopPrice', { valueAsNumber: true })}
                type="number"
                step="any"
                placeholder="1.08200"
              />
            </Field>
            <Field label="Take Profit">
              <Input
                {...register('initialTargetPrice', { valueAsNumber: true })}
                type="number"
                step="any"
                placeholder="1.09200"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Risk Amount (acct currency)">
              <Input
                {...register('plannedRiskAmount', { valueAsNumber: true })}
                type="number"
                step="any"
                placeholder="50.00"
              />
            </Field>
            <Field label="Risk %">
              <Input
                {...register('plannedRiskPct', { valueAsNumber: true })}
                type="number"
                step="0.1"
                placeholder="1.0"
              />
            </Field>
          </div>

          <Field label="Entry model">
            <Select
              value={watch('entryModel') ?? ''}
              onValueChange={(v) =>
                setValue('entryModel', v as FullFormValues['entryModel'])
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {ENTRY_MODELS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m.replace('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Market condition">
            <Select
              value={watch('marketCondition') ?? ''}
              onValueChange={(v) =>
                setValue('marketCondition', v as FullFormValues['marketCondition'])
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {MARKET_CONDITIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c.replace('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </TabsContent>

        {/* ── Context tab ── */}
        <TabsContent value="context" className="flex flex-col gap-4 overflow-y-auto p-4">
          <Field label="Pre-trade emotion">
            <div className="flex flex-wrap gap-1">
              {EMOTIONS_PRE.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() =>
                    setValue(
                      'preTradeEmotion',
                      preEmotion === e ? undefined : (e as FullFormValues['preTradeEmotion']),
                    )
                  }
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                    preEmotion === e
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-border/60',
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Post-trade emotion">
            <div className="flex flex-wrap gap-1">
              {EMOTIONS_POST.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() =>
                    setValue(
                      'postTradeEmotion',
                      postEmotion === e ? undefined : (e as FullFormValues['postTradeEmotion']),
                    )
                  }
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                    postEmotion === e
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-border/60',
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </Field>
        </TabsContent>
      </Tabs>

      {error && <p className="mx-4 text-xs text-destructive">{error}</p>}

      <div className="flex gap-2 border-t border-border p-4">
        {onCancel && (
          <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" className="flex-1" disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Update Trade' : 'Log Trade'}
        </Button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// Public component
// ─────────────────────────────────────────────────────────────

export function TradeForm({ mode = 'full', existingTrade, onSuccess, onCancel }: TradeFormProps) {
  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => window.ledger.accounts.list(),
  });

  const { data: instruments = [] } = useQuery<Instrument[]>({
    queryKey: ['instruments'],
    queryFn: () => window.ledger.instruments.list(),
  });

  if (mode === 'quick') {
    return (
      <QuickForm
        accounts={accounts}
        instruments={instruments}
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    );
  }

  return (
    <FullForm
      accounts={accounts}
      instruments={instruments}
      existingTrade={existingTrade}
      onSuccess={onSuccess}
      onCancel={onCancel}
    />
  );
}
