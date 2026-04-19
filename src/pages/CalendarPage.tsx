/**
 * CalendarPage — Milestone 14
 *
 * Shows news events for a week with impact indicators.
 * Supports ForexFactory CSV import via drag-and-drop or file dialog.
 *
 * Layout:
 *  - Header: week navigator, Import CSV button, Re-tag Trades button
 *  - Week grid: 5 columns (Mon–Fri), events grouped by day
 *  - Each event: time, currency, impact badge, title
 */

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
  isSameDay,
  parseISO,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Upload, RefreshCw, Settings, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/cn';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface NewsEvent {
  id: string;
  timestampUtc: string;
  currency: string;
  impact: 'LOW' | 'MEDIUM' | 'HIGH' | 'HOLIDAY';
  title: string;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
}

// ─────────────────────────────────────────────────────────────
// Impact badge
// ─────────────────────────────────────────────────────────────

function ImpactDot({ impact }: { impact: NewsEvent['impact'] }) {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 shrink-0 rounded-full',
        impact === 'HIGH' && 'bg-rose-500',
        impact === 'MEDIUM' && 'bg-amber-400',
        impact === 'LOW' && 'bg-emerald-500/50',
        impact === 'HOLIDAY' && 'bg-sky-400',
      )}
    />
  );
}

