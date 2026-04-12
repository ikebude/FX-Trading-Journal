/**
 * Instruments IPC handlers.
 *
 * H-7 fix: when pip_size or contract_size changes on an existing instrument,
 * all trades for that symbol are recomputed so the stored netPips / rMultiple /
 * netPnl values stay consistent with the new contract spec.
 */

import { ipcMain } from 'electron';
import log from 'electron-log/main.js';
import { eq } from 'drizzle-orm';

import { listInstruments, upsertInstrument, getInstrument } from '../../src/lib/db/queries';
import { getDb } from '../../src/lib/db/client';
import { trades } from '../../src/lib/db/schema';
import { UpsertInstrumentSchema } from '../../src/lib/schemas';
import { recomputeAndSaveTrade } from './trades';

export function registerInstrumentHandlers(): void {
  ipcMain.handle('instruments:list', async () => {
    try {
      return await listInstruments();
    } catch (err) {
      log.error('instruments:list', err);
      throw new Error('Failed to load instruments');
    }
  });

  ipcMain.handle('instruments:upsert', async (_e, data: unknown) => {
    try {
      const parsed = UpsertInstrumentSchema.parse(data);

      // H-7: detect pip_size / contract_size change before writing so we know
      // whether to cascade a recompute across all trades for this symbol.
      const existing = await getInstrument(parsed.symbol);
      const pipSizeChanged =
        existing != null &&
        (existing.pipSize !== parsed.pipSize ||
          existing.contractSize !== parsed.contractSize);

      await upsertInstrument({
        symbol: parsed.symbol,
        displayName: parsed.displayName ?? null,
        assetClass: parsed.assetClass,
        baseCurrency: parsed.baseCurrency ?? null,
        quoteCurrency: parsed.quoteCurrency ?? null,
        pipSize: parsed.pipSize,
        contractSize: parsed.contractSize,
        digits: parsed.digits,
        isActive: true,
      });

      if (pipSizeChanged) {
        log.info(
          `instruments:upsert: pip_size/contract_size changed for ${parsed.symbol} — ` +
          `recomputing all trades`,
        );
        const db = getDb();
        const affectedTrades = await db
          .select({ id: trades.id })
          .from(trades)
          .where(eq(trades.symbol, parsed.symbol));

        // Recompute sequentially to avoid hammering the DB
        for (const { id } of affectedTrades) {
          await recomputeAndSaveTrade(id);
        }

        log.info(
          `instruments:upsert: recomputed ${affectedTrades.length} trades for ${parsed.symbol}`,
        );
      }
    } catch (err) {
      log.error('instruments:upsert', err);
      throw new Error('Failed to save instrument');
    }
  });
}
