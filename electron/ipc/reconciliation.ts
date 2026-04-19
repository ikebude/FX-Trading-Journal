/**
 * FXLedger — Reconciliation IPC handlers
 *
 * Balance reconciliation: compare actual balance vs. computed equity,
 * detect drift, and create corrections.
 */

import { ipcMain } from 'electron';
import {
  computeActualBalance,
  computeComputedEquity,
  detectAccountDrift,
  createCorrectionBalanceOp,
} from '../../src/lib/reconcile';
import { getAccount, writeAudit } from '../../src/lib/db/queries';

export function registerReconciliationHandlers(): void {
  /**
   * reconciliation:detect-drift
   *
   * Returns the drift status for an account.
   * Input: accountId
   * Output: { hasDrift, actualBalance, computedEquity, driftAmount, driftPercent }
   */
  ipcMain.handle(
    'reconciliation:detect-drift',
    async (_event, accountId: string) => {
      try {
        const account = await getAccount(accountId);
        if (!account) {
          return { error: `Account ${accountId} not found` };
        }

        const drift = await detectAccountDrift(account);
        return drift;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[reconciliation:detect-drift]', message);
        return { error: message };
      }
    },
  );

  /**
   * reconciliation:create-correction
   *
   * Creates a CORRECTION balance operation to zero out drift.
   * Input: { accountId, driftAmount, note? }
   * Output: { id, success } or { error }
   */
  ipcMain.handle(
    'reconciliation:create-correction',
    async (
      _event,
      accountId: string,
      driftAmount: number,
      note?: string,
    ) => {
      try {
        const account = await getAccount(accountId);
        if (!account) {
          return { error: `Account ${accountId} not found`, success: false };
        }

        const correctionId = await createCorrectionBalanceOp(
          accountId,
          driftAmount,
          note,
        );

        // Write audit log (hard rule #14)
        await writeAudit(
          'BALANCE_OP',
          correctionId,
          'CREATE',
          null,
          { driftAmount: [null, driftAmount] },
        );

        return { id: correctionId, success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[reconciliation:create-correction]', message);
        return { error: message, success: false };
      }
    },
  );
}
