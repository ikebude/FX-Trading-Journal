/**
 * Mood check-in IPC handlers — T3.7
 *
 * Standalone, optional wellness data. Independent of `reviews`. Not a trade
 * mutation, so no audit_log row (Rule 14 does not apply). Drizzle only.
 */

import { ipcMain } from 'electron';
import log from 'electron-log/main.js';
import { randomUUID } from 'node:crypto';
import { eq, desc } from 'drizzle-orm';
import { getDb } from '../../src/lib/db/client';
import { moodCheckins } from '../../src/lib/db/schema';
import { MoodCheckinSchema } from '../../src/lib/schemas';

export function registerMoodHandlers(): void {
  ipcMain.removeHandler('mood:checkin');
  ipcMain.handle(
    'mood:checkin',
    async (
      _e,
      payload: { accountId?: string | null; moodScore: number; note?: string | null },
    ) => {
      try {
        const parsed = MoodCheckinSchema.parse(payload);
        const db = getDb();
        const id = randomUUID();
        const now = new Date().toISOString();

        await db.insert(moodCheckins).values({
          id,
          accountId: parsed.accountId ?? null,
          moodScore: parsed.moodScore,
          note: parsed.note ?? null,
          checkedInAtUtc: now,
          createdAtUtc: now,
        });

        return { id, ...parsed, checkedInAtUtc: now };
      } catch (err) {
        log.error('mood:checkin', err);
        throw err;
      }
    },
  );

  ipcMain.removeHandler('mood:list');
  ipcMain.handle(
    'mood:list',
    async (_e, { accountId }: { accountId?: string | null } = {}) => {
      try {
        const db = getDb();
        const base = db.select().from(moodCheckins);
        const rows = accountId
          ? await base
              .where(eq(moodCheckins.accountId, accountId))
              .orderBy(desc(moodCheckins.checkedInAtUtc))
          : await base.orderBy(desc(moodCheckins.checkedInAtUtc));
        return rows;
      } catch (err) {
        log.error('mood:list', err);
        throw err;
      }
    },
  );
}
