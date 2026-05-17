/**
 * BalanceLedger — deposit / withdrawal log for a single account.
 *
 * Shown inside the Settings > Accounts section when an account is expanded.
 * Lets traders record manual deposits, withdrawals, bonuses, etc. and
 * view the running balance contribution from these operations.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/cn';
import type { BalanceOperation } from '@/lib/db/schema';

const OP_TYPES: BalanceOperation['opType'][] = [
  'DEPOSIT',
  'WITHDRAWAL',
  'BONUS',
  'CREDIT',
  'CHARGE',
  'COMMISSION',
  'INTEREST',
  'PAYOUT',
  'CORRECTION',
  'OTHER',
];

function nowLocalIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function BalanceLedger({ accountId, currency }: { accountId: string; currency: string }) {
  const qc = useQueryClient();
  const [opType, setOpType] = useState<BalanceOperation['opType']>('DEPOSIT');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [occurredAt, setOccurredAt] = useState(nowLocalIso());

  const { data: ops = [], isLoading } = useQuery<BalanceOperation[]>({
    queryKey: ['balance-ops', accountId],
    queryFn: () => window.ledger.balanceOps.list(accountId) as Promise<BalanceOperation[]>,
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const amt = parseFloat(amount);
      if (isNaN(amt) || amt === 0) throw new Error('Invalid amount');
      // Withdrawals and charges are negative by convention
      const signed =
        ['WITHDRAWAL', 'CHARGE', 'COMMISSION'].includes(opType) ? -Math.abs(amt) : Math.abs(amt);
      const occurred = new Date(occurredAt).toISOString();
      return window.ledger.balanceOps.create({
        accountId,
        opType,
        amount: signed,
        currency,
        occurredAtUtc: occurred,
        source: 'MANUAL',
        note: note.trim() || null,
        deletedAtUtc: null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['balance-ops', accountId] });
      setAmount('');
      setNote('');
      setOccurredAt(nowLocalIso());
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => window.ledger.balanceOps.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['balance-ops', accountId] }),
  });

  const runningTotal = ops.reduce((s, o) => s + o.amount, 0);

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Balance Operations
      </p>

      {/* Add form */}
      <div className="grid grid-cols-[120px_1fr_1fr_auto] gap-2 items-end">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">Type</span>
          <Select value={opType} onValueChange={(v) => setOpType(v as BalanceOperation['opType'])}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OP_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="text-xs">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">Amount ({currency})</span>
          <Input
            className="h-8 text-xs"
            type="number"
            step="0.01"
            placeholder="1000.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">Date & time</span>
          <Input
            className="h-8 text-xs"
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
          />
        </div>
        <Button
          size="sm"
          className="h-8"
          disabled={!amount || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Note field */}
      <Input
        className="h-7 text-xs"
        placeholder="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      {/* Log table */}
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : ops.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No balance operations yet. Add a deposit or withdrawal above.
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Date</th>
                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Type</th>
                  <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Amount</th>
                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Note</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {ops.map((op) => (
                  <tr key={op.id} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
                      {op.occurredAtUtc.slice(0, 10)}
                    </td>
                    <td className="px-3 py-1.5">{op.opType}</td>
                    <td
                      className={cn(
                        'px-3 py-1.5 text-right font-semibold tabular-nums',
                        op.amount >= 0 ? 'text-emerald-400' : 'text-rose-400',
                      )}
                    >
                      {op.amount >= 0 ? '+' : ''}
                      {op.amount.toFixed(2)}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{op.note ?? ''}</td>
                    <td className="px-2 py-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={() => deleteMutation.mutate(op.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-right text-xs text-muted-foreground">
            Net balance operations:{' '}
            <span
              className={cn(
                'font-semibold tabular-nums',
                runningTotal >= 0 ? 'text-emerald-400' : 'text-rose-400',
              )}
            >
              {runningTotal >= 0 ? '+' : ''}
              {runningTotal.toFixed(2)} {currency}
            </span>
          </p>
        </>
      )}
    </div>
  );
}
