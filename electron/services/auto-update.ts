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
import { existsSync, readFileSync } from 'node:fs';
import { sha256File, hashesMatch } from '../../src/lib/hash';

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
  // T4.10 — permit installing an older feed version (one-click rollback to
  // the prior release if a regression ships). Off by default in electron-updater.
  autoUpdater.allowDowngrade = true;

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
    // T4.11 — SHA-256 integrity gate. electron-updater already checks the
    // feed's sha512, but we add an independent SHA-256 verification against
    // a sidecar "<installer>.sha256" when present (offline, no network).
    // On mismatch we surface an error and do NOT signal "downloaded", so
    // the user is never prompted to install a tampered artifact.
    void (async () => {
      try {
        const file = event.downloadedFile;
        if (file) {
          const actual = await sha256File(file);
          log.info(`auto-update: SHA-256(${file}) = ${actual}`);
          const sidecar = `${file}.sha256`;
          if (existsSync(sidecar)) {
            const expected = readFileSync(sidecar, 'utf-8').trim().split(/\s+/)[0];
            if (!hashesMatch(actual, expected)) {
              log.error(
                `auto-update: SHA-256 mismatch — expected ${expected}, got ${actual}. Aborting.`,
              );
              forward({
                type: 'error',
                message: 'Update integrity check failed (SHA-256 mismatch). Not installed.',
              });
              return;
            }
            log.info('auto-update: SHA-256 verified against sidecar');
          }
        }
      } catch (err) {
        log.warn('auto-update: SHA-256 verification error (non-fatal)', err);
      }
      forward({ type: 'downloaded', version: event.version });
    })();
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
