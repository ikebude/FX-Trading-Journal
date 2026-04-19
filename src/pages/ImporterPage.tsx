/**
 * Statement Importer — Milestone 7 + 8.
 *
 * Flow:
 *  Step 1: Drop zone (drag-and-drop or file picker)
 *  Step 2: Preview (detected format, trade count, failed rows, reconcile candidates)
 *  Step 3: Commit (account selection + reconcile decisions + confirm)
 *  Step 4: Result summary
 */

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileUp,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ArrowLeft,
  Loader2,
  GitMerge,
  Copy,
  XCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import type { Account } from '@/lib/db/schema';
import type { ReconcileAction, ReconcileCandidate, ReconcileChoice } from '@/lib/reconcile';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type Step = 'drop' | 'preview' | 'commit' | 'done';

interface ParsePreview {
  id: string;
  format: string;
  trades: Array<{
    externalPositionId: string;
    symbol: string;
    direction: 'LONG' | 'SHORT';
    status: string;
    legs: Array<{ legType: 'ENTRY' | 'EXIT'; timestampUtc: string; price: number; volumeLots: number }>;
  }>;
  failed: Array<{ rowIndex: number; reason: string }>;
  rowsTotal: number;
  candidates: ReconcileCandidate[];
}

interface CommitResult {
  imported: number;
  duplicate: number;
  merged: number;
  failed: number;
}

// ─────────────────────────────────────────────────────────────
// Drop zone
// ─────────────────────────────────────────────────────────────

function DropZone({ onFilePicked }: { onFilePicked: (path: string) => void }) {
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePath(path: string) {
    setParsing(true);
    setError(null);
    try {
      onFilePicked(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read file');
    } finally {
      setParsing(false);
    }
  }

  async function handleBrowse() {
    try {
      const filePath = await window.ledger.file.pickFile();
      if (filePath) handlePath(filePath);
    } catch (err) {
      setError('Failed to open file picker');
    }
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      // In Electron, dragged files have a .path property
      const filePath = (file as File & { path?: string }).path;
      if (filePath) {
        handlePath(filePath);
      } else {
        // Fallback: if .path is not available, use the file picker
        try {
          const picked = await window.ledger.file.pickFile();
          if (picked) handlePath(picked);
        } catch (err) {
          setError('Failed to read dragged file');
        }
      }
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Import Statement</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Supports MT4 HTML, MT5 HTML, and generic CSV formats
        </p>
      </div>

      <div
        className={cn(
          'flex w-full max-w-md flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-12 transition-colors',
          dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-border/60',
        )}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {parsing ? (
          <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
        ) : (
          <FileUp className="h-10 w-10 text-muted-foreground" />
        )}
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Drop your statement file here, or{' '}
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={handleBrowse}
            >
              browse
            </button>
          </p>
          <p className="mt-1 text-xs text-muted-foreground/60">.html, .htm, .csv</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Reconcile candidate card
// ─────────────────────────────────────────────────────────────

function ReconcileCard({
  candidate,
  importedTrade,
  action,
  onAction,
}: {
  candidate: ReconcileCandidate;
  importedTrade: ParsePreview['trades'][0] | undefined;
  action: ReconcileAction;
  onAction: (a: ReconcileAction) => void;
}) {
  const manual = candidate.manualTrade;
  const importedEntry = importedTrade?.legs.find((l) => l.legType === 'ENTRY');

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitMerge className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-medium text-amber-400">Potential match</span>
          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">
            {candidate.score}% confidence
          </span>
        </div>
      </div>

      {/* Side-by-side comparison */}
      <div className="mb-4 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded border border-border bg-card p-3">
          <p className="mb-2 font-semibold text-muted-foreground">Manual trade</p>
          <p className="font-mono font-bold text-foreground">{manual.symbol}</p>
          <p className="text-muted-foreground">{manual.direction}</p>
          <p className="text-muted-foreground">
            Open: {manual.openedAtUtc?.slice(0, 16).replace('T', ' ') ?? '—'}
          </p>
          <p className="text-muted-foreground">
            Vol: {manual.totalEntryVolume ?? '—'} lots
          </p>
          {manual.setupName && (
            <p className="mt-1 text-primary/80">Setup: {manual.setupName}</p>
          )}
        </div>

        <div className="rounded border border-border bg-card p-3">
          <p className="mb-2 font-semibold text-muted-foreground">Imported trade</p>
          <p className="font-mono font-bold text-foreground">
            {importedTrade?.symbol ?? candidate.importedPositionId}
          </p>
          <p className="text-muted-foreground">{importedTrade?.direction ?? '—'}</p>
          <p className="text-muted-foreground">
            Open: {importedEntry?.timestampUtc.slice(0, 16).replace('T', ' ') ?? '—'}
          </p>
          <p className="text-muted-foreground">
            Vol: {importedEntry?.volumeLots ?? '—'} lots
          </p>
          <p className="mt-1 text-muted-foreground/60">Pos ID: {candidate.importedPositionId}</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onAction('merge')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
            action === 'merge'
              ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
              : 'border-border text-muted-foreground hover:border-emerald-500/50 hover:text-emerald-400',
          )}
        >
          <GitMerge className="h-3 w-3" />
          Merge
        </button>
        <button
          type="button"
          onClick={() => onAction('keep_both')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
            action === 'keep_both'
              ? 'border-blue-500 bg-blue-500/20 text-blue-300'
              : 'border-border text-muted-foreground hover:border-blue-500/50 hover:text-blue-400',
          )}
        >
          <Copy className="h-3 w-3" />
          Keep both
        </button>
        <button
          type="button"
          onClick={() => onAction('skip_import')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
            action === 'skip_import'
              ? 'border-muted bg-muted/20 text-muted-foreground'
              : 'border-border text-muted-foreground hover:border-border/60',
          )}
        >
          <XCircle className="h-3 w-3" />
          Skip import
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Preview step
// ─────────────────────────────────────────────────────────────

