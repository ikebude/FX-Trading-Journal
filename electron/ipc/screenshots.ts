import { ipcMain } from 'electron';
import log from 'electron-log/main.js';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { statSync } from 'node:fs';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '../../src/lib/db/client';
import { screenshots as screenshotsTable } from '../../src/lib/db/schema';
import { createScreenshot, deleteScreenshot, listScreenshots } from '../../src/lib/db/queries';
import type { IpcContext } from './index';

// ─────────────────────────────────────────────────────────────
// Security helpers
// ─────────────────────────────────────────────────────────────

/** Throw if resolvedPath is outside dataDir — prevents path traversal. */
function assertWithinDataDir(dataDir: string, resolvedPath: string): void {
  const safe = resolve(dataDir);
  if (!resolvedPath.startsWith(safe + sep) && resolvedPath !== safe) {
    throw new Error('Access denied: path is outside the data directory');
  }
}

const SCREENSHOT_KIND = z.enum(['ENTRY', 'EXIT', 'ANNOTATED', 'OTHER']);
const MAX_BUFFER_BYTES = 50 * 1024 * 1024; // 50 MB

// ─────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────

export function registerScreenshotHandlers(ctx: IpcContext): void {
  ipcMain.handle('screenshots:list-for-trade', async (_e, tradeId: string) => {
    try {
      return await listScreenshots(tradeId);
    } catch (err) {
      log.error('screenshots:list-for-trade', err);
      throw err;
    }
  });

  ipcMain.handle(
    'screenshots:save-from-buffer',
    async (_e, tradeId: string, kind: unknown, buffer: ArrayBuffer, caption?: unknown) => {
      try {
        // Validate inputs
        const safeKind = SCREENSHOT_KIND.parse(kind);
        const safeCaption = caption != null
          ? z.string().max(500).parse(caption)
          : null;

        // C-2: size guard — renderer cannot OOM main process
        if (buffer.byteLength > MAX_BUFFER_BYTES) {
          throw new RangeError(`Screenshot too large: ${buffer.byteLength} bytes (max ${MAX_BUFFER_BYTES})`);
        }

        const buf = Buffer.from(buffer);
        const filename = `screenshots/${nanoid()}.webp`;
        const destPath = resolve(ctx.config.data_dir, filename);

        // C-1: ensure dest stays inside data_dir
        assertWithinDataDir(ctx.config.data_dir, destPath);

        const { width, height } = await sharp(buf)
          .webp({ quality: 85 })
          .toFile(destPath);

        return await createScreenshot({
          tradeId,
          kind: safeKind,
          filePath: filename,
          caption: safeCaption,
          widthPx: width ?? null,
          heightPx: height ?? null,
          byteSize: buf.byteLength,
        });
      } catch (err) {
        log.error('screenshots:save-from-buffer', err);
        throw err;
      }
    },
  );

  ipcMain.handle(
    'screenshots:save-from-path',
    async (_e, tradeId: string, kind: unknown, srcPath: string, caption?: unknown) => {
      try {
        // Validate inputs
        const safeKind = SCREENSHOT_KIND.parse(kind);
        const safeCaption = caption != null
          ? z.string().max(500).parse(caption)
          : null;

        // C-2: resolve and validate the source path
        if (typeof srcPath !== 'string' || srcPath.trim() === '') {
          throw new Error('Invalid source path');
        }
        const resolvedSrc = resolve(srcPath);

        // Must be a regular file (not a device, pipe, etc.)
        const stat = statSync(resolvedSrc); // throws ENOENT if missing
        if (!stat.isFile()) throw new Error('Source path is not a regular file');

        // Only allow common image extensions — no binary/system file reads
        const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tiff', '.tif']);
        if (!ALLOWED_EXT.has(extname(resolvedSrc).toLowerCase())) {
          throw new Error('Source file is not a supported image format');
        }

        // Guard against accidentally uploading huge source files
        if (stat.size > MAX_BUFFER_BYTES) {
          throw new RangeError(`Source file too large: ${stat.size} bytes (max ${MAX_BUFFER_BYTES})`);
        }

        const filename = `screenshots/${nanoid()}.webp`;
        const destPath = resolve(ctx.config.data_dir, filename);

        // C-1: dest must stay inside data_dir
        assertWithinDataDir(ctx.config.data_dir, destPath);

        const { width, height, size } = await sharp(resolvedSrc)
          .webp({ quality: 85 })
          .toFile(destPath);

        return await createScreenshot({
          tradeId,
          kind: safeKind,
          filePath: filename,
          caption: safeCaption,
          widthPx: width ?? null,
          heightPx: height ?? null,
          byteSize: size ?? null,
        });
      } catch (err) {
        log.error('screenshots:save-from-path', err);
        throw err;
      }
    },
  );

  ipcMain.handle('screenshots:data-url', async (_e, id: string) => {
    try {
      const rows = await getDb()
        .select()
        .from(screenshotsTable)
        .where(eq(screenshotsTable.id, id))
        .limit(1);

      if (!rows[0]) return null;

      // C-1: validate the stored filePath hasn't been tampered with
      const absPath = resolve(ctx.config.data_dir, rows[0].filePath);
      assertWithinDataDir(ctx.config.data_dir, absPath);

      const buf = readFileSync(absPath);
      return `data:image/webp;base64,${buf.toString('base64')}`;
    } catch (err) {
      log.error('screenshots:data-url', err);
      throw err;
    }
  });

  ipcMain.handle('screenshots:delete', async (_e, id: string) => {
    try {
      await deleteScreenshot(id);
    } catch (err) {
      log.error('screenshots:delete', err);
      throw err;
    }
  });
}
