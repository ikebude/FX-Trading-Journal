/**
 * Trade legs table — shows ENTRY and EXIT fills.
 * Supports adding new legs and deleting existing ones.
 * Every mutation calls recompute via the IPC layer.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/cn';
import { formatDatetime } from '@/lib/format';
import { CreateLegSchema } from '@/lib/schemas';
import { useAppStore } from '@/stores/app-store';
import type { TradeLeg } from '@/lib/db/schema';

type LegFormValues = z.input<typeof CreateLegSchema>;

interface LegsTableProps {
  tradeId: string;
  legs: TradeLeg[];
}

function nowLocalIso() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function LegsTable({ tradeId, legs }: LegsTableProps) {
  const { displayTimezone } = useAppStore();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LegFormValues>({
    resolver: zodResolver(CreateLegSchema),
    defaultValues: {
      tradeId,
      legType: 'EXIT',
      timestampUtc: new Date().toISOString(),
      commission: 0,
      swap: 0,
    },
  });

  async function onAddLeg(data: LegFormValues) {
    setSaveError(null);
    try {
      await window.ledger.legs.create(data);
      queryClient.invalidateQueries({ queryKey: ['trade', tradeId] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      reset({ tradeId, legType: 'EXIT', timestampUtc: new Date().toISOString(), commission: 0, swap: 0 });
      setAddOpen(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to add leg');
    }
  }

  async function handleDelete(legId: string) {
    setDeleting(legId);
    try {
      await window.ledger.legs.delete(legId);
      queryClient.invalidateQueries({ queryKey: ['trade', tradeId] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
    } finally {
      setDeleting(null);
    }
  }

  const entries = legs.filter((l) => l.legType === 'ENTRY');
  const exits = legs.filter((l) => l.legType === 'EXIT');

  function LegRow({ leg }: { leg: TradeLeg }) {
    return (
      <tr className="border-b border-border/50 hover:bg-accent/30 transition-colors">
        <td className="px-3 py-2">
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-semibold',
              leg.legType === 'ENTRY'
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-orange-500/20 text-orange-400',
            )}
          >
            {leg.legType}
          </span>
        </td>
        <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">
          {formatDatetime(leg.timestampUtc, displayTimezone, 'dd MMM HH:mm')}
        </td>
        <td className="px-3 py-2 text-right text-xs tabular-nums">{leg.price.toFixed(5)}</td>
        <td className="px-3 py-2 text-right text-xs tabular-nums">{leg.volumeLots.toFixed(2)}</td>
        <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
          {leg.commission !== 0 ? leg.commission.toFixed(2) : '—'}
        </td>
        <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
          {leg.swap !== 0 ? leg.swap.toFixed(2) : '—'}
        </td>
        <td className="px-3 py-2 text-right">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            disabled={deleting === leg.id}
            onClick={() => handleDelete(leg.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </td>
      </tr>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Fills</h3>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setAddOpen((p) => !p)}
        >
          <Plus className="h-3 w-3" />
          Add leg
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">Type</th>
              <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">Time</th>
              <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground">Price</th>
              <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground">Lots</th>
              <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground">Comm</th>
              <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground">Swap</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {[...entries, ...exits].map((leg) => (
              <LegRow key={leg.id} leg={leg} />
            ))}
            {legs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No fills yet. Add an entry leg to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Inline add-leg form */}
      {addOpen && (
        <form
          onSubmit={handleSubmit(onAddLeg)}
          className="rounded-md border border-border bg-card p-4"
        >
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select
                defaultValue="EXIT"
                onValueChange={(v) => setValue('legType', v as 'ENTRY' | 'EXIT')}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ENTRY">ENTRY</SelectItem>
                  <SelectItem value="EXIT">EXIT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label className="text-xs text-muted-foreground">Time</Label>
              <Input
                type="datetime-local"
                defaultValue={nowLocalIso()}
                className="h-8 text-xs"
                onChange={(e) =>
                  setValue('timestampUtc', new Date(e.target.value).toISOString())
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Price *</Label>
              <Input
                {...register('price', { valueAsNumber: true })}
                type="number"
                step="any"
                placeholder="1.08500"
                className="h-8 text-xs"
              />
              {errors.price && <p className="text-[10px] text-destructive">{errors.price.message}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Lots *</Label>
              <Input
                {...register('volumeLots', { valueAsNumber: true })}
                type="number"
                step="0.01"
                placeholder="0.10"
                className="h-8 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Commission</Label>
              <Input
                {...register('commission', { valueAsNumber: true })}
                type="number"
                step="0.01"
                defaultValue={0}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Swap</Label>
              <Input
                {...register('swap', { valueAsNumber: true })}
                type="number"
                step="0.01"
                defaultValue={0}
                className="h-8 text-xs"
              />
            </div>
          </div>
          {saveError && <p className="mt-2 text-xs text-destructive">{saveError}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting ? 'Adding…' : 'Add fill'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
