/**
 * Leg IPC handlers.
 *
 * H-1 fix: per-trade operation queue ensures that leg mutations and the
 * subsequent P&L recomputation are serialized per trade. If a bridge event
 * fires while a user is editing fills, they queue up instead of racing.
 */

import { ipcMain } from 'electron';
import log from 'electron-log/main.js';
import { eq } from 'drizzle-orm';

import {
  createLeg,
  deleteLeg,
  listLegs,
  updateLeg,
} from '../../src/lib/db/queries';
import { getDb } from '../../src/lib/db/client';
import { tradeLegs } from '../../src/lib/db/schema';
import { CreateLegSchema, UpdateLegSchema } from '../../src/lib/schemas';
import { recomputeAndSaveTrade } from './trades';
import { invalidateDashboardCache } from './dashboard';

// ─────────────────────────────────────────────────────────────
// Per-trade serialization queue (H-1)
// ─────────────────────────────────────────────────────────────

/** Pending operation chain per trade ID. Prevents concurrent recompute races. */
const tradeOpQueue = new Map<string, Promise<void>>();

/**
 * Enqueue an async operation for a specific trade.
 * All operations for the same tradeId are executed in FIFO order.
 */
function enqueue(tradeId: string, fn: () => Promise<void>): Promise<void> {
  const prev = tradeOpQueue.get(tradeId) ?? Promise.resolve();
  // Single execution: tracked holds the promise for fn(); next adds error handling.
  // Previously both `next` and `tracked` were independent `.then(fn)` chains on
  // `prev`, causing fn() to execute twice. Now they share one execution.
  const tracked = prev.then(fn);
  const next = tracked.catch((err) => {
    log.error(`enqueue error for trade ${tradeId}:`, err);
  });
  tradeOpQueue.set(tradeId, next);
  next.finally(() => {
    if (tradeOpQueue.get(tradeId) === next) tradeOpQueue.delete(tradeId);
  });
  return tracked;
}

// ─────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────

export function registerLegHandlers(): void {
  ipcMain.handle('legs:list-for-trade', async (_e, tradeId: string) => {
    try {
      return await listLegs(tradeId);
    } catch (err) {
      log.error('legs:list-for-trade', err);
      throw new Error('Failed to load fills');
    }
  });

  ipcMain.handle('legs:create', async (_e, data: unknown) => {
    try {
      const parsed = CreateLegSchema.parse(data);
      let result: Awaited<ReturnType<typeof createLeg>> | undefined;

      await enqueue(parsed.tradeId, async () => {
        result = await createLeg({
          tradeId: parsed.tradeId,
          legType: parsed.legType,
          timestampUtc: parsed.timestampUtc,
          price: parsed.price,
          volumeLots: parsed.volumeLots,
          commission: parsed.commission,
          swap: parsed.swap,
          brokerProfit: parsed.brokerProfit ?? null,
          externalDealId: parsed.externalDealId ?? null,
          notes: parsed.notes ?? null,
        });
        await recomputeAndSaveTrade(parsed.tradeId);
      });

      invalidateDashboardCache();
      return result;
    } catch (err) {
      log.error('legs:create', err);
      throw new Error('Failed to add fill');
    }
  });

  ipcMain.handle('legs:update', async (_e, id: string, patch: unknown) => {
    try {
      const parsed = UpdateLegSchema.parse(patch);
      // Need tradeId before enqueuing — fetch it first
      const rows = await getDb()
        .select({ tradeId: tradeLegs.tradeId })
        .from(tradeLegs)
        .where(eq(tradeLegs.id, id))
        .limit(1);
      const tradeId = rows[0]?.tradeId;
      if (!tradeId) throw new Error(`Leg ${id} not found`);

      let result: Awaited<ReturnType<typeof updateLeg>> | undefined;

      await enqueue(tradeId, async () => {
        result = await updateLeg(id, parsed);
        await recomputeAndSaveTrade(tradeId);
      });

      invalidateDashboardCache();
      return result;
    } catch (err) {
      log.error('legs:update', err);
      throw new Error('Failed to update fill');
    }
  });

  ipcMain.handle('legs:delete', async (_e, id: string) => {
    try {
      const rows = await getDb()
        .select({ tradeId: tradeLegs.tradeId })
        .from(tradeLegs)
        .where(eq(tradeLegs.id, id))
        .limit(1);
      const tradeId = rows[0]?.tradeId;
      if (!tradeId) return; // already gone

      await enqueue(tradeId, async () => {
        await deleteLeg(id);
        await recomputeAndSaveTrade(tradeId);
      });

      invalidateDashboardCache();
    } catch (err) {
      log.error('legs:delete', err);
      throw new Error('Failed to delete fill');
    }
  });
}
