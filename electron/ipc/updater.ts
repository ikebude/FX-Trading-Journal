import { ipcMain } from 'electron';
import log from 'electron-log/main.js';
import {
  checkForUpdatesManual,
  downloadUpdate,
  installAndRestart,
} from '../services/auto-update';

export function registerUpdaterHandlers(): void {
  ipcMain.handle('updater:check', async () => {
    try {
      await checkForUpdatesManual();
      return { ok: true };
    } catch (err) {
      log.warn('updater:check IPC error', err);
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle('updater:download', async () => {
    try {
      await downloadUpdate();
    } catch (err) {
      log.warn('updater:download IPC error', err);
      throw err;
    }
  });

  // Fire-and-forget — app quits mid-call, no response needed.
  ipcMain.handle('updater:install', () => {
    installAndRestart();
  });
}
