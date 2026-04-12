import { ipcMain, shell, app } from 'electron';
import log from 'electron-log/main.js';
import { join } from 'node:path';
import type { IpcContext } from './index';

export function registerSettingsHandlers(ctx: IpcContext): void {
  ipcMain.handle('settings:get', () => {
    return { ...ctx.config };
  });

  ipcMain.handle('settings:update', (_e, patch: Record<string, unknown>) => {
    try {
      const next = { ...ctx.config, ...patch } as typeof ctx.config;
      ctx.saveConfig(next);

      // Apply auto-launch change immediately — no restart required.
      if ('auto_launch' in patch) {
        try {
          app.setLoginItemSettings({ openAtLogin: !!next.auto_launch });
          log.info(`Auto-launch ${next.auto_launch ? 'enabled' : 'disabled'}`);
        } catch (e) {
          log.warn('setLoginItemSettings failed', e);
        }
      }

      return { ...next };
    } catch (err) {
      log.error('settings:update', err);
      throw err;
    }
  });

  ipcMain.handle('settings:move-data-folder', async (_e, newPath: string) => {
    // Full data folder migration is a Milestone 16 feature.
    // For now, just update config to point to the new path.
    try {
      const next = { ...ctx.config, data_dir: newPath };
      ctx.saveConfig(next);
      return { success: true };
    } catch (err) {
      log.error('settings:move-data-folder', err);
      throw err;
    }
  });

  ipcMain.handle('shell:open-data-folder', async () => {
    await shell.openPath(ctx.config.data_dir);
  });

  ipcMain.handle('shell:open-log-folder', async () => {
    await shell.openPath(join(ctx.config.data_dir, 'logs'));
  });

  ipcMain.handle('shell:show-in-explorer', async (_e, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle('capture:show', () => {
    ctx.showOverlay();
  });

  ipcMain.handle('capture:hide', () => {
    ctx.hideOverlay();
  });

  ipcMain.handle('capture:foreground-window', async () => {
    // Screenshot capture of the foreground window — implemented in Milestone 10.
    return null;
  });
}
