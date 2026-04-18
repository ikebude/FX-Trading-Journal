/**
 * Backup/Restore IPC handlers — Milestone 16.
 *
 * Backup: creates a timestamped ZIP archive containing:
 *   - ledger.db  (the SQLite database)
 *   - screenshots/  (all screenshot files)
 *   - config.json  (app configuration)
 *
 * Restore: extracts a backup ZIP to a temp directory, validates it
 * contains a ledger.db, then replaces the live data folder contents.
 * The DB connection is closed before replacement and reopened after.
 *
 * ZIP format: uses the built-in Node.js `zlib` + a streaming zip via
 * the `archiver` approach. However, since we have `electron-builder`
 * and need to stay dependency-minimal, we use a hand-rolled zip writer
 * via the `node:zlib` deflate + manual ZIP local file headers.
 *
 * Actually: We use the `adm-zip` package which is already a common
 * Electron dep. If not present, fall back to copying db only.
 * Better: use child_process to invoke 7zip or PowerShell Compress-Archive
 * on Windows — but that introduces platform coupling.
 *
 * Simplest correct approach: use Node's built-in `fs.cpSync` + a pure-JS
 * zip writer. We'll use the `jszip` package or write the zip manually.
 *
 * Since the spec says "ZIP, auto on close, manual" and we have pdfkit/sharp
 * but no zip dep listed, we use Node's built-in streams and implement
 * a minimal ZIP using the `zlib` module directly (DEFLATE).
 * For production quality we'll use archiver/adm-zip — but since we
 * want zero new deps, use the fs.cpSync + rename approach with a custom
 * ZIP writer.
 *
 * FINAL DECISION: implement using the `archiver` npm package pattern
 * but with only built-in Node APIs. We write a minimal ZIP using
 * Node's zlib.deflateRawSync for each file, then build the ZIP byte
 * structure manually. This is ~100 lines but has zero external deps.
 */

import { ipcMain, app } from 'electron';
import {
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  cpSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { format } from 'date-fns';
import log from 'electron-log/main.js';

import { backupDatabaseTo, closeDatabase, initializeDatabase } from '../../src/lib/db/client';
import type { IpcContext } from './index';

// ─────────────────────────────────────────────────────────────
// Minimal ZIP writer (no external deps)
// ─────────────────────────────────────────────────────────────

function crc32(buf: Buffer): number {
  // Standard CRC-32 lookup table
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    }
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string; // relative path within ZIP, forward slashes
  data: Buffer;
  compressed: Buffer;
  crc: number;
  offset: number;
}

function buildZip(entries: { name: string; data: Buffer }[]): Buffer {
  const zEntries: ZipEntry[] = [];
  const parts: Buffer[] = [];
  let offset = 0;

  const dosDate = Math.floor(new Date().getTime() / 1000);

  for (const entry of entries) {
    const compressed = deflateRawSync(entry.data, { level: 6 });
    const crc = crc32(entry.data);
    const nameBytes = Buffer.from(entry.name, 'utf-8');

    // Local file header: signature + fixed fields
    const lhSize = 30 + nameBytes.length;
    const lh = Buffer.alloc(lhSize, 0);
    lh.writeUInt32LE(0x04034b50, 0); // local file header sig
    lh.writeUInt16LE(20, 4);          // version needed: 2.0
    lh.writeUInt16LE(0x0800, 6);      // flags: UTF-8
    lh.writeUInt16LE(8, 8);           // compression: DEFLATE
    lh.writeUInt16LE(0, 10);          // mod time
    lh.writeUInt16LE(0, 12);          // mod date
    lh.writeUInt32LE(crc, 14);        // crc-32
    lh.writeUInt32LE(compressed.length, 18); // compressed size
    lh.writeUInt32LE(entry.data.length, 22); // uncompressed size
    lh.writeUInt16LE(nameBytes.length, 26); // file name length
    lh.writeUInt16LE(0, 28);          // extra field length
    nameBytes.copy(lh, 30);

    zEntries.push({ name: entry.name, data: entry.data, compressed, crc, offset });
    parts.push(lh, compressed);
    offset += lhSize + compressed.length;
  }

  // Central directory
  const cdParts: Buffer[] = [];
  let cdSize = 0;
  const cdOffset = offset;

  for (const ze of zEntries) {
    const nameBytes = Buffer.from(ze.name, 'utf-8');
    const cd = Buffer.alloc(46 + nameBytes.length, 0);
    cd.writeUInt32LE(0x02014b50, 0);  // central dir sig
    cd.writeUInt16LE(20, 4);           // version made by
    cd.writeUInt16LE(20, 6);           // version needed
    cd.writeUInt16LE(0x0800, 8);       // flags
    cd.writeUInt16LE(8, 10);           // compression
    cd.writeUInt16LE(0, 12);           // mod time
    cd.writeUInt16LE(0, 14);           // mod date
    cd.writeUInt32LE(ze.crc, 16);
    cd.writeUInt32LE(ze.compressed.length, 20);
    cd.writeUInt32LE(ze.data.length, 24);
    cd.writeUInt16LE(nameBytes.length, 28);
    cd.writeUInt16LE(0, 30);           // extra len
    cd.writeUInt16LE(0, 32);           // comment len
    cd.writeUInt16LE(0, 34);           // disk start
    cd.writeUInt16LE(0, 36);           // int attrs
    cd.writeUInt32LE(0, 38);           // ext attrs
    cd.writeUInt32LE(ze.offset, 42);   // local header offset
    nameBytes.copy(cd, 46);
    cdParts.push(cd);
    cdSize += cd.length;
  }

  // End of central directory record
  const eocd = Buffer.alloc(22, 0);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);            // disk number
  eocd.writeUInt16LE(0, 6);            // cd start disk
  eocd.writeUInt16LE(zEntries.length, 8);
  eocd.writeUInt16LE(zEntries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, ...cdParts, eocd]);
}

