import { ipcMain } from 'electron';
import log from 'electron-log/main.js';

import {
  listBalanceOps,
  createBalanceOp,
  softDeleteBalanceOp,
} from '../../src/lib/db/queries';

export function registerBalanceOpHandlers(): void {
  ipcMain.handle('balance-ops:list', async (_e, accountId: string, includeDeleted = false) => {
    try {
      return await listBalanceOps(accountId, includeDeleted);
    } catch (err) {
      log.error('balance-ops:list', err);
      throw new Error('Failed to load balance operations');
    }
  });

  ipcMain.handle('balance-ops:create', async (_e, data: unknown) => {
    try {
      return await createBalanceOp(data as Parameters<typeof createBalanceOp>[0]);
    } catch (err) {
      log.error('balance-ops:create', err);
      throw new Error('Failed to create balance operation');
    }
  });

  ipcMain.handle('balance-ops:delete', async (_e, id: string) => {
    try {
      await softDeleteBalanceOp(id);
    } catch (err) {
      log.error('balance-ops:delete', err);
      throw new Error('Failed to delete balance operation');
    }
  });
}
