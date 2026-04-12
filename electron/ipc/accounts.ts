import { ipcMain } from 'electron';
import log from 'electron-log/main.js';
import { nanoid } from 'nanoid';

import {
  createAccount,
  deleteAccount,
  getAccount,
  listAccounts,
  updateAccount,
} from '../../src/lib/db/queries';
import { CreateAccountSchema, UpdateAccountSchema } from '../../src/lib/schemas';

export function registerAccountHandlers(): void {
  ipcMain.handle('accounts:list', async () => {
    try {
      return await listAccounts();
    } catch (err) {
      log.error('accounts:list', err);
      throw new Error('Failed to load accounts');
    }
  });

  ipcMain.handle('accounts:get', async (_e, id: string) => {
    try {
      return await getAccount(id);
    } catch (err) {
      log.error('accounts:get', err);
      throw new Error('Failed to load account');
    }
  });

  ipcMain.handle('accounts:create', async (_e, data: unknown) => {
    try {
      const parsed = CreateAccountSchema.parse(data);
      return await createAccount({
        ...parsed,
        broker: parsed.broker ?? null,
        openedAtUtc: parsed.openedAtUtc ?? null,
        propDailyLossLimit: parsed.propDailyLossLimit ?? null,
        propDailyLossPct: parsed.propDailyLossPct ?? null,
        propMaxDrawdown: parsed.propMaxDrawdown ?? null,
        propMaxDrawdownPct: parsed.propMaxDrawdownPct ?? null,
        propDrawdownType: parsed.propDrawdownType ?? null,
        propProfitTarget: parsed.propProfitTarget ?? null,
        propProfitTargetPct: parsed.propProfitTargetPct ?? null,
        propPhase: parsed.propPhase ?? null,
      });
    } catch (err) {
      log.error('accounts:create', err);
      throw new Error('Failed to create account');
    }
  });

  ipcMain.handle('accounts:update', async (_e, id: string, patch: unknown) => {
    try {
      const parsed = UpdateAccountSchema.parse(patch);
      return await updateAccount(id, parsed as Parameters<typeof updateAccount>[1]);
    } catch (err) {
      log.error('accounts:update', err);
      throw new Error('Failed to update account');
    }
  });

  ipcMain.handle('accounts:delete', async (_e, id: string) => {
    try {
      await deleteAccount(id);
    } catch (err) {
      log.error('accounts:delete', err);
      throw new Error('Failed to delete account');
    }
  });
}