// ─────────────────────────────────────────────────────────────
// File collector
// ─────────────────────────────────────────────────────────────

// M-2: 2 GB safety cap — reading the entire data dir into memory can OOM the
// main process if the user has thousands of large screenshots.
const MAX_BACKUP_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

function collectFiles(dir: string, base: string): { name: string; data: Buffer }[] {
  const result: { name: string; data: Buffer }[] = [];
  if (!existsSync(dir)) return result;

  let totalBytes = 0;

  function walk(current: string) {
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        const fileSize = statSync(full).size;
        if (totalBytes + fileSize > MAX_BACKUP_BYTES) {
          throw new Error(
            `Backup aborted: data folder exceeds the 2 GB limit. ` +
            `Move large files outside the data directory or archive older backups first.`,
          );
        }
        totalBytes += fileSize;
        const rel = relative(base, full).replace(/\\/g, '/');
        result.push({ name: rel, data: readFileSync(full) });
      }
    }
  }

  walk(dir);
  return result;
}

// ─────────────────────────────────────────────────────────────
// Backup
// ─────────────────────────────────────────────────────────────

async function createBackup(dataDir: string, configPath: string): Promise<string> {
  const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
  const backupDir = join(dataDir, 'backups');
  mkdirSync(backupDir, { recursive: true });
  const outPath = join(backupDir, `ledger-backup-${timestamp}.zip`);

  const entries: { name: string; data: Buffer }[] = [];

  // Add database — use better-sqlite3's hot backup API for a WAL-safe consistent
  // snapshot. Reading ledger.db directly while WAL mode is active can produce an
  // inconsistent copy if there are uncommitted WAL transactions not yet checkpointed.
  const dbPath = join(dataDir, 'ledger.db');
  if (existsSync(dbPath)) {
    const tempDb = dbPath + '.bak-tmp';
    try {
      await backupDatabaseTo(tempDb);
      entries.push({ name: 'ledger.db', data: readFileSync(tempDb) });
    } finally {
      if (existsSync(tempDb)) rmSync(tempDb);
    }
  }

  // Add screenshots
  const screenshotsDir = join(dataDir, 'screenshots');
  entries.push(...collectFiles(screenshotsDir, dataDir));

  // Add config
  if (existsSync(configPath)) {
    entries.push({ name: 'config.json', data: readFileSync(configPath) });
  }

  const zipBuffer = buildZip(entries);
  writeFileSync(outPath, zipBuffer);

  log.info(`backup: created ${outPath} (${entries.length} files, ${zipBuffer.length} bytes)`);
  return outPath;
}

// ─────────────────────────────────────────────────────────────
// List backups
// ─────────────────────────────────────────────────────────────