function PreviewStep({
  preview,
  reconcileActions,
  onReconcileAction,
  onBack,
  onNext,
}: {
  preview: ParsePreview;
  reconcileActions: Map<string, ReconcileAction>;
  onReconcileAction: (positionId: string, action: ReconcileAction) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const formatLabel: Record<string, string> = {
    MT4_HTML: 'MetaTrader 4 HTML',
    MT5_HTML: 'MetaTrader 5 HTML',
    CSV: 'Generic CSV',
  };

  // Trades that have no candidate (new imports)
  const candidateIds = new Set(preview.candidates.map((c) => c.importedPositionId));
  const newTrades = preview.trades.filter((t) => !candidateIds.has(t.externalPositionId));

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-xl font-bold text-foreground">{newTrades.length}</p>
          <p className="text-xs text-muted-foreground">New imports</p>
        </div>
        <div
          className={cn(
            'rounded-lg border p-3 text-center',
            preview.candidates.length > 0
              ? 'border-amber-500/30 bg-amber-500/5'
              : 'border-border bg-card',
          )}
        >
          <p
            className={cn(
              'text-xl font-bold',
              preview.candidates.length > 0 ? 'text-amber-400' : 'text-foreground',
            )}
          >
            {preview.candidates.length}
          </p>
          <p className="text-xs text-muted-foreground">Potential merges</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-xl font-bold text-foreground">{preview.rowsTotal}</p>
          <p className="text-xs text-muted-foreground">Rows parsed</p>
        </div>
        <div
          className={cn(
            'rounded-lg border p-3 text-center',
            preview.failed.length > 0
              ? 'border-rose-500/30 bg-rose-500/10'
              : 'border-border bg-card',
          )}
        >
          <p
            className={cn(
              'text-xl font-bold',
              preview.failed.length > 0 ? 'text-rose-400' : 'text-foreground',
            )}
          >
            {preview.failed.length}
          </p>
          <p className="text-xs text-muted-foreground">Failed rows</p>
        </div>
      </div>

      {/* Format badge */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Detected format:</span>
        <Badge variant="secondary">{formatLabel[preview.format] ?? preview.format}</Badge>
      </div>

      {/* Reconcile candidates */}
      {preview.candidates.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            Potential merges — review each match
          </h3>
          <p className="text-xs text-muted-foreground">
            These imported trades may match manually-logged trades in your blotter.
            Choose an action for each pair.
          </p>
          {preview.candidates.map((candidate) => {
            const importedTrade = preview.trades.find(
              (t) => t.externalPositionId === candidate.importedPositionId,
            );
            return (
              <ReconcileCard
                key={candidate.importedPositionId}
                candidate={candidate}
                importedTrade={importedTrade}
                action={reconcileActions.get(candidate.importedPositionId) ?? 'merge'}
                onAction={(a) => onReconcileAction(candidate.importedPositionId, a)}
              />
            );
          })}
        </div>
      )}

      {/* New trade preview table */}
      {newTrades.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">
            New trades ({newTrades.length})
          </h3>
          <div className="overflow-hidden rounded-md border border-border">
            <div className="max-h-56 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 border-b border-border bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-muted-foreground">Symbol</th>
                    <th className="px-3 py-2 text-muted-foreground">Dir</th>
                    <th className="px-3 py-2 text-muted-foreground">Fills</th>
                    <th className="px-3 py-2 text-muted-foreground">Open time</th>
                  </tr>
                </thead>
                <tbody>
                  {newTrades.slice(0, 200).map((t, i) => {
                    const entry = t.legs.find((l) => l.legType === 'ENTRY');
                    return (
                      <tr key={i} className="border-b border-border/40">
                        <td className="px-3 py-1.5 font-mono font-semibold">{t.symbol}</td>
                        <td className="px-3 py-1.5">
                          <Badge
                            variant={t.direction === 'LONG' ? 'long' : 'short'}
                            className="text-[9px]"
                          >
                            {t.direction}
                          </Badge>
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">{t.legs.length}</td>
                        <td className="px-3 py-1.5 text-muted-foreground tabular-nums">
                          {entry?.timestampUtc.slice(0, 10) ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Failed rows */}
      {preview.failed.length > 0 && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-4">
          <p className="mb-2 text-sm font-semibold text-rose-400">
            {preview.failed.length} row{preview.failed.length !== 1 ? 's' : ''} could not be parsed
          </p>
          <ul className="space-y-1">
            {preview.failed.slice(0, 10).map((f, i) => (
              <li key={i} className="text-xs text-rose-300/80">
                Row {f.rowIndex}: {f.reason}
              </li>
            ))}
            {preview.failed.length > 10 && (
              <li className="text-xs text-muted-foreground">
                …and {preview.failed.length - 10} more
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto flex gap-3">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <Button
          className="flex-1"
          onClick={onNext}
          disabled={preview.trades.length === 0 && preview.candidates.length === 0}
        >
          Continue to import
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Commit step
// ─────────────────────────────────────────────────────────────

function CommitStep({
  preview,
  reconcileActions,
  onBack,
  onCommit,
}: {
  preview: ParsePreview;
  reconcileActions: Map<string, ReconcileAction>;
  onBack: () => void;
  onCommit: (accountId: string) => void;
}) {
  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => window.ledger.accounts.list(),
  });

  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [committing, setCommitting] = useState(false);

  // Auto-select the first account once the query resolves.
  // useState() initial value runs before the query returns (accounts is [] at mount),
  // so we must sync via useEffect when data arrives.
  useEffect(() => {
    if (!selectedAccountId && accounts.length > 0) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);
  const [progress, setProgress] = useState(0);

  const mergeCount = [...reconcileActions.values()].filter((a) => a === 'merge').length;
  const keepBothCount = [...reconcileActions.values()].filter((a) => a === 'keep_both').length;
  const skipCount = [...reconcileActions.values()].filter((a) => a === 'skip_import').length;
  const candidateIds = new Set(preview.candidates.map((c) => c.importedPositionId));
  const newCount = preview.trades.filter((t) => !candidateIds.has(t.externalPositionId)).length;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Choose account</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Select which account these trades belong to.
        </p>
      </div>

      <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
        <SelectTrigger className="max-w-sm">
          <SelectValue placeholder="Select account…" />
        </SelectTrigger>
        <SelectContent>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: a.displayColor }}
                />
                {a.name}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="rounded-md border border-border bg-card p-4 text-sm">
        <p className="font-medium text-foreground">Import summary</p>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {newCount > 0 && <li>• {newCount} new trade{newCount !== 1 ? 's' : ''} will be imported</li>}
          {mergeCount > 0 && (
            <li className="text-emerald-400">
              • {mergeCount} trade{mergeCount !== 1 ? 's' : ''} will be merged with existing manual trades
            </li>
          )}
          {keepBothCount > 0 && (
            <li>• {keepBothCount} trade{keepBothCount !== 1 ? 's' : ''} will be added alongside existing manual trades</li>
          )}
          {skipCount > 0 && (
            <li className="text-muted-foreground/60">• {skipCount} trade{skipCount !== 1 ? 's' : ''} will be skipped</li>
          )}
          <li>• Duplicate trades (matching external ID) will be skipped automatically</li>
          <li>• P&L metrics will be computed after import</li>
        </ul>
      </div>

      {committing && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Importing trades…</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-auto flex gap-3">
        <Button variant="outline" onClick={onBack} disabled={committing}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <Button
          className="flex-1"
          disabled={!selectedAccountId || committing}
          onClick={async () => {
            setCommitting(true);
            setProgress(0);
            // Animate progress to ~90% while the IPC call runs
            const interval = setInterval(() => {
              setProgress((p) => (p < 88 ? p + Math.random() * 8 : p));
            }, 180);
            try {
              await onCommit(selectedAccountId);
              setProgress(100);
            } finally {
              clearInterval(interval);
              setTimeout(() => setCommitting(false), 300);
            }
          }}
        >
          {committing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Importing…
            </>
          ) : (
            'Import trades'
          )}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Done step
// ─────────────────────────────────────────────────────────────

function DoneStep({ result, onReset }: { result: CommitResult; onReset: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <CheckCircle2 className="h-16 w-16 text-emerald-400" />
      <div>
        <h2 className="text-lg font-semibold text-foreground">Import complete</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your trades are now in the blotter.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
        {[
          { label: 'Imported', value: result.imported, color: 'text-emerald-400' },
          { label: 'Merged', value: result.merged, color: 'text-blue-400' },
          { label: 'Duplicate', value: result.duplicate, color: 'text-muted-foreground' },
          { label: 'Failed', value: result.failed, color: 'text-rose-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg border border-border bg-card p-4">
            <p className={cn('text-2xl font-bold', color)}>{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <Button onClick={onReset}>Import another file</Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────

export function ImporterPage() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('drop');
  const [preview, setPreview] = useState<ParsePreview | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  // Default action for each candidate is 'merge' (best guess)
  const [reconcileActions, setReconcileActions] = useState<Map<string, ReconcileAction>>(
    new Map(),
  );

  async function handleFilePicked(path: string) {
    setParseError(null);
    try {
      const data = await window.ledger.imports.parseFile(path);
      if (!data.id) {
        setParseError('Could not detect format. Make sure this is an MT4/MT5 HTML or CSV file.');
        return;
      }
      const p = data as ParsePreview;
      setPreview(p);
      // Pre-populate reconcile actions: default to 'merge'
      const actions = new Map<string, ReconcileAction>();
      for (const c of p.candidates ?? []) {
        actions.set(c.importedPositionId, 'merge');
      }
      setReconcileActions(actions);
      setStep('preview');
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Parse failed');
    }
  }

  function handleReconcileAction(positionId: string, action: ReconcileAction) {
    setReconcileActions((prev) => new Map(prev).set(positionId, action));
  }

  async function handleCommit(accountId: string) {
    if (!preview?.id) return;

    const reconcileChoices: ReconcileChoice[] = [];
    for (const candidate of preview.candidates ?? []) {
      const action = reconcileActions.get(candidate.importedPositionId) ?? 'merge';
      reconcileChoices.push({
        importedPositionId: candidate.importedPositionId,
        manualTradeId: candidate.manualTrade.id,
        action,
      });
    }

    const res = await window.ledger.imports.commit(preview.id, {
      accountId,
      reconcileChoices,
    });
    setResult(res as CommitResult);
    // H-2: invalidate all account-scoped queries so dashboard, blotter,
    // session clock, and prop-firm banner reflect the newly imported trades.
    queryClient.invalidateQueries({ queryKey: ['trades'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['accounts'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
    setStep('done');
  }

  function reset() {
    setStep('drop');
    setPreview(null);
    setResult(null);
    setParseError(null);
    setReconcileActions(new Map());
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header breadcrumb */}
      <div className="flex h-10 shrink-0 items-center border-b border-border bg-card px-4">
        <span className="text-sm font-medium text-foreground">Import Statement</span>
        {step !== 'drop' && (
          <div className="ml-4 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Select file</span>
            <ChevronRight className="h-3 w-3" />
            <span className={step === 'preview' ? 'text-foreground' : ''}>Preview</span>
            <ChevronRight className="h-3 w-3" />
            <span className={step === 'commit' ? 'text-foreground' : ''}>Confirm</span>
            <ChevronRight className="h-3 w-3" />
            <span className={step === 'done' ? 'text-emerald-400' : ''}>Done</span>
          </div>
        )}
      </div>

      {/* Steps */}
      {step === 'drop' && (
        <>
          <DropZone onFilePicked={handleFilePicked} />
          {parseError && (
            <div className="mx-6 mb-6 flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {parseError}
            </div>
          )}
        </>
      )}
      {step === 'preview' && preview && (
        <PreviewStep
          preview={preview}
          reconcileActions={reconcileActions}
          onReconcileAction={handleReconcileAction}
          onBack={reset}
          onNext={() => setStep('commit')}
        />
      )}
      {step === 'commit' && preview && (
        <CommitStep
          preview={preview}
          reconcileActions={reconcileActions}
          onBack={() => setStep('preview')}
          onCommit={handleCommit}
        />
      )}
      {step === 'done' && result && <DoneStep result={result} onReset={reset} />}
    </div>
  );
}
