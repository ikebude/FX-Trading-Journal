/**
 * DriftModal — Balance reconciliation details and correction
 *
 * Modal showing:
 * - Actual balance (from balance_operations)
 * - Computed equity (from trade P&L)
 * - Drift amount and percentage
 * - "Create correction" button
 */

import { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type { DriftResult } from '@/lib/reconcile';

interface DriftModalProps {
  accountId: string;
  drift: DriftResult;
  onClose: () => void;
}

export function DriftModal({ accountId, drift, onClose }: DriftModalProps) {
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleCreateCorrection = async () => {
    setCreating(true);
    setError(null);

    try {
      const result = await window.ledger.reconciliation.createCorrection(
        accountId,
        drift.driftAmount,
        note,
      );

      if ('error' in result) {
        setError(result.error);
      } else {
        setSuccess(true);
        setTimeout(() => {
          onClose();
        }, 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create correction');
    } finally {
      setCreating(false);
    }
  };

  const driftAmount = Math.abs(drift.driftAmount);
  const isCredit = drift.driftAmount < 0;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-500" />
            Balance Drift Detected
          </DialogTitle>
          <DialogDescription>
            Account equity mismatch. Review and create a correction if needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drift Details */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                Actual Balance
              </p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                ${drift.actualBalance.toFixed(2)}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                (from balance_operations)
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                Computed Equity
              </p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                ${drift.computedEquity.toFixed(2)}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                (starting + P&L)
              </p>
            </div>
          </div>

          {/* Drift Amount */}
          <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg">
            <p className="text-xs text-amber-700 dark:text-amber-300 mb-1">Drift</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-amber-600 dark:text-amber-500">
                ${driftAmount.toFixed(2)}
              </span>
              <span className="text-sm text-amber-700 dark:text-amber-300">
                ({drift.driftPercent.toFixed(4)}%)
              </span>
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              {isCredit
                ? 'Actual is less than computed — needs credit'
                : 'Actual is more than computed — needs debit'}
            </p>
          </div>

          {/* Optional Note */}
          <div>
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">
              Correction Note (optional)
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., Manual adjustment for accrued fees"
              className="h-20 text-sm"
              disabled={creating}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg">
              <p className="text-sm text-green-700 dark:text-green-300">
                ✓ Correction created successfully. Closing...
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={creating}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateCorrection}
              disabled={creating}
              className="flex-1"
            >
              {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Correction
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
