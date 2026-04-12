/**
 * ReportsPage — Milestone 15
 *
 * Two report types:
 *  1. Summary PDF: date range + account → downloads PDF
 *  2. CSV Export: full trade list with filters → saves CSV via file dialog
 *
 * PDF is generated in the main process and returned as a file path.
 * The renderer opens it via shell:show-in-explorer.
 */

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { format, subDays, startOfYear } from 'date-fns';
import { FileText, Download, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useAppStore } from '@/stores/app-store';

// ─────────────────────────────────────────────────────────────
// Date presets
// ─────────────────────────────────────────────────────────────

const PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Year to date', days: -1 },
  { label: 'All time', days: 0 },
] as const;

function getRange(preset: typeof PRESETS[number]): Partial<{ dateFrom: string; dateTo: string }> {
  const now = new Date();
  if (preset.days === 0) return {};
  if (preset.days === -1) {
    return {
      dateFrom: startOfYear(now).toISOString(),
      dateTo: now.toISOString(),
    };
  }
  return {
    dateFrom: subDays(now, preset.days).toISOString(),
    dateTo: now.toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// Report card
// ─────────────────────────────────────────────────────────────

function ReportCard({
  icon: Icon,
  title,
  description,
  action,
  actionLabel,
  loading,
  disabled,
  children,
}: {
  icon: React.FC<{ className?: string }>;
  title: string;
  description: string;
  action: () => void;
  actionLabel: string;
  loading: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4.5 w-4.5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
      <Button onClick={action} disabled={loading || disabled} className="w-full gap-2">
        {loading ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Generating…
          </>
        ) : (
          <>
            <Download className="h-3.5 w-3.5" />
            {actionLabel}
          </>
        )}
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main ReportsPage
// ─────────────────────────────────────────────────────────────

export function ReportsPage() {
  const { activeAccountId } = useAppStore();
  const [selectedPreset, setSelectedPreset] = useState<number>(1); // 30 days default
  const [resultPath, setResultPath] = useState<string | null>(null);
  const [resultKind, setResultKind] = useState<'pdf' | 'csv' | null>(null);

  const range = getRange(PRESETS[selectedPreset]);
  const filters = {
    accountId: activeAccountId,
    ...range,
  };

  const summaryMutation = useMutation({
    mutationFn: () => window.ledger.reports.summaryPdf(filters),
    onSuccess: (path) => {
      if (path) {
        setResultPath(path);
        setResultKind('pdf');
      }
    },
  });

  const csvMutation = useMutation({
    mutationFn: () => window.ledger.reports.exportCsv(filters),
    onSuccess: (path) => {
      if (path) {
        setResultPath(path);
        setResultKind('csv');
      }
    },
  });

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div>
          <h1 className="text-base font-semibold text-foreground">Reports</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Export your trading data as PDF or CSV
          </p>
        </div>

        {/* Date range selector */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">Date Range</span>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset, i) => (
              <button
                key={preset.label}
                onClick={() => setSelectedPreset(i)}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                  selectedPreset === i
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-border/80 hover:text-foreground',
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Report cards */}
        <div className="grid gap-4 sm:grid-cols-2">
          <ReportCard
            icon={FileText}
            title="Summary PDF"
            description="Performance overview with stats, equity curve, and trade list for the selected period."
            action={() => summaryMutation.mutate()}
            actionLabel="Generate PDF"
            loading={summaryMutation.isPending}
            disabled={!activeAccountId}
          />

          <ReportCard
            icon={FileDown}
            title="CSV Export"
            description="Full trade data export. Opens a Save As dialog. Compatible with Excel and other tools."
            action={() => csvMutation.mutate()}
            actionLabel="Export CSV"
            loading={csvMutation.isPending}
            disabled={!activeAccountId}
          />
        </div>

        {/* Success / open file */}
        {resultPath && (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-4 py-3">
            <span className="text-sm text-emerald-400">
              {resultKind === 'pdf' ? 'PDF generated' : 'CSV saved'} →{' '}
              <span className="font-mono text-xs">{resultPath}</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 shrink-0 text-xs text-emerald-400 hover:text-emerald-300"
              onClick={() => window.ledger.shell.showInExplorer(resultPath)}
            >
              Show in Explorer
            </Button>
          </div>
        )}

        {(summaryMutation.isError || csvMutation.isError) && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-950/30 px-4 py-3">
            <span className="text-sm text-rose-400">
              Generation failed. Please check there are closed trades in the selected period.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
