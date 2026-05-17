/**
 * Rituals IPC handlers — T3.6
 *
 * Manages pre-trade ritual checklists per account/setup.
 */

import { ipcMain } from 'electron';
import log from 'electron-log/main.js';
import { randomUUID } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../../src/lib/db/client';
import { rituals, tradeReflections } from '../../src/lib/db/schema';
import { RitualSchema, ReflectionSchema } from '../../src/lib/schemas';

// ─────────────────────────────────────────────────────────────
// Ritual CRUD
// ─────────────────────────────────────────────────────────────

export function registerRitualHandlers(): void {
  ipcMain.handle('rituals:list', async (_e, { accountId }: { accountId: string }) => {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(rituals)
        .where(eq(rituals.accountId, accountId));
      return rows.map((r) => ({
        ...r,
        items: JSON.parse(r.items),
      }));
    } catch (err) {
      log.error('rituals:list', err);
      throw err;
    }
  });

  ipcMain.handle(
    'rituals:create',
    async (
      _e,
      {
        accountId,
        name,
        setupName,
        items,
      }: {
        accountId: string;
        name: string;
        setupName?: string | null;
        items: Array<{ id: string; text: string; optional?: boolean }>;
      },
    ) => {
      try {
        // Validate input
        const parsed = RitualSchema.parse({ name, setupName, items });

        const db = getDb();
        const id = randomUUID();
        const now = new Date().toISOString();

        await db.insert(rituals).values({
          id,
          accountId,
          name: parsed.name,
          setupName: parsed.setupName || null,
          items: JSON.stringify(parsed.items),
          isActive: true,
          createdAtUtc: now,
          updatedAtUtc: now,
        });

        return { id, accountId, name: parsed.name, setupName: parsed.setupName, items: parsed.items };
      } catch (err) {
        log.error('rituals:create', err);
        throw err;
      }
    },
  );

  ipcMain.handle(
    'rituals:update',
    async (
      _e,
      {
        id,
        name,
        setupName,
        items,
        isActive,
      }: {
        id: string;
        name?: string;
        setupName?: string | null;
        items?: Array<{ id: string; text: string; optional?: boolean }>;
        isActive?: boolean;
      },
    ) => {
      try {
        const db = getDb();
        const now = new Date().toISOString();

        const updates: any = { updatedAtUtc: now };
        if (name !== undefined) updates.name = name;
        if (setupName !== undefined) updates.setupName = setupName || null;
        if (items !== undefined) updates.items = JSON.stringify(items);
        if (isActive !== undefined) updates.isActive = isActive;

        await db.update(rituals).set(updates).where(eq(rituals.id, id));

        return { success: true };
      } catch (err) {
        log.error('rituals:update', err);
        throw err;
      }
    },
  );

  ipcMain.handle('rituals:delete', async (_e, { id }: { id: string }) => {
    try {
      const db = getDb();
      await db.delete(rituals).where(eq(rituals.id, id));
      return { success: true };
    } catch (err) {
      log.error('rituals:delete', err);
      throw err;
    }
  });
}

// ─────────────────────────────────────────────────────────────
// Trade Reflections
// ─────────────────────────────────────────────────────────────

export function registerReflectionHandlers(): void {
  ipcMain.handle(
    'reflections:get-for-trade',
    async (_e, { tradeId }: { tradeId: string }) => {
      try {
        const db = getDb();
        const row = await db
          .select()
          .from(tradeReflections)
          .where(eq(tradeReflections.tradeId, tradeId))
          .limit(1);
        return row[0] || null;
      } catch (err) {
        log.error('reflections:get-for-trade', err);
        throw err;
      }
    },
  );

  ipcMain.handle(
    'reflections:create-or-update',
    async (_e, { tradeId, reflection }: { tradeId: string; reflection: string }) => {
      try {
        // Validate
        const parsed = ReflectionSchema.parse({ reflection });

        const db = getDb();
        const now = new Date().toISOString();

        // Check if reflection exists
        const existing = await db
          .select()
          .from(tradeReflections)
          .where(eq(tradeReflections.tradeId, tradeId))
          .limit(1);

        if (existing.length > 0) {
          // Update
          await db
            .update(tradeReflections)
            .set({
              reflection: parsed.reflection,
              reflectedAtUtc: now,
            })
            .where(eq(tradeReflections.tradeId, tradeId));
          return { id: existing[0].id, tradeId, reflection: parsed.reflection };
        } else {
          // Create
          const id = randomUUID();
          await db.insert(tradeReflections).values({
            id,
            tradeId,
            reflection: parsed.reflection,
            reflectedAtUtc: now,
          });
          return { id, tradeId, reflection: parsed.reflection };
        }
      } catch (err) {
        log.error('reflections:create-or-update', err);
        throw err;
      }
    },
  );

  ipcMain.handle('reflections:list-unrefected', async (_e, { hoursBack = 48 }: { hoursBack?: number }) => {
    try {
      const db = getDb();
      const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

      // Get closed trades without reflections in the last N hours
      const rows = await db.select().from(tradeReflections).limit(1000);
      const reflectedTradeIds = new Set(rows.map((r) => r.tradeId));

      // This is a simplified approach — in a full implementation, you'd
      // use a LEFT JOIN in SQL to get unrefected closed trades directly.
      // For now, we return the list of trades to check client-side.
      return { reflectedTradeIds, cutoff };
    } catch (err) {
      log.error('reflections:list-unrefected', err);
      throw err;
    }
  });
}
