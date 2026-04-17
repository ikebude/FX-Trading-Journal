/**
 * SettingsPage — Milestone 17
 *
 * Sections:
 *  1. General — timezone, theme
 *  2. Accounts — list, create, edit, delete
 *  3. Bridge — watch directory for live MT4/5 trades
 *  4. Backup — manual backup, restore from ZIP, list recent backups
 *  5. Data — open data folder, move data folder
 *  6. About
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  FolderOpen,
  HardDrive,
  Shield,
  Trash2,
  Wifi,
  WifiOff,
  RotateCcw,
  Archive,
  Info,
  Settings2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { Account } from '@/lib/db/schema';
import { UpdateCheckButton } from '@/components/layout/UpdateBanner';

// ─────────────────────────────────────────────────────────────
// Section wrapper
// ─────────────────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.FC<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-foreground">{label}</span>
        {description && (
          <span className="text-[11px] text-muted-foreground">{description}</span>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// General section — theme + timezone
// ─────────────────────────────────────────────────────────────

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Toronto',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Zurich',
  'Asia/Tokyo',
  'Asia/Hong_Kong',
  'Asia/Singapore',
  'Asia/Dubai',
  'Australia/Sydney',
];

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-muted',
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  );
}

function GeneralSection() {
  const queryClient = useQueryClient();

  const { data: settings } = useQuery<Record<string, unknown>>({
    queryKey: ['settings'],
    queryFn: () => window.ledger.settings.get(),
  });

  const updateMutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) => window.ledger.settings.update(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });

  const theme = (settings?.theme as string | undefined) ?? 'dark';
  const tz = (settings?.display_timezone as string | undefined) ?? 'America/New_York';
  const autoLaunch = (settings?.auto_launch as boolean | undefined) ?? false;
  const autoUpdate = (settings?.auto_update as boolean | undefined) ?? false;

  return (
    <Section title="General" icon={Settings2}>
      <Row label="Theme" description="Application color scheme">
        <select
          value={theme}
          onChange={(e) => updateMutation.mutate({ theme: e.target.value })}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="system">System</option>
        </select>
      </Row>

      <Row label="Display Timezone" description="Timestamps shown in this timezone across the app">
        <select
          value={tz}
          onChange={(e) => updateMutation.mutate({ display_timezone: e.target.value })}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {TIMEZONES.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </Row>

      <Row
        label="Launch on Windows startup"
        description="Start Ledger automatically when you log in"
      >
        <Toggle
          checked={autoLaunch}
          onChange={(val) => updateMutation.mutate({ auto_launch: val })}
          disabled={updateMutation.isPending}
        />
      </Row>

      <Row
        label="Auto-update"
        description="Check for new versions on startup (requires internet)"
      >
        <Toggle
          checked={autoUpdate}
          onChange={(val) => updateMutation.mutate({ auto_update: val })}
          disabled={updateMutation.isPending}
        />
      </Row>

      <Row
        label="Check for updates"
        description="Manually check for a newer version of Ledger"
      >
        <UpdateCheckButton />
      </Row>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────
// Bridge section
// ─────────────────────────────────────────────────────────────

function BridgeSection() {
  const [watchDir, setWatchDir] = useState('');
  const navigate = useNavigate();

  const { data: status, refetch } = useQuery<{
    running: boolean;
    watchDir: string | null;
    filesProcessed: number;
  }>({
    queryKey: ['bridge-status'],
    queryFn: () => window.ledger.bridge.status(),
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (status?.watchDir) setWatchDir(status.watchDir);
  }, [status?.watchDir]);

  const setDirMutation = useMutation({
    mutationFn: (dir: string) => window.ledger.bridge.setWatchDir(dir),
    onSuccess: () => refetch(),
  });

  const pauseMutation = useMutation({
    mutationFn: () => window.ledger.bridge.pause(),
    onSuccess: () => refetch(),
  });

  const resumeMutation = useMutation({
    mutationFn: () => window.ledger.bridge.resume(),
    onSuccess: () => refetch(),
  });

  const isRunning = status?.running ?? false;

  return (
    <Section title="Live Bridge" icon={isRunning ? Wifi : WifiOff}>
      <Row
        label="Status"
        description={`${status?.filesProcessed ?? 0} files processed`}
      >
        <span
          className={cn(
            'flex items-center gap-1.5 text-xs font-semibold',
            isRunning ? 'text-emerald-400' : 'text-muted-foreground',
          )}
        >
          <span
            className={cn(
              'inline-block h-1.5 w-1.5 rounded-full',
              isRunning ? 'animate-pulse bg-emerald-400' : 'bg-muted-foreground',
            )}
          />
          {isRunning ? 'Running' : 'Stopped'}
        </span>
      </Row>

      <Row
        label="Watch Directory"
        description="MQL5/Files/Ledger/ folder inside your MT4/5 data directory"
      >
        <div className="flex flex-col items-end gap-1.5">
          <input
            value={watchDir}
            onChange={(e) => setWatchDir(e.target.value)}
            placeholder="C:\Users\...\MQL5\Files\Ledger"
            className="w-72 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setDirMutation.mutate(watchDir)}
            disabled={!watchDir || setDirMutation.isPending}
          >
            Set & Start Watching
          </Button>
        </div>
      </Row>

      <Row label="Controls" description="">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => pauseMutation.mutate()}
            disabled={!isRunning || pauseMutation.isPending}
          >
            Pause
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => resumeMutation.mutate()}
            disabled={isRunning || resumeMutation.isPending}
          >
            Resume
          </Button>
        </div>
      </Row>

      <div className="mt-2">
        <button
          type="button"
          onClick={() => navigate({ to: '/settings/ea-guide' })}
          className="text-xs text-primary underline underline-offset-2"
        >
          MT4 / MT5 Bridge Setup Guide →
        </button>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────
// Backup section
// ─────────────────────────────────────────────────────────────

interface BackupEntry {
  name: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
}

function BackupSection() {
  const queryClient = useQueryClient();

  const { data: backups } = useQuery<BackupEntry[]>({
    queryKey: ['backup-list'],
    queryFn: () => window.ledger.backup.list(),
  });

  const backupMutation = useMutation({
    mutationFn: () => window.ledger.backup.now(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backup-list'] }),
  });

  const restoreMutation = useMutation({
    mutationFn: (zipPath: string) => window.ledger.backup.restore(zipPath),
  });

  function fmtBytes(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }

  function fmtDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  return (
    <Section title="Backup & Restore" icon={Archive}>
      <Row label="Create Backup Now" description="Saves a ZIP of your database and screenshots">
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs"
          onClick={() => backupMutation.mutate()}
          disabled={backupMutation.isPending}
        >
          <Archive className="h-3 w-3" />
          {backupMutation.isPending ? 'Backing up…' : 'Backup Now'}
        </Button>
      </Row>

      {backupMutation.isSuccess && typeof backupMutation.data === 'string' && (
        <p className="text-xs text-emerald-400">Backup saved: {backupMutation.data}</p>
      )}

      {/* Recent backups list */}
      {backups && backups.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Recent Backups
          </span>
          <div className="max-h-48 overflow-y-auto rounded-md border border-border">
            {backups.slice(0, 10).map((b) => (
              <div
                key={b.path}
                className="flex items-center gap-2 border-b border-border/50 px-3 py-2 text-xs last:border-b-0"
              >
                <span className="flex-1 font-mono text-[10px] text-foreground">{b.name}</span>
                <span className="text-muted-foreground">{fmtBytes(b.sizeBytes)}</span>
                <span className="text-muted-foreground/60">{fmtDate(b.createdAt)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] text-rose-400 hover:text-rose-300"
                  onClick={() => {
                    if (confirm('Restore this backup? Your current data will be replaced.')) {
                      restoreMutation.mutate(b.path);
                    }
                  }}
                >
                  <RotateCcw className="mr-1 h-2.5 w-2.5" />
                  Restore
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {restoreMutation.isSuccess && (
        <p className="text-xs text-emerald-400">
          Restore complete. Restart the app for changes to take effect.
        </p>
      )}
      {restoreMutation.isError && (
        <p className="text-xs text-rose-400">
          Restore failed. Please check the backup file.
        </p>
      )}
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────
// Accounts section
// ─────────────────────────────────────────────────────────────

function AccountsSection() {
  const { data: accounts } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => window.ledger.accounts.list(),
  });

  const typeBadge: Record<string, string> = {
    LIVE: 'bg-emerald-950 text-emerald-400',
    DEMO: 'bg-sky-950 text-sky-400',
    PROP: 'bg-amber-950 text-amber-400',
  };

  return (
    <Section title="Accounts" icon={Shield}>
      <div className="flex flex-col gap-2">
        {(accounts ?? []).map((acc) => (
          <div
            key={acc.id}
            className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
          >
            <span
              className="h-3 w-3 rounded-full"
              style={{ background: acc.displayColor }}
            />
            <span className="flex-1 text-xs font-medium text-foreground">{acc.name}</span>
            {acc.broker && (
              <span className="text-[10px] text-muted-foreground">{acc.broker}</span>
            )}
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase',
                typeBadge[acc.accountType] ?? 'bg-muted text-muted-foreground',
              )}
            >
              {acc.accountType}
            </span>
            <span className="text-[10px] text-muted-foreground">
              ${acc.initialBalance.toLocaleString()}
            </span>
          </div>
        ))}
        {(!accounts || accounts.length === 0) && (
          <p className="text-xs text-muted-foreground">No accounts. Add one via the top bar.</p>
        )}
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────
// Data folder section
// ─────────────────────────────────────────────────────────────

function DataSection() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery<Record<string, unknown>>({
    queryKey: ['settings'],
    queryFn: () => window.ledger.settings.get(),
  });

  const clearSampleMutation = useMutation({
    mutationFn: () => window.ledger.trades.clearSample(),
    onSuccess: ({ count }) => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      alert(`${count} sample trade${count === 1 ? '' : 's'} removed.`);
    },
    onError: () => {
      alert('Failed to clear sample trades. Please try again.');
    },
  });

  function handleClearSample() {
    if (
      confirm(
        'Remove all sample trades? This permanently deletes them and cannot be undone.',
      )
    ) {
      clearSampleMutation.mutate();
    }
  }

  return (
    <Section title="Data" icon={HardDrive}>
      <Row
        label="Data Folder"
        description={(settings?.data_dir as string | undefined) ?? 'Default location'}
      >
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => window.ledger.shell.openDataFolder()}
        >
          <FolderOpen className="h-3 w-3" />
          Open Folder
        </Button>
      </Row>
      <Row
        label="Sample Trades"
        description="Remove the demo trades added on first launch."
      >
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs text-destructive hover:bg-destructive/10"
          onClick={handleClearSample}
          disabled={clearSampleMutation.isPending}
        >
          <Trash2 className="h-3 w-3" />
          {clearSampleMutation.isPending ? 'Clearing…' : 'Clear Sample Trades'}
        </Button>
      </Row>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────
// Main SettingsPage
// ─────────────────────────────────────────────────────────────

export function SettingsPage() {
  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="mx-auto w-full max-w-2xl space-y-5">
        <div>
          <h1 className="text-base font-semibold text-foreground">Settings</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Configure Ledger to match your trading workflow.
          </p>
        </div>

        <GeneralSection />
        <AccountsSection />
        <BridgeSection />
        <BackupSection />
        <DataSection />

        {/* About */}
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">About Ledger</h2>
          </div>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <p>Local-first forex trading journal for Windows.</p>
            <p>No cloud. No telemetry. Your data stays on your machine.</p>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground/50">
              Built with Electron · React · SQLite · Drizzle ORM
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
