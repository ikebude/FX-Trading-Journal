/**
 * Auto-update service — wraps electron-updater.
 *
 * Events are forwarded to the renderer via webContents.send('updater:event', …).
 * The 4-hour cooldown prevents hammering GitHub on every launch.
 * autoDownload and autoInstallOnAppQuit are both false — user must consent.
 */

import { BrowserWindow } from 'electron';
import { autoUpdater, type UpdateDownloadedEvent } from 'electron-updater';
import log from 'electron-log/main.js';

const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours
let lastCheckedAt = 0;

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) ?? null;
}

function forward(event: unknown): void {
  getMainWindow()?.webContents.send('updater:event', event);
}

export function initAutoUpdateService(): void {
  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => {
    forward({ type: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    forward({
      type: 'available',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    forward({ type: 'up-to-date', version: info.version });
  });

  autoUpdater.on('download-progress', (p) => {
    forward({
      type: 'progress',
      percent: p.percent,
      bytesPerSecond: p.bytesPerSecond,
      transferred: p.transferred,
      total: p.total,
    });
  });

  autoUpdater.on('update-downloaded', (event: UpdateDownloadedEvent) => {
    forward({ type: 'downloaded', version: event.version });
  });

  autoUpdater.on('error', (err: Error) => {
    log.warn('electron-updater error', err);
    forward({ type: 'error', message: err.message });
  });
}

/** Called on app launch if auto_update === true. Respects 4-hour cooldown. */
export function runAutoUpdateCheck(): void {
  const now = Date.now();
  if (now - lastCheckedAt < COOLDOWN_MS) return;
  lastCheckedAt = now;
  autoUpdater.checkForUpdates().catch((err: Error) => {
    log.warn('Auto-update background check failed', err);
  });
}

/** Called from IPC handler — always checks regardless of cooldown. */
export function checkForUpdatesManual(): Promise<void> {
  lastCheckedAt = Date.now();
  return autoUpdater
    .checkForUpdates()
    .then(() => undefined)
    .catch((err: Error) => {
      log.warn('Manual update check failed', err);
      throw err;
    });
}

export function downloadUpdate(): Promise<void> {
  return autoUpdater.downloadUpdate().then(() => undefined);
}

export function installAndRestart(): void {
  // false = do not forcefully close, true = restart immediately after install
  autoUpdater.quitAndInstall(false, true);
}
