/**
 * RiskCalculator — live lot-size and risk calculator panel.
 *
 * Embedded as a floating panel (triggered from TopBar or hotkey).
 * Uses the active account's balance and the selected instrument's
 * pip_size / contract_size from the DB.
 *
 * Fields:
 *  - Instrument (symbol selector)
 *  - Account balance (reads from active account, editable)
 *  - Risk % (1-5 selector + custom input)
 *  - Entry price
 *  - Stop price
 *  - Target price (optional, for R:R)
 *
 * Output:
 *  - Risk amount ($)
 *  - Pips at risk
 *  - Lot size (raw + rounded)
 *  - Projected reward + R:R (if target set)
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { computeLotSize } from '@/lib/risk-calc';
import { useAppStore } from '@/stores/app-store';
import type { Instrument, Account } from '@/lib/db/schema';

// ─────────────────────────────────────────────────────────────
// Field components
// ─────────────────────────────────────────────────────────────

function NumField({
  label,
  value,
  onChange,
  step = 0.0001,
  placeholder = '0',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: number;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}

function RiskPresets({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const presets = [0.5, 1, 1.5, 2];
  return (
    <div className="flex gap-1">
      {presets.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={cn(
            'rounded px-2 py-1 text-[10px] font-semibold transition-colors',
            value === p
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground',
          )}
        >
          {p}%
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Result row
// ─────────────────────────────────────────────────────────────

function ResultRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className={cn('text-xs font-semibold tabular-nums', highlight && 'text-primary')}>
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

interface RiskCalculatorProps {
  onClose?: () => void;
  onUseLotSize?: (lots: number) => void;
  prefillSymbol?: string;
  prefillEntry?: number;
  prefillStop?: number;
}

export function RiskCalculator({ onClose, onUseLotSize, prefillSymbol, prefillEntry, prefillStop }: RiskCalculatorProps) {
  const { activeAccountId } = useAppStore();

  const [symbol, setSymbol] = useState(prefillSymbol ?? '');
  const [riskPct, setRiskPct] = useState(1);
  const [riskPctStr, setRiskPctStr] = useState('1');
  const [entry, setEntry] = useState(prefillEntry != null ? String(prefillEntry) : '');
  const [stop, setStop] = useState(prefillStop != null ? String(prefillStop) : '');
  const [target, setTarget] = useState('');

  // Load instruments for the symbol selector
  const { data: instruments } = useQuery<Instrument[]>({
    queryKey: ['instruments'],
    queryFn: () => window.ledger.instruments.list(),
  });

  // Load active account for balance
  const { data: accountData } = useQuery<Account | null>({
    queryKey: ['account', activeAccountId],
    queryFn: () => activeAccountId ? window.ledger.accounts.get(activeAccountId) : null,
    enabled: !!activeAccountId,
  });

  const instrument = instruments?.find((i) => i.symbol === symbol.toUpperCase());
  const balance = accountData?.initialBalance ?? 10000;

  const result = useMemo(() => {
    if (!instrument) return null;
    const entryN = parseFloat(entry);
    const stopN = parseFloat(stop);
    const targetN = target ? parseFloat(target) : undefined;
    if (!entryN || !stopN || isNaN(entryN) || isNaN(stopN)) return null;
    if (Math.abs(entryN - stopN) < 1e-10) return null;

    return computeLotSize({
      accountBalance: balance,
      riskPercent: riskPct,
      entryPrice: entryN,
      stopPrice: stopN,
      pipSize: instrument.pipSize,
      contractSize: instrument.contractSize,
      quoteCurrency: instrument.quoteCurrency ?? 'USD',
      accountCurrency: accountData?.accountCurrency ?? 'USD',
      targetPrice: targetN,
    });
  }, [instrument, balance, riskPct, entry, stop, target, accountData]);

  return (
    <div className="flex w-72 flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">Lot Size Calculator</span>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Symbol */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Symbol
        </label>
        <input
          list="rc-symbols"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="EURUSD"
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono font-semibold text-foreground uppercase placeholder:font-normal placeholder:normal-case placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <datalist id="rc-symbols">
          {instruments?.map((i) => (
            <option key={i.symbol} value={i.symbol} />
          ))}
        </datalist>
      </div>

      {/* Risk % */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Risk  — ${result ? result.riskAmount.toFixed(2) : '—'}
        </label>
        <RiskPresets value={riskPct} onChange={(v) => { setRiskPct(v); setRiskPctStr(String(v)); }} />
        <input
          type="number"
          step={0.1}
          min={0.1}
          max={10}
          value={riskPctStr}
          onChange={(e) => {
            setRiskPctStr(e.target.value);
            const n = parseFloat(e.target.value);
            if (!isNaN(n) && n > 0) setRiskPct(n);
          }}
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Prices */}
      <div className="grid grid-cols-3 gap-2">
        <NumField label="Entry" value={entry} onChange={setEntry} step={0.00001} />
        <NumField label="Stop" value={stop} onChange={setStop} step={0.00001} />
        <NumField label="Target" value={target} onChange={setTarget} step={0.00001} placeholder="opt." />
      </div>

      {/* Results */}
      {result && (
        <div className="flex flex-col gap-2 rounded-lg border border-border/50 bg-muted/30 p-3">
          <ResultRow label="Pips at risk" value={`${result.pipsAtRisk.toFixed(1)} pips`} />
          <ResultRow label="Pip value/lot" value={`$${result.pipValuePerLot.toFixed(3)}`} />
          <div className="my-1 border-t border-border/50" />
          <ResultRow
            label="Lot size"
            value={`${result.lotSizeRounded.toFixed(2)} lots`}
            highlight
          />
          {result.projectedRR !== null && (
            <>
              <div className="my-1 border-t border-border/50" />
              <ResultRow
                label="Projected R:R"
                value={`1 : ${result.projectedRR.toFixed(2)}`}
                highlight
              />
              <ResultRow
                label="Projected reward"
                value={`$${result.projectedReward?.toFixed(2) ?? '—'}`}
              />
            </>
          )}
        </div>
      )}

      {/* Use this lot size */}
      {result && onUseLotSize && (
        <button
          type="button"
          onClick={() => onUseLotSize(result.lotSizeRounded)}
          className="w-full rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Use {result.lotSizeRounded.toFixed(2)} lots in new trade
        </button>
      )}

      {!instrument && symbol.length >= 3 && (
        <p className="text-[10px] text-rose-400">
          Instrument "{symbol}" not found. Add it in your instrument list.
        </p>
      )}

      {/* Balance note */}
      <p className="text-[9px] text-muted-foreground/50">
        Based on account balance ${balance.toLocaleString()}
      </p>
    </div>
  );
}