function listBackups(dataDir: string): { name: string; path: string; sizeBytes: number; createdAt: string }[] {
  const backupDir = join(dataDir, 'backups');
  if (!existsSync(backupDir)) return [];

  return readdirSync(backupDir)
    .filter((f) => f.endsWith('.zip'))
    .map((f) => {
      const full = join(backupDir, f);
      const stat = statSync(full);
      return {
        name: f,
        path: full,
        sizeBytes: stat.size,
        createdAt: stat.birthtime.toISOString(),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ─────────────────────────────────────────────────────────────
// Restore — DESTRUCTIVE: replaces live data folder
// ─────────────────────────────────────────────────────────────

async function restoreBackup(
  zipPath: string,
  dataDir: string,
): Promise<{ success: boolean; error?: string }> {
  if (!existsSync(zipPath)) {
    return { success: false, error: 'Backup file not found' };
  }

  // We need to close the DB before replacing it.
  // The cleanest approach is to restart the app after restore.
  // For now: read the zip, extract to temp dir, validate, then replace.
  try {
    const zipData = readFileSync(zipPath);

    // Very simple ZIP reader — parse local file headers
    const extracted = new Map<string, Buffer>();
    let pos = 0;
    while (pos < zipData.length - 4) {
      const sig = zipData.readUInt32LE(pos);
      if (sig !== 0x04034b50) break; // not a local file header

      const compression = zipData.readUInt16LE(pos + 8);
      const compressedSize = zipData.readUInt32LE(pos + 18);
      const uncompressedSize = zipData.readUInt32LE(pos + 22);
      const nameLen = zipData.readUInt16LE(pos + 26);
      const extraLen = zipData.readUInt16LE(pos + 28);
      const name = zipData.slice(pos + 30, pos + 30 + nameLen).toString('utf-8');
      const dataStart = pos + 30 + nameLen + extraLen;
      const compressedData = zipData.slice(dataStart, dataStart + compressedSize);

      let fileData: Buffer;
      if (compression === 0) {
        fileData = compressedData;
      } else if (compression === 8) {
        const { inflateRawSync } = await import('node:zlib');
        fileData = inflateRawSync(compressedData);
      } else {
        return { success: false, error: `Unsupported ZIP compression method: ${compression}` };
      }

      extracted.set(name, fileData);
      pos = dataStart + compressedSize;
    }

    if (!extracted.has('ledger.db')) {
      return { success: false, error: 'Not a valid Ledger backup (missing ledger.db)' };
    }

    // Write to a staging directory first
    const stageDir = join(dataDir, '.restore-stage');
    if (existsSync(stageDir)) rmSync(stageDir, { recursive: true });
    mkdirSync(stageDir, { recursive: true });

    for (const [name, data] of extracted) {
      const dest = join(stageDir, name);
      mkdirSync(join(stageDir, name.includes('/') ? name.split('/').slice(0, -1).join('/') : '.'), { recursive: true });
      writeFileSync(dest, data);
    }

    // Close the live DB connection before touching the file — required on Windows
    // where the SQLite file is locked while open. Also ensures no in-flight writes
    // are lost to the old database after the swap.
    closeDatabase();

    // Swap in — copy staged db over the live db
    const liveDb = join(dataDir, 'ledger.db');
    const stagedDb = join(stageDir, 'ledger.db');
    const backupOriginal = liveDb + '.pre-restore';
    if (existsSync(liveDb)) renameSync(liveDb, backupOriginal);
    cpSync(stagedDb, liveDb);

    // Copy screenshots
    const stagedScreenshots = join(stageDir, 'screenshots');
    if (existsSync(stagedScreenshots)) {
      const liveScreenshots = join(dataDir, 'screenshots');
      if (existsSync(liveScreenshots)) renameSync(liveScreenshots, liveScreenshots + '.pre-restore');
      cpSync(stagedScreenshots, liveScreenshots, { recursive: true });
    }

    rmSync(stageDir, { recursive: true });

    // Reopen the database against the newly restored file.
    const schemaPath = app.isPackaged
      ? join(process.resourcesPath, 'schema.sql')
      : join(process.cwd(), 'schema.sql');
    await initializeDatabase(liveDb, schemaPath);

    log.info(`backup: restored from ${zipPath}`);
    return { success: true };
  } catch (err) {
    log.error('backup: restore failed', err);
    return { success: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────
// IPC registration
// ─────────────────────────────────────────────────────────────

export function registerBackupHandlers(ctx: IpcContext): void {
  // Derive config path from the authoritative data directory (ctx.config.data_dir),
  // which matches where electron/main.ts's atomicSaveConfig actually writes
  // config.json. Using app.getPath('userData') would resolve to %APPDATA%/FXLedger
  // (from productName) on fresh v1.1 installs, but config lives in
  // %APPDATA%/Ledger because main.ts uses DATA_FOLDER_NAME = 'Ledger'.
  const configPath = join(ctx.config.data_dir, 'config.json');

  ipcMain.removeHandler('backup:now');
  ipcMain.removeHandler('backup:list');
  ipcMain.removeHandler('backup:restore');

  ipcMain.handle('backup:now', async () => {
    try {
      return await createBackup(ctx.config.data_dir, configPath);
    } catch (err) {
      log.error('backup:now', err);
      throw err;
    }
  });

  ipcMain.handle('backup:list', () => {
    try {
      return listBackups(ctx.config.data_dir);
    } catch (err) {
      log.error('backup:list', err);
      throw err;
    }
  });

  ipcMain.handle('backup:restore', async (_e, zipPath: string) => {
    try {
      return await restoreBackup(zipPath, ctx.config.data_dir);
    } catch (err) {
      log.error('backup:restore', err);
      return { success: false, error: String(err) };
    }
  });
}
