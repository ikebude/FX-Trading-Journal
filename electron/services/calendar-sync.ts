/**
 * T1.10: ForexFactory Calendar Auto-Sync Service
 *
 * Background service that polls ForexFactory economic calendar CSV every N hours.
 * - Cron-like timer (uses setInterval in main process)
 * - Reuses existing calendar import + retag logic
 * - Runs on startup if enabled in settings
 * - Can be toggled on/off via Settings UI
 * - Interval configurable: 4h / 6h / 12h / 24h (default: 4h)
 *
 * Hard Rule #11: No network calls except auto-update and this calendar sync.
 */

import log from 'electron-log/main.js';
import { fetchNewsEventsFromForexFactory } from '../../src/lib/importers/forexfactory-feed';
import { getDb } from '../../src/lib/db/client';
import { settings as settingsTable } from '../../src/lib/db/schema';
import { eq } from 'drizzle-orm';
import Papa from 'papaparse';
import { nanoid } from 'nanoid';
import { newsEvents, tradeNewsEvents } from '../../src/lib/db/schema';
import { sql } from 'drizzle-orm';

// Import the parsing and import logic from calendar IPC handler
import { parseFFTimestamp, normalizeImpact } from '../ipc/calendar';

// ─────────────────────────────────────────────────────────────
// Service state
// ─────────────────────────────────────────────────────────────

class CalendarSyncService {
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  /**
   * Start the sync service.
   * - Syncs immediately on first call
   * - Then repeats every N hours
   */
  async start(intervalHours: number = 4): Promise<void> {
    if (this.isRunning) {
      log.info('Calendar sync service already running');
      return;
    }

    this.isRunning = true;
    log.info(`Calendar sync service starting (interval: ${intervalHours}h)`);

    // Sync immediately
    await this.syncNow();

    // Then set up recurring sync
    const intervalMs = intervalHours * 60 * 60 * 1000;
    this.syncInterval = setInterval(() => {
      this.syncNow().catch((err) => {
        log.error('Calendar sync error:', err);
      });
    }, intervalMs);
  }

  /**
   * Stop the sync service and clear the timer.
   */
  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.isRunning = false;
    log.info('Calendar sync service stopped');
  }

  /**
   * Perform a single sync cycle.
   * - Fetch CSV from ForexFactory
   * - Parse and insert into DB
   * - Auto-retag trades
   * - Update last-sync timestamp
   */
  async syncNow(): Promise<{ imported: number; failed: number; synced: boolean }> {
    try {
      log.info('Calendar sync: starting fetch from ForexFactory...');

      // T1.10: Fetch ForexFactory CSV (only network call outside auto-update)
      const csv = await fetchNewsEventsFromForexFactory();

      // Parse CSV using papaparse (same as manual import)
      const parsed = Papa.parse<any>(csv, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
      });

      const db = getDb();
      let imported = 0;
      let failed = 0;
      const now = new Date().toISOString();

      // Reuse import logic from calendar.ts handlers
      let lastDate = '';
      for (const row of parsed.data) {
        const dateStr = (row.Date ?? '').trim();
        const timeStr = (row.Time ?? '').trim();
        const currency = (row.Currency ?? '').trim().toUpperCase();
        const impactRaw = (row.Impact ?? '').trim();
        const title = (row.Detail ?? row.Title ?? row.Event ?? row.Name ?? '').trim();
        const forecast = (row.Forecast ?? '').trim() || null;
        const previous = (row.Previous ?? '').trim() || null;
        const actual = (row.Actual ?? '').trim() || null;

        if (dateStr) lastDate = dateStr;

        if (!lastDate || !currency || !title) {
          failed++;
          continue;
        }

        const timestampUtc = parseFFTimestamp(lastDate, timeStr);
        if (!timestampUtc) {
          failed++;
          continue;
        }

        const impact = normalizeImpact(impactRaw);

        try {
          await db
            .insert(newsEvents)
            .values({
              id: nanoid(),
              timestampUtc,
              currency,
              impact,
              title,
              forecast,
              previous,
              actual,
              source: 'FOREXFACTORY_CSV',
              importedAtUtc: now,
            })
            .onConflictDoUpdate({
              target: [newsEvents.timestampUtc, newsEvents.currency, newsEvents.title],
              set: {
                forecast: sql`excluded.forecast`,
                previous: sql`excluded.previous`,
                actual: sql`excluded.actual`,
                importedAtUtc: sql`excluded.imported_at_utc`,
              },
            });

          imported++;
        } catch (err) {
          log.warn(`calendar sync: insert failed for "${title}"`, err);
          failed++;
        }
      }

      // T1.10: Auto-retag trades after sync
      await retagTradesInternal();

      // Update last-sync timestamp in settings
      await db
        .insert(settingsTable)
        .values({
          key: 'calendar_last_sync_utc',
          value: now,
        })
        .onConflictDoUpdate({
          target: [settingsTable.key],
          set: { value: now },
        });

      log.info(`Calendar sync complete: ${imported} imported, ${failed} failed`);

      return { imported, failed, synced: true };
    } catch (err) {
      log.error('Calendar sync failed:', err);
      return { imported: 0, failed: 0, synced: false };
    }
  }

  /**
   * Get current sync status.
   */
  getStatus(): {
    isRunning: boolean;
    lastSyncUtc: string | null;
  } {
    return {
      isRunning: this.isRunning,
      lastSyncUtc: null, // Will be populated from settings
    };
  }
}

