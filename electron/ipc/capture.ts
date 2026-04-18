/**
 * Capture IPC handler — Milestone 10.
 *
 * Provides screen capture for the hotkey overlay:
 *  capture:foreground-window → captures the top-most non-FXLedger window,
 *    encodes as WebP q85 via sharp, saves to screenshots/unmatched/<uuid>.webp,
 *    returns { dataUrl, savedPath } for the overlay UI to display.
 *  capture:show → shows the overlay window (delegates to main via ctx)
 *  capture:hide → hides the overlay window
 */

import { ipcMain, desktopCapturer, nativeImage } from 'electron';
import log from 'electron-log/main.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { nanoid } from 'nanoid';

import type { IpcContext } from './index';

export function registerCaptureHandlers(ctx: IpcContext): void {
  ipcMain.removeHandler('capture:foreground-window');
  ipcMain.removeHandler('capture:show');
  ipcMain.removeHandler('capture:hide');

  ipcMain.handle('capture:foreground-window', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 1920, height: 1080 },
      });

      // Prefer the first non-FXLedger window source
      const source =
        sources.find(
          (s) =>
            s.name !== 'FXLedger' &&
            !s.name.toLowerCase().includes('ledger') &&
            s.thumbnail.getSize().width > 0,
        ) ?? sources[0];

      if (!source) {
        log.warn('capture:foreground-window: no sources available');
        return { dataUrl: null, savedPath: null };
      }

      const png = source.thumbnail.toPNG();

      // Try to encode as WebP via sharp (optional — sharp may not be bundled)
      let webpBuffer: Buffer | null = null;
      try {
        const sharp = require('sharp') as typeof import('sharp');
        webpBuffer = await sharp(png).webp({ quality: 85 }).toBuffer();
      } catch {
        // sharp not available — fall back to PNG
        log.warn('capture: sharp not available, using PNG');
        webpBuffer = null;
      }

      const ext = webpBuffer ? 'webp' : 'png';
      const buffer = webpBuffer ?? png;

      // Save to screenshots/unmatched/
      const unmatchedDir = join(ctx.config.data_dir, 'screenshots', 'unmatched');
      mkdirSync(unmatchedDir, { recursive: true });
      const filename = `${nanoid()}.${ext}`;
      const savedPath = join(unmatchedDir, filename);
      writeFileSync(savedPath, buffer);

      // Return as data URL for immediate display in overlay
      const base64 = buffer.toString('base64');
      const mime = webpBuffer ? 'image/webp' : 'image/png';
      const dataUrl = `data:${mime};base64,${base64}`;

      // Store relative path (relative to data_dir)
      const relativePath = `screenshots/unmatched/${filename}`;

      return { dataUrl, savedPath: relativePath };
    } catch (err) {
      log.error('capture:foreground-window', err);
      return { dataUrl: null, savedPath: null };
    }
  });

  ipcMain.handle('capture:show', () => {
    ctx.showOverlay();
  });

  ipcMain.handle('capture:hide', () => {
    ctx.hideOverlay();
  });
}
