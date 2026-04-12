import { ipcMain } from 'electron';
import log from 'electron-log/main.js';

import { getReview, listReviews, upsertReview } from '../../src/lib/db/queries';
import { UpsertReviewSchema } from '../../src/lib/schemas';
import type { Review } from '../../src/lib/db/schema';

export function registerReviewHandlers(): void {
  ipcMain.handle('reviews:list', async (_e, kind: Review['kind']) => {
    try {
      return await listReviews(kind);
    } catch (err) {
      log.error('reviews:list', err);
      throw new Error('Failed to load reviews');
    }
  });

  ipcMain.handle('reviews:get', async (_e, id: string) => {
    try {
      return await getReview(id);
    } catch (err) {
      log.error('reviews:get', err);
      throw new Error('Failed to load review');
    }
  });

  ipcMain.handle('reviews:upsert', async (_e, data: unknown) => {
    try {
      const parsed = UpsertReviewSchema.parse(data);
      return await upsertReview({
        accountId: parsed.accountId,
        kind: parsed.kind,
        periodStartUtc: parsed.periodStartUtc,
        periodEndUtc: parsed.periodEndUtc,
        followedPlan: parsed.followedPlan ?? null,
        biggestWin: parsed.biggestWin ?? null,
        biggestMistake: parsed.biggestMistake ?? null,
        improvement: parsed.improvement ?? null,
        patternWinners: parsed.patternWinners ?? null,
        patternLosers: parsed.patternLosers ?? null,
        strategyAdjust: parsed.strategyAdjust ?? null,
        moodScore: parsed.moodScore ?? null,
        disciplineScore: parsed.disciplineScore ?? null,
        energyScore: parsed.energyScore ?? null,
      });
    } catch (err) {
      log.error('reviews:upsert', err);
      throw new Error('Failed to save review');
    }
  });
}
