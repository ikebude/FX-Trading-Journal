import { ipcMain } from 'electron';
import log from 'electron-log/main.js';

import {
  addTagsToTrade,
  bulkUpdateTrades,
  clearSampleData,
  createLeg,
  createTrade,
  getTrade,
  hardDeleteTrades,
  listTrades,
  restoreTrades,
  searchTrades,
  softDeleteTrades,
  updateTrade,
  getInstrument,
} from '../../src/lib/db/queries';
import { computeTradeMetrics } from '../../src/lib/pnl';
import {
  CreateTradeSchema,
  QuickTradeSchema,
  TradeFiltersSchema,
  UpdateTradeSchema,
} from '../../src/lib/schemas';
import { detectSession } from '../../src/lib/tz';

export function registerTradeHandlers(): void {
  ipcMain.handle('trades:list', async (_e, filters: unknown) => {
    try {
      const parsed = TradeFiltersSchema.parse(filters ?? {});
      return await listTrades(parsed);
    } catch (err) {
      log.error('trades:list', err);
      throw new Error('Failed to load trades');
    }
  });

  ipcMain.handle('trades:get', async (_e, id: string) => {
    try {
      return await getTrade(id);
    } catch (err) {
      log.error('trades:get', err);
      throw new Error('Failed to load trade');
    }
  });

  ipcMain.handle('trades:create', async (_e, data: unknown) => {
    try {
      const parsed = CreateTradeSchema.parse(data);

      // Detect session from entry leg timestamp if provided
      let session: string | undefined;
      if (parsed.entryLeg?.timestampUtc) {
        session = detectSession(new Date(parsed.entryLeg.timestampUtc));
      }

      const trade = await createTrade({
        accountId: parsed.accountId,
        symbol: parsed.symbol.toUpperCase(),
        direction: parsed.direction,
        status: 'OPEN',
        initialStopPrice: parsed.initialStopPrice ?? null,
        initialTargetPrice: parsed.initialTargetPrice ?? null,
        plannedRr: parsed.plannedRr ?? null,
        plannedRiskAmount: parsed.plannedRiskAmount ?? null,
        plannedRiskPct: parsed.plannedRiskPct ?? null,
        setupName: parsed.setupName ?? null,
        session: session ?? null,
        marketCondition: parsed.marketCondition ?? null,
        entryModel: parsed.entryModel ?? null,
        confidence: parsed.confidence ?? null,
        preTradeEmotion: parsed.preTradeEmotion ?? null,
        postTradeEmotion: null,
        openedAtUtc: parsed.entryLeg?.timestampUtc ?? null,
        closedAtUtc: null,
        netPnl: null,
        netPips: null,
        rMultiple: null,
        totalCommission: 0,
        totalSwap: 0,
        weightedAvgEntry: null,
        weightedAvgExit: null,
        totalEntryVolume: 0,
        totalExitVolume: 0,
        externalTicket: parsed.externalTicket ?? null,
        externalPositionId: parsed.externalPositionId ?? null,
        source: parsed.source,
        deletedAtUtc: null,
        isSample: false,
      });

      // If an entry leg was provided, insert it and recompute metrics
      if (parsed.entryLeg) {
        await createLeg({
          tradeId: trade.id,
          legType: 'ENTRY',
          timestampUtc: parsed.entryLeg.timestampUtc,
          price: parsed.entryLeg.price,
          volumeLots: parsed.entryLeg.volumeLots,
          commission: parsed.entryLeg.commission,
          swap: parsed.entryLeg.swap,
          brokerProfit: null,
          externalDealId: null,
          notes: null,
        });
        await recomputeAndSaveTrade(trade.id);
      }

      return await getTrade(trade.id);
    } catch (err) {
      log.error('trades:create', err);
      throw new Error('Failed to create trade');
    }
  });

  ipcMain.handle('trades:update', async (_e, id: string, patch: unknown) => {
    try {
      const parsed = UpdateTradeSchema.parse(patch);
      await updateTrade(id, parsed as Parameters<typeof updateTrade>[1]);
      await recomputeAndSaveTrade(id);
      return await getTrade(id);
    } catch (err) {
      log.error('trades:update', err);
      throw new Error('Failed to update trade');
    }
  });

  ipcMain.handle('trades:soft-delete', async (_e, ids: string[]) => {
    try {
      await softDeleteTrades(ids);
    } catch (err) {
      log.error('trades:soft-delete', err);
      throw new Error('Failed to delete trades');
    }
  });

  ipcMain.handle('trades:restore', async (_e, ids: string[]) => {
    try {
      await restoreTrades(ids);
    } catch (err) {
      log.error('trades:restore', err);
      throw new Error('Failed to restore trades');
    }
  });

  ipcMain.handle('trades:permanently-delete', async (_e, ids: string[]) => {
    try {
      await hardDeleteTrades(ids);
    } catch (err) {
      log.error('trades:permanently-delete', err);
      throw new Error('Failed to permanently delete trades');
    }
  });

  ipcMain.handle('trades:bulk-update', async (_e, ids: string[], patch: unknown) => {
    try {
      await bulkUpdateTrades(ids, patch as Parameters<typeof bulkUpdateTrades>[1]);
    } catch (err) {
      log.error('trades:bulk-update', err);
      throw new Error('Failed to bulk update trades');
    }
  });

  ipcMain.handle('trades:bulk-add-tags', async (_e, ids: string[], tagIds: number[]) => {
    try {
      for (const id of ids) {
        await addTagsToTrade(id, tagIds);
      }
    } catch (err) {
      log.error('trades:bulk-add-tags', err);
      throw new Error('Failed to add tags to trades');
    }
  });

  ipcMain.handle('trades:search', async (_e, query: string) => {
    try {
      const ids = await searchTrades(query);
      if (!ids.length) return { rows: [], total: 0 };
      // Fetch full TradeRow data for the matched IDs
      return await listTrades({
        ids,
        page: 1,
        pageSize: 100,
        sortBy: 'opened_at_utc',
        sortDir: 'desc',
        includeDeleted: false,
        deletedOnly: false,
        includeSample: false,
      });
    } catch (err) {
      log.error('trades:search', err);
      throw new Error('Failed to search trades');
    }
  });

  ipcMain.handle('trades:clear-sample', async () => {
    try {
      const count = await clearSampleData();
      return { count };
    } catch (err) {
      log.error('trades:clear-sample', err);
      throw new Error('Failed to clear sample trades');
    }
  });

  ipcMain.handle('trades:aggregate', async (_e, filters: unknown) => {
    // Aggregate stats: win rate, avg R, total P&L — used by dashboard.
    // Milestone 9 will flesh this out; returns stub for now.
    try {
      const parsed = TradeFiltersSchema.parse(filters ?? {});
      const { rows } = await listTrades({ ...parsed, pageSize: 5000, page: 1 });
      const closed = rows.filter((t) => t.status === 'CLOSED');
      const wins = closed.filter((t) => (t.netPnl ?? 0) > 0);
      const totalPnl = closed.reduce((s, t) => s + (t.netPnl ?? 0), 0);
      const avgR = closed.length
        ? closed.reduce((s, t) => s + (t.rMultiple ?? 0), 0) / closed.length
        : null;
      const winRate = closed.length ? wins.length / closed.length : null;
      return { totalPnl, avgR, winRate, tradeCount: closed.length };
    } catch (err) {
      log.error('trades:aggregate', err);
      throw new Error('Failed to aggregate trade stats');
    }
  });
}