function ImpactBadge({ impact }: { impact: NewsEvent['impact'] }) {
  const styles: Record<NewsEvent['impact'], string> = {
    HIGH: 'bg-rose-950 text-rose-400 border-rose-500/30',
    MEDIUM: 'bg-amber-950 text-amber-400 border-amber-500/30',
    LOW: 'bg-muted text-muted-foreground border-border',
    HOLIDAY: 'bg-sky-950 text-sky-400 border-sky-500/30',
  };
  return (
    <span className={cn('rounded border px-1 py-0.5 text-[9px] font-semibold uppercase', styles[impact])}>
      {impact}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Event card
// ─────────────────────────────────────────────────────────────

function EventCard({ event, tz }: { event: NewsEvent; tz: string }) {
  const time = format(parseISO(event.timestampUtc), 'HH:mm');
  return (
    <div className="flex items-start gap-2 rounded-md border border-border/50 bg-card/50 px-2 py-1.5 hover:border-border">
      <ImpactDot impact={event.impact} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="tabular-nums text-muted-foreground">{time}</span>
          <span className="font-semibold text-foreground">{event.currency}</span>
          <ImpactBadge impact={event.impact} />
        </div>
        <p className="mt-0.5 truncate text-[11px] text-foreground">{event.title}</p>
        {(event.forecast || event.actual) && (
          <p className="text-[9px] text-muted-foreground">
            {event.forecast && `F: ${event.forecast}`}
            {event.previous && `  P: ${event.previous}`}
            {event.actual && `  A: ${event.actual}`}
          </p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Day column
// ─────────────────────────────────────────────────────────────

function DayColumn({ day, events }: { day: Date; events: NewsEvent[] }) {
  const isToday = isSameDay(day, new Date());
  const highCount = events.filter((e) => e.impact === 'HIGH').length;

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* Day header */}
      <div
        className={cn(
          'flex items-center justify-between border-b border-border px-2 py-1.5',
          isToday && 'bg-primary/5',
        )}
      >
        <div className="flex flex-col">
          <span className={cn('text-[10px] font-semibold uppercase', isToday ? 'text-primary' : 'text-muted-foreground')}>
            {format(day, 'EEE')}
          </span>
          <span className={cn('text-sm font-bold tabular-nums', isToday ? 'text-primary' : 'text-foreground')}>
            {format(day, 'd')}
          </span>
        </div>
        {highCount > 0 && (
          <span className="rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold text-rose-400">
            {highCount} HIGH
          </span>
        )}
      </div>

      {/* Events */}
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {events.length === 0 ? (
          <p className="text-center text-[10px] text-muted-foreground/50">—</p>
        ) : (
          events.map((e) => <EventCard key={e.id} event={e} tz="UTC" />)
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main CalendarPage
// ─────────────────────────────────────────────────────────────

interface SyncSettings {
  enabled: boolean;
  intervalHours: number;
  lastSyncUtc: string | null;
}

export function CalendarPage() {
  const queryClient = useQueryClient();
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [dragOver, setDragOver] = useState(false);
  const [syncSettingsOpen, setSyncSettingsOpen] = useState(false);
  const [syncSettings, setSyncSettings] = useState<SyncSettings | null>(null);

  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(anchor, { weekStartsOn: 1 });

  // Weekdays only (Mon–Fri)
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd }).filter(
    (d) => d.getDay() !== 0 && d.getDay() !== 6,
  );

  // Load sync settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await window.ledger.calendar.getSyncSettings();
        setSyncSettings(settings);
      } catch (err) {
        console.error('Failed to load sync settings:', err);
      }
    };
    loadSettings();
  }, []);

  const { data: events, isLoading } = useQuery<NewsEvent[]>({
    queryKey: ['calendar', weekStart.toISOString(), weekEnd.toISOString()],
    queryFn: () =>
      window.ledger.calendar.list({
        from: weekStart.toISOString(),
        to: weekEnd.toISOString(),
      }),
  });

  const importMutation = useMutation({
    mutationFn: (filePath: string) => window.ledger.calendar.importCsv(filePath),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
  });

  const retagMutation = useMutation({
    mutationFn: () => window.ledger.calendar.retagTrades(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
    },
  });

  // T1.10: Auto-sync mutations
  const syncNowMutation = useMutation({
    mutationFn: () => window.ledger.calendar.syncNow(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      // Update last sync time
      const now = new Date().toISOString();
      setSyncSettings((prev) => prev ? { ...prev, lastSyncUtc: now } : null);
    },
  });

  const autoSyncToggleMutation = useMutation({
    mutationFn: (enabled: boolean) => window.ledger.calendar.autoSyncToggle(enabled),
    onSuccess: (_, enabled) => {
      setSyncSettings((prev) => prev ? { ...prev, enabled } : null);
    },
  });

  const setIntervalMutation = useMutation({
    mutationFn: (hours: number) => window.ledger.calendar.setSyncInterval(hours),
    onSuccess: (_, hours) => {
      setSyncSettings((prev) => prev ? { ...prev, intervalHours: hours } : null);
    },
  });

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.csv')) {
        importMutation.mutate(file.path);
      }
    },
    [importMutation],
  );

  // Group events by day
  const eventsByDay = weekDays.map((day) => ({
    day,
    events: (events ?? []).filter((e) => isSameDay(parseISO(e.timestampUtc), day)),
  }));

  const weekLabel = `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`;

  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden',
        dragOver && 'ring-2 ring-inset ring-primary',
      )}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex shrink-0 flex-col border-b border-border bg-card">
        {/* Main header row */}
        <div className="flex items-center gap-2 px-4 py-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setAnchor((a) => subWeeks(a, 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="min-w-52 text-center text-sm font-medium text-foreground">
            {weekLabel}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setAnchor((a) => addWeeks(a, 1))}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="ml-2 h-7 gap-1.5 text-xs"
            onClick={() => setAnchor(new Date())}
          >
            Today
          </Button>

          <div className="ml-auto flex items-center gap-2">
            {/* T1.10: Sync Now button */}
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => syncNowMutation.mutate()}
              disabled={syncNowMutation.isPending}
              title={syncSettings?.lastSyncUtc ? `Last sync: ${format(parseISO(syncSettings.lastSyncUtc), 'MMM d, HH:mm')}` : 'Never synced'}
            >
              <RefreshCw className={cn('h-3 w-3', syncNowMutation.isPending && 'animate-spin')} />
              {syncNowMutation.isPending ? 'Syncing…' : 'Sync Now'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => retagMutation.mutate()}
              disabled={retagMutation.isPending}
            >
              <RefreshCw className={cn('h-3 w-3', retagMutation.isPending && 'animate-spin')} />
              Re-tag Trades
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={importMutation.isPending}
              onClick={() => {
                // In a real build we'd open a file dialog via IPC
                // For now, drag-and-drop is the primary interaction
              }}
            >
              <Upload className="h-3 w-3" />
              {importMutation.isPending ? 'Importing…' : 'Import CSV'}
            </Button>

            {/* T1.10: Auto-sync settings button */}
            <Button
              variant={syncSettingsOpen ? 'default' : 'outline'}
              size="sm"
              className="h-7 w-7"
              onClick={() => setSyncSettingsOpen(!syncSettingsOpen)}
            >
              <Settings className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* T1.10: Auto-sync settings panel */}
        {syncSettingsOpen && syncSettings && (
          <div className="border-t border-border bg-card/50 px-4 py-3">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={syncSettings.enabled}
                  onChange={(e) => autoSyncToggleMutation.mutate(e.target.checked)}
                  disabled={autoSyncToggleMutation.isPending}
                  className="h-4 w-4 rounded border-border"
                />
                <span className="text-foreground">Auto-sync every</span>
              </label>

              <Select
                value={String(syncSettings.intervalHours)}
                onValueChange={(value) => setIntervalMutation.mutate(parseInt(value, 10))}
                disabled={!syncSettings.enabled || setIntervalMutation.isPending}
              >
                <SelectTrigger className="h-7 w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 6, 8, 12, 24].map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {h}h
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {syncSettings.lastSyncUtc && (
                <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>Last: {format(parseISO(syncSettings.lastSyncUtc), 'MMM d, HH:mm')}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Import status */}
      {importMutation.isSuccess && (
        <div className="flex shrink-0 items-center gap-2 border-b border-emerald-500/20 bg-emerald-950/30 px-4 py-1.5">
          <span className="text-xs text-emerald-400">
            Imported successfully. Drag another file or click Re-tag Trades.
          </span>
        </div>
      )}
      {importMutation.isError && (
        <div className="flex shrink-0 items-center gap-2 border-b border-rose-500/20 bg-rose-950/30 px-4 py-1.5">
          <span className="text-xs text-rose-400">
            Import failed. Please check the CSV format.
          </span>
        </div>
      )}

      {/* Week grid */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : (
        <div className="flex flex-1 divide-x divide-border overflow-hidden">
          {eventsByDay.map(({ day, events: dayEvents }) => (
            <DayColumn key={day.toISOString()} day={day} events={dayEvents} />
          ))}
        </div>
      )}

      {/* Drag overlay hint */}
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-primary p-8 text-center">
            <Upload className="mx-auto mb-2 h-8 w-8 text-primary" />
            <p className="text-sm font-medium text-foreground">Drop ForexFactory CSV here</p>
          </div>
        </div>
      )}
    </div>
  );
}
