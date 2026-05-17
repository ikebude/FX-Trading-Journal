/**
 * WhatsNewBanner — T4.8
 *
 * Shows once per app version: when config.whats_new_seen_version !== the
 * running app version. "Release notes" opens a modal with the latest
 * CHANGELOG section; dismissing persists the current version.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';

export function WhatsNewBanner() {
  const qc = useQueryClient();
  const [showNotes, setShowNotes] = useState(false);

  const { data: version } = useQuery<string>({
    queryKey: ['app-version'],
    queryFn: () => window.ledger.app.version(),
    staleTime: Infinity,
  });
  const { data: settings } = useQuery<Record<string, unknown>>({
    queryKey: ['settings'],
    queryFn: () => window.ledger.settings.get(),
  });
  const { data: notes } = useQuery<string>({
    queryKey: ['release-notes'],
    queryFn: () => window.ledger.app.releaseNotes(),
    enabled: showNotes,
    staleTime: Infinity,
  });

  const dismiss = useMutation({
    mutationFn: () =>
      window.ledger.settings.update({ whats_new_seen_version: version }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  if (!version || !settings) return null;
  const seen = settings.whats_new_seen_version as string | null | undefined;
  if (seen === version) return null;

  return (
    <>
      <div className="flex items-center justify-between border-b border-primary/30 bg-primary/10 px-4 py-1.5 text-xs text-primary">
        <span>
          FXLedger updated to <strong>v{version}</strong>. See what’s new.
        </span>
        <div className="flex items-center gap-3">
          <button type="button" className="underline" onClick={() => setShowNotes(true)}>
            Release notes
          </button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismiss.mutate()}
            className="opacity-70 hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-8"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[70vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">What’s new — v{version}</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowNotes(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <pre className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
              {notes ?? 'Loading…'}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