// Singleton instance
const calendarSyncService = new CalendarSyncService();

// ─────────────────────────────────────────────────────────────
// Exported functions
// ─────────────────────────────────────────────────────────────

export async function startCalendarSync(intervalHours: number = 4): Promise<void> {
  await calendarSyncService.start(intervalHours);
}

export function stopCalendarSync(): void {
  calendarSyncService.stop();
}

export async function syncCalendarNow(): Promise<{ imported: number; failed: number; synced: boolean }> {
  return await calendarSyncService.syncNow();
}

export function getCalendarSyncStatus(): {
  isRunning: boolean;
  lastSyncUtc: string | null;
} {
  return calendarSyncService.getStatus();
}

/**
 * T1.10: Initialize calendar sync service on app startup.
 * Loads auto-sync settings from database and starts sync if enabled.
 */
export async function initializeCalendarSync(): Promise<void> {
  try {
    const { getDb } = await import('../../src/lib/db/client');
    const { eq } = await import('drizzle-orm');
    const { settings: settingsTable } = await import('../../src/lib/db/schema');

    const db = getDb();
    const enabledRow = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, 'calendar_auto_sync_enabled'))
      .limit(1);
    const intervalRow = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, 'calendar_sync_interval_hours'))
      .limit(1);

    const enabled = enabledRow?.[0]?.value === 'true';
    const intervalHours = parseInt(intervalRow?.[0]?.value ?? '4', 10);

    if (enabled) {
      await startCalendarSync(intervalHours);
      log.info('Calendar auto-sync enabled on startup');
    }
  } catch (err) {
    log.error('Failed to initialize calendar sync', err);
  }
}

/**
 * Internal retag function (avoid circular imports with calendar.ts)
 * Mirrors the retagTrades logic from calendar.ts handlers
 */
async function retagTradesInternal(): Promise<void> {
  const db = getDb();

  // Delete all existing news-trade links (full rebuild)
  await db.delete(tradeNewsEvents);

  // Load all non-deleted trades
  const { trades } = await import('../../src/lib/db/schema');
  const { isNull } = await import('drizzle-orm');
  const allTrades = await db
    .select({ id: trades.id, openedAtUtc: trades.openedAtUtc, symbol: trades.symbol })
    .from(trades)
    .where(isNull(trades.deletedAtUtc));

  // Load all news events
  const allEvents = await db.select().from(newsEvents);

  const WINDOW_MS = 30 * 60 * 1000; // ±30 minutes

  for (const trade of allTrades) {
    if (!trade.openedAtUtc) continue;
    const tradeMs = new Date(trade.openedAtUtc).getTime();
    const symbol = trade.symbol;

    // Extract base currencies from symbol (e.g. EURUSD → EUR, USD)
    const currencies = symbol.length >= 6
      ? [symbol.slice(0, 3), symbol.slice(3, 6)]
      : [symbol.slice(0, 3)];

    for (const event of allEvents) {
      if (!currencies.includes(event.currency)) continue;
      const eventMs = new Date(event.timestampUtc).getTime();
      const offsetMs = tradeMs - eventMs;

      if (Math.abs(offsetMs) <= WINDOW_MS) {
        const offsetMinutes = Math.round(offsetMs / 60000);
        try {
          await db
            .insert(tradeNewsEvents)
            .values({
              tradeId: trade.id,
              newsEventId: event.id,
              minutesOffset: offsetMinutes,
            })
            .onConflictDoNothing();
        } catch { /* skip */ }
      }
    }
  }
}
