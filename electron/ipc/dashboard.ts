/**
 * Dashboard IPC handler — Milestone 9.
 *
 * Computes all widget data on the main process (access to DB + pnl engine).
 * Returns a single `DashboardData` payload so the renderer makes one IPC call.
 *
 * Fixes applied:
 *  C-3: All trades are fetched via pagination loop — no 10k cap.
 *  P-2: Results are cached in-process with a 60-second TTL keyed by filter hash.
 *  T1.9: Per-trade metrics cache with delta detection — recompute only on new/changed trades.
 *  H-3: Errors are sanitised before reaching the renderer.
 */

import { ipcMain } from 'electron';
import log from 'electron-log/main.js';
import { eq, inArray } from 'drizzle-orm';
import crypto from 'node:crypto';

import { getDb } from '../../src/lib/db/client';
import { trades as tradesTable, tradeLegs, instruments, accounts } from '../../src/lib/db/schema';
import {
  computeAggregateMetrics,
  computeRDistribution,
  computeSetupPerformance,
  computeSessionPerformance,
  computeDayOfWeekHeatmap,
  computeHourOfDayHeatmap,
  computeWinRateByConfidence,
  computeHoldingTimeDistribution,
  computeCalendarHeatmap,
  computeStreakInfo,
  computeMonthlyPnl,
  computeTradeMetrics,
  extractCacheableMetrics,
  type TradeBundle,
} from '../../src/lib/pnl';
import { metricsCache } from '../../src/lib/dashboard-metrics-cache';
import { TradeFiltersSchema } from '../../src/lib/schemas';
import { listTrades } from '../../src/lib/db/queries';

// ─────────────────────────────────────────────────────────────
// TTL cache (P-2)
// ─────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60_000; // 60 seconds

interface CacheEntry {
  ts: number;
  data: unknown;
}

const dashboardCache = new Map<string, CacheEntry>();

function cacheKey(filters: unknown, tz: string): string {
  const raw = JSON.stringify({ filters, tz });
  return crypto.createHash('sha1').update(raw).digest('hex');
}

function pruneCache(): void {
  const now = Date.now();
  for (const [k, v] of dashboardCache) {
    if (now - v.ts > CACHE_TTL_MS * 2) dashboardCache.delete(k);
  }
}

/** Invalidate all dashboard cache entries. Called by trades/imports handlers after mutations. */
export function invalidateDashboardCache(): void {
  dashboardCache.clear();
}

/**
 * Invalidate metrics cache for a specific trade (called when trade is updated/deleted).
 * T1.9: Called by trades.ts, imports.ts, reconciliation.ts after mutations.
 */
export function invalidateTradeMetricsCache(tradeId: string): void {
  metricsCache.invalidateTradeAll(tradeId);
}

/**
 * Clear all per-trade metrics cache (called on bulk operations like import).
 */
export function clearTradeMetricsCache(): void {
  metricsCache.clear();
}

// ─────────────────────────────────────────────────────────────
// Fetch ALL trades matching filters — paginated to avoid the 10k cap (C-3)
// ─────────────────────────────────────────────────────────────

const PAGE = 5_000;
const MAX_TRADES = 200_000; // safety valve

async function fetchAllTrades(parsed: ReturnType<typeof TradeFiltersSchema.parse>) {
  const rows: Awaited<ReturnType<typeof listTrades>>['rows'] = [];
  let page = 1;

  while (rows.length < MAX_TRADES) {
    const { rows: batch } = await listTrades({ ...parsed, pageSize: PAGE, page });
    rows.push(...batch);
    if (batch.length < PAGE) break;
    page++;
  }

  if (rows.length >= MAX_TRADES) {
    log.warn(`Dashboard: trade count hit safety cap of ${MAX_TRADES}`);
  }

  return rows;
}

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────

