import { ipcMain } from 'electron';
import log from 'electron-log/main.js';

import { getAuditForTrade } from '../../src/lib/db/queries';

export function registerAuditHandlers(): void {
  ipcMain.handle('audit:for-trade', async (_e, tradeId: string) => {
    try {
      return await getAuditForTrade(tradeId);
    } catch (err) {
      log.error('audit:for-trade', err);
      throw new Error('Failed to load audit log');
    }
  });
}