// ─────────────────────────────────────────────────────────────
// Recompute P&L metrics after any leg change
// ─────────────────────────────────────────────────────────────

export async function recomputeAndSaveTrade(tradeId: string): Promise<void> {
  const detail = await getTrade(tradeId);
  if (!detail) return;

  const instrument = await getInstrument(detail.symbol);
  if (!instrument) {
    log.warn(`recomputeAndSaveTrade: unknown symbol ${detail.symbol}`);
    return;
  }

  try {
    const tradePnlInput = {
      id: detail.id,
      account_id: detail.accountId,
      symbol: detail.symbol,
      direction: detail.direction,
      status: detail.status,
      initial_stop_price: detail.initialStopPrice ?? null,
      initial_target_price: detail.initialTargetPrice ?? null,
    };
    const legsInput = detail.legs.map((l) => ({
      id: l.id,
      trade_id: l.tradeId,
      leg_type: l.legType,
      timestamp_utc: l.timestampUtc,
      price: l.price,
      volume_lots: l.volumeLots,
      commission: l.commission,
      swap: l.swap,
      broker_profit: l.brokerProfit ?? null,
    }));
    const metrics = computeTradeMetrics(tradePnlInput, legsInput, instrument);

    await updateTrade(tradeId, {
      status: metrics.status,
      netPnl: metrics.netPnl,
      netPips: metrics.netPips,
      rMultiple: metrics.rMultiple,
      totalCommission: metrics.totalCommission,
      totalSwap: metrics.totalSwap,
      weightedAvgEntry: metrics.weightedAvgEntry,
      weightedAvgExit: metrics.weightedAvgExit,
      totalEntryVolume: metrics.totalEntryVolume,
      totalExitVolume: metrics.totalExitVolume,
      openedAtUtc: metrics.openedAtUtc ?? detail.openedAtUtc,
      closedAtUtc: metrics.closedAtUtc ?? null,
    });
  } catch (err) {
    log.error(`recomputeAndSaveTrade: P&L computation failed for ${tradeId}`, err);
  }
}