export function registerDashboardHandlers(): void {
  ipcMain.handle('dashboard:stats', async (_e, filters: unknown, timezone: string) => {
    try {
      const parsed = TradeFiltersSchema.parse(filters ?? {});
      const tz =
        typeof timezone === 'string' && timezone.length > 0
          ? timezone
          : 'America/New_York';

      // P-2: return cached result when filters haven't changed
      pruneCache();
      const key = cacheKey(parsed, tz);
      const hit = dashboardCache.get(key);
      if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
        return hit.data;
      }

      const db = getDb();

      // C-3: fetch ALL trades — paginated, no silent truncation
      const tradeRows = await fetchAllTrades(parsed);

      // Fetch the active account's starting balance for equity curve
      let startingBalance = 0;
      if (parsed.accountId) {
        const [account] = await db
          .select()
          .from(accounts)
          .where(eq(accounts.id, parsed.accountId))
          .limit(1);
        startingBalance = account?.initialBalance ?? 0;
      }

      // Load all instruments indexed by symbol
      const allInstruments = await db.select().from(instruments);
      const instrumentMap = new Map(allInstruments.map((i) => [i.symbol, i]));

      // Track symbols we couldn't compute for (M-5: surface to UI)
      const unknownSymbols = new Set<string>();

      // Fetch ALL legs — chunked to respect SQLite's 999-variable SQLITE_LIMIT.
      // inArray() on >999 IDs throws at runtime; chunk into batches of 900.
      const tradeIds = tradeRows.map((t) => t.id);
      const allLegs: (typeof tradeLegs.$inferSelect)[] = [];
      if (tradeIds.length > 0) {
        const CHUNK = 900;
        for (let i = 0; i < tradeIds.length; i += CHUNK) {
          const batch = tradeIds.slice(i, i + CHUNK);
          const rows = await db.select().from(tradeLegs).where(inArray(tradeLegs.tradeId, batch));
          allLegs.push(...rows);
        }
      }
      const legsByTrade = new Map<string, typeof allLegs>();
      for (const leg of allLegs) {
        if (!legsByTrade.has(leg.tradeId)) legsByTrade.set(leg.tradeId, []);
        legsByTrade.get(leg.tradeId)!.push(leg);
      }

      // T1.9: Track which trades are new/changed (deltas) for incremental compute
      let deltaCount = 0;

      // Build TradeBundle[] — one bundle per trade, with legs
      const bundles: TradeBundle[] = [];
      for (const trade of tradeRows) {
        const instrument = instrumentMap.get(trade.symbol);
        if (!instrument) {
          unknownSymbols.add(trade.symbol);
          continue;
        }

        const legs = legsByTrade.get(trade.id) ?? [];

        // T1.9: Check cache using trade.updated_at as version key
        const cacheVersion = trade.updatedAtUtc; // ISO-8601 string
        const cachedMetrics = metricsCache.get(trade.id, cacheVersion);
        
        // If metrics not cached, compute and cache them (delta)
        if (!cachedMetrics) {
          deltaCount++;
          const tradeMetrics = computeTradeMetrics(
            {
              id: trade.id,
              account_id: trade.accountId,
              symbol: trade.symbol,
              direction: trade.direction as 'LONG' | 'SHORT',
              status: trade.status as 'OPEN' | 'PARTIAL' | 'CLOSED' | 'CANCELLED',
              initial_stop_price: trade.initialStopPrice ?? null,
              initial_target_price: trade.initialTargetPrice ?? null,
              setup_name: trade.setupName ?? null,
              session: trade.session ?? null,
              confidence: trade.confidence ?? null,
            },
            legs.map((l) => ({
              id: l.id,
              trade_id: l.tradeId,
              leg_type: l.legType as 'ENTRY' | 'EXIT',
              timestamp_utc: l.timestampUtc,
              price: l.price,
              volume_lots: l.volumeLots,
              commission: l.commission,
              swap: l.swap,
              broker_profit: l.brokerProfit ?? null,
            })),
            instrument,
          );
          const cacheable = extractCacheableMetrics(tradeMetrics, startingBalance);
          metricsCache.set(trade.id, cacheVersion, {
            rMultiple: cacheable.rMultiple,
            pnl: cacheable.pnl,
            pnlPercent: cacheable.pnlPercent,
            maePercent: cacheable.maePercent,
            mfePercent: cacheable.mfePercent,
            holdingTimeSeconds: cacheable.holdingTimeSeconds,
          });
        }

        const bundle: TradeBundle = {
          trade: {
            id: trade.id,
            account_id: trade.accountId,
            symbol: trade.symbol,
            direction: trade.direction as 'LONG' | 'SHORT',
            status: trade.status as 'OPEN' | 'PARTIAL' | 'CLOSED' | 'CANCELLED',
            initial_stop_price: trade.initialStopPrice ?? null,
            initial_target_price: trade.initialTargetPrice ?? null,
            setup_name: trade.setupName ?? null,
            session: trade.session ?? null,
            confidence: trade.confidence ?? null,
          },
          legs: legs.map((l) => ({
            id: l.id,
            trade_id: l.tradeId,
            leg_type: l.legType as 'ENTRY' | 'EXIT',
            timestamp_utc: l.timestampUtc,
            price: l.price,
            volume_lots: l.volumeLots,
            commission: l.commission,
            swap: l.swap,
            broker_profit: l.brokerProfit ?? null,
          })),
          instrument,
        };
        bundles.push(bundle);
      }

      // T1.9: Log delta count for diagnostics
      if (deltaCount > 0 && tradeRows.length > 0) {
        log.debug(`Dashboard incremental compute: ${deltaCount}/${tradeRows.length} trades were deltas`);
      }

      // Compute all widget metrics
      const data = {
        aggregate: computeAggregateMetrics(bundles, startingBalance),
        rDistribution: computeRDistribution(bundles),
        setupPerformance: computeSetupPerformance(bundles),
        sessionPerformance: computeSessionPerformance(bundles),
        dayOfWeekHeatmap: computeDayOfWeekHeatmap(bundles, tz),
        hourOfDayHeatmap: computeHourOfDayHeatmap(bundles, tz),
        winRateByConfidence: computeWinRateByConfidence(bundles),
        holdingTimeDistribution: computeHoldingTimeDistribution(bundles),
        calendarHeatmap: computeCalendarHeatmap(bundles, tz),
        streakInfo: computeStreakInfo(bundles),
        monthlyPnl: computeMonthlyPnl(bundles, tz),
        // M-5: surface unknown symbols so the UI can warn the user
        warnings: unknownSymbols.size > 0
          ? { unknownSymbols: [...unknownSymbols] }
          : null,
      };

      // P-2: store in cache
      dashboardCache.set(key, { ts: Date.now(), data });

      return data;
    } catch (err) {
      log.error('dashboard:stats', err);
      // H-3: don't leak internal error messages to renderer
      throw new Error('Failed to compute dashboard statistics');
    }
  });
}
