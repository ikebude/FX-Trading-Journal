/**
 * Voice memo IPC — T6.1
 *
 * Records (renderer MediaRecorder) → bytes sent here → saved under
 * <data_dir>/voice/<tradeId>/<id>.webm (relative path stored, Rule 7).
 * Auto-transcription is model-gated: a local Whisper model under
 * <data_dir>/models/whisper/ is used if present; otherwise the memo is
 * saved with a null transcript and the user can type one. No network.
 */
import { ipcMain } from 'electron';
import log from 'electron-log/main.js';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { eq } from 'drizzle-orm';
import { getDb } from '../../src/lib/db/client';
import { voiceMemos } from '../../src/lib/db/schema';
import {
  transcriptionStatus,
  type TranscriptionGateInput,
} from '../../src/lib/transcription';
import type { IpcContext } from './index';

const WHISPER_MODEL_REL = join('models', 'whisper', 'ggml-base.en.bin');

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB — a 60s memo is ~1 MB
/** Trade ids are randomUUID; reject anything that could traverse paths. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

function assertWithinDataDir(dataDir: string, p: string): void {
  const safe = resolve(dataDir);
  if (!p.startsWith(safe + sep) && p !== safe) {
    throw new Error('Access denied: path is outside the data directory');
  }
}

function gate(dataDir: string, enabled: boolean): TranscriptionGateInput {
  let enginePresent = false;
  try {
    require.resolve('nodejs-whisper');
    enginePresent = true;
  } catch {
    enginePresent = false;
  }
  return {
    enabled,
    enginePresent,
    modelPresent: existsSync(resolve(dataDir, WHISPER_MODEL_REL)),
  };
}

async function tryTranscribe(dataDir: string, absAudioPath: string): Promise<string | null> {
  try {
    // Lazy, optional — never bundled into the renderer; absence is fine.
    // Indirected specifier so TS/bundler don't hard-resolve an optional dep.
    const spec = 'nodejs-whisper';
    const mod = (await import(/* @vite-ignore */ spec)) as unknown as {
      nodewhisper: (p: string, o: Record<string, unknown>) => Promise<string>;
    };
    const out = await mod.nodewhisper(absAudioPath, {
      modelName: 'base.en',
      autoDownloadModelName: undefined, // never auto-download (Rule 11)
    });
    return typeof out === 'string' ? out.trim() : null;
  } catch (err) {
    log.warn('voice: transcription unavailable/failed (non-fatal)', err);
    return null;
  }
}

export function registerVoiceHandlers(ctx: IpcContext): void {
  ipcMain.removeHandler('voice:add');
  ipcMain.handle(
    'voice:add',
    async (
      _e,
      payload: {
        tradeId: string;
        bytes: ArrayBuffer | Uint8Array;
        durationSec?: number;
        transcript?: string | null;
        autoTranscribe?: boolean;
      },
    ) => {
      try {
        // Input validation (parity with other IPC handlers).
        if (!payload || !SAFE_ID.test(String(payload.tradeId ?? ''))) {
          throw new Error('Invalid tradeId');
        }
        const buf = Buffer.from(payload.bytes as Uint8Array);
        if (buf.byteLength === 0 || buf.byteLength > MAX_AUDIO_BYTES) {
          throw new RangeError(
            `Audio size out of range: ${buf.byteLength} bytes (max ${MAX_AUDIO_BYTES})`,
          );
        }
        if (
          payload.transcript != null &&
          (typeof payload.transcript !== 'string' || payload.transcript.length > 20_000)
        ) {
          throw new Error('Invalid transcript');
        }

        const dataDir = ctx.config.data_dir;
        const id = randomUUID();
        const relDir = join('voice', payload.tradeId);
        const relPath = join(relDir, `${id}.webm`);
        const absDir = resolve(dataDir, relDir);
        assertWithinDataDir(dataDir, absDir);
        mkdirSync(absDir, { recursive: true });
        const absPath = resolve(dataDir, relPath);
        assertWithinDataDir(dataDir, absPath);
        writeFileSync(absPath, buf);

        let transcript = payload.transcript ?? null;
        const status = transcriptionStatus(
          gate(dataDir, payload.autoTranscribe !== false),
        );
        if (transcript == null && status === 'available') {
          transcript = await tryTranscribe(dataDir, absPath);
        }

        const now = new Date().toISOString();
        await getDb().insert(voiceMemos).values({
          id,
          tradeId: payload.tradeId,
          audioPath: relPath.replace(/\\/g, '/'),
          transcript,
          durationSec: payload.durationSec ?? null,
          createdAtUtc: now,
        });
        return { id, transcript, transcriptionStatus: status };
      } catch (err) {
        log.error('voice:add', err);
        throw err;
      }
    },
  );

  ipcMain.removeHandler('voice:list');
  ipcMain.handle('voice:list', async (_e, { tradeId }: { tradeId: string }) => {
    try {
      return await getDb()
        .select()
        .from(voiceMemos)
        .where(eq(voiceMemos.tradeId, tradeId));
    } catch (err) {
      log.error('voice:list', err);
      throw err;
    }
  });

  ipcMain.removeHandler('voice:set-transcript');
  ipcMain.handle(
    'voice:set-transcript',
    async (_e, { id, transcript }: { id: string; transcript: string }) => {
      try {
        await getDb()
          .update(voiceMemos)
          .set({ transcript })
          .where(eq(voiceMemos.id, id));
        return { ok: true };
      } catch (err) {
        log.error('voice:set-transcript', err);
        throw err;
      }
    },
  );
}
