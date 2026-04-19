/**
 * DriftBanner — Balance reconciliation drift indicator
 *
 * Persistent banner showing account drift when detected.
 * Provides one-click access to the reconciliation modal.
 */

import { useState, useEffect } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { DriftModal } from './DriftModal';
import type { DriftResult } from '@/lib/reconcile';

interface DriftBannerProps {
  accountId: string;
  className?: string;
}

export function DriftBanner({ accountId, className }: DriftBannerProps) {
  const [drift, setDrift] = useState<DriftResult | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  // Detect drift on mount and when accountId changes
  useEffect(() => {
    if (!accountId) return;

    setLoading(true);
    window.ledger.reconciliation
      .detectDrift(accountId)
      .then((result) => {
        if (result.error) {
          console.error('Failed to detect drift:', result.error);
        } else {
          setDrift(result as DriftResult);
        }
      })
      .catch((err) => {
        console.error('[DriftBanner] detectDrift error:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [accountId]);

  if (loading || !drift || !drift.hasDrift || dismissed) {
    return null;
  }

  const driftAmount = Math.abs(drift.driftAmount);
  const isCredit = drift.driftAmount < 0;

  return (
    <>
      <div
        className={cn(
          'flex items-center justify-between gap-3 px-4 py-3 bg-amber-50 border-b border-amber-200 dark:bg-amber-950/20 dark:border-amber-900',
          className,
        )}
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-500 flex-shrink-0" />
          <span className="text-sm font-medium text-amber-900 dark:text-amber-100">
            Account drift detected: ${driftAmount.toFixed(2)} ({drift.driftPercent.toFixed(4)}% mismatch)
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => setShowModal(true)}
          >
            Reconcile
          </Button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded transition-colors"
            aria-label="Dismiss drift banner"
          >
            <X className="w-4 h-4 text-amber-600 dark:text-amber-500" />
          </button>
        </div>
      </div>

      {showModal && (
        <DriftModal
          accountId={accountId}
          drift={drift}
          onClose={() => {
            setShowModal(false);
            // Re-detect drift after modal closes (correction may have been made)
            window.ledger.reconciliation
              .detectDrift(accountId)
              .then((result) => {
                if (result.error) {
                  console.error('Failed to re-detect drift:', result.error);
                } else {
                  setDrift(result as DriftResult);
                }
              })
              .catch((err) => {
                console.error('[DriftBanner] detectDrift error:', err);
              });
          }}
        />
      )}
    </>
  );
}
