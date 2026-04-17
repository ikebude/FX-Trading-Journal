import { cn } from '@/lib/cn';
import { useUpdater } from '@/hooks/useUpdater';
import { formatDistanceToNow } from 'date-fns';

export function UpdateBanner() {
  const { status, version, progress, error, dismissed, download, install, dismiss } =
    useUpdater();

  if (dismissed) return null;

  if (status === 'error') {
    return (
      <div className="flex items-center justify-between border-b border-destructive/30 bg-destructive/10 px-4 py-1.5 text-xs text-destructive">
        <span>Update check failed: {error}</span>
        <button type="button" onClick={dismiss} className="ml-4 underline">
          Dismiss
        </button>
      </div>
    );
  }

  if (status === 'available') {
    return (
      <div className="flex items-center justify-between border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-400">
        <span>
          Ledger <strong>{version}</strong> is available
        </span>
        <div className="flex items-center gap-3">
          <button type="button" onClick={download} className="font-medium underline">
            Download
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="text-muted-foreground underline"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  if (status === 'downloading') {
    return (
      <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5">
        <div className="mb-1 flex items-center justify-between text-xs text-amber-400">
          <span>Downloading update…</span>
          <span>{Math.round(progress ?? 0)}%</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={Math.round(progress ?? 0)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1 overflow-hidden rounded-full bg-amber-500/20"
        >
          <div
            className={cn('h-full bg-amber-400 transition-all duration-300')}
            style={{ width: `${progress ?? 0}%` }}
          />
        </div>
      </div>
    );
  }

  if (status === 'ready') {
    return (
      <div className="flex items-center justify-between border-b border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs text-emerald-400">
        <span>
          Ledger <strong>{version}</strong> is ready to install
        </span>
        <button type="button" onClick={install} className="font-medium underline">
          Restart now
        </button>
      </div>
    );
  }

  return null;
}

export function UpdateCheckButton() {
  const { status, lastCheckedAt, check } = useUpdater();

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={check}
        disabled={status === 'checking' || status === 'downloading'}
        className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
      >
        {status === 'checking' ? 'Checking…' : 'Check for updates now'}
      </button>
      {lastCheckedAt && (
        <span className="text-xs text-muted-foreground">
          Last checked {formatDistanceToNow(lastCheckedAt, { addSuffix: true })}
        </span>
      )}
    </div>
  );
}
