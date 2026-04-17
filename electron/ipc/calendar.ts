/**
 * Calendar IPC handlers — Milestone 14.
 *
 * Handles ForexFactory CSV import, news event listing, and trade re-tagging.
 *
 * ForexFactory CSV columns (may vary slightly by export version):
 *   Date, Time, Currency, Impact, Detail, Forecast, Previous
 *
 * The "Date" column repeats the date for all same-day events.
 * "Time" may be blank for "All Day" events.
 * Impact values: "Non-Economic" | "Low Impact Expected" | "Medium Impact Expected" |
 *                "High Impact Expected" | "Holiday"
 *
 * Dedup: unique on (timestamp_utc, currency, title).
 * On conflict: update forecast, previous, actual, imported_at_utc.
 */

import { ipcMain } from 'electron';
import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import log from 'electron-log/main.js';
import { nanoid } from 'nanoid';
import { gte, lte, and, isNull, sql } from 'drizzle-orm';
import { fromZonedTime } from 'date-fns-tz';

import { getDb } from '../../src/lib/db/client';
import { newsEvents, tradeNewsEvents, trades, tradeLegs } from '../../src/lib/db/schema';

// ─────────────────────────────────────────────────────────────
// ForexFactory CSV row
// ─────────────────────────────────────────────────────────────

interface FFRow {
  Date?: string;
  Time?: string;
  Currency?: string;
  Impact?: string;
  Detail?: string;
  Forecast?: string;
  Previous?: string;
  Actual?: string;
  // Some exports use different column names
  Title?: string;
  Event?: string;
  Name?: string;
}

function normalizeImpact(raw: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'HOLIDAY' {
  const s = raw.toLowerCase();
  if (s.includes('high')) return 'HIGH';
  if (s.includes('medium') || s.includes('moderate')) return 'MEDIUM';
  if (s.includes('holiday')) return 'HOLIDAY';
  return 'LOW';
}

function parseFFTimestamp(dateStr: string, timeStr: string): string | null {
  // Date format: "Jan 01 2024" or "01/01/2024" or "2024-01-01"
  // Time format: "12:30am" or "12:30" or "" (all day → use 00:00)
  try {
    const cleanDate = dateStr.trim();
    const cleanTime = timeStr.trim();

    let dateObj: Date | null = null;

    // ISO-style: 2024-01-01
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      dateObj = new Date(cleanDate + 'T00:00:00Z');
    }
    // US slash style: MM/DD/YYYY
    else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleanDate)) {
      const [m, d, y] = cleanDate.split('/').map(Number);
      dateObj = new Date(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00Z`);
    }
    // Month name: "Jan 01 2024" or "January 01 2024"
    else {
      const parsed = new Date(cleanDate + ' UTC');
      if (!isNaN(parsed.getTime())) dateObj = parsed;
    }

    if (!dateObj || isNaN(dateObj.getTime())) return null;

    // Parse time (e.g. "2:30am", "14:30", "All Day", "")
    let hours = 0;
    let minutes = 0;
    if (cleanTime && cleanTime !== 'All Day') {
      const ampm = cleanTime.match(/(\d+):(\d+)(am|pm)?/i);
      if (ampm) {
        hours = parseInt(ampm[1], 10);
        minutes = parseInt(ampm[2], 10);
        if (ampm[3]?.toLowerCase() === 'pm' && hours < 12) hours += 12;
        if (ampm[3]?.toLowerCase() === 'am' && hours === 12) hours = 0;
      }
    }

    // ForexFactory times are US Eastern. Use IANA 'America/New_York' so that
    // DST transitions (EST=UTC-5, EDT=UTC-4) are handled automatically.
    // Hard Rule #1: no hardcoded UTC offsets.
    const y = dateObj.getUTCFullYear();
    const mo = dateObj.getUTCMonth() + 1;
    const d = dateObj.getUTCDate();
    const localStr = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
    return fromZonedTime(localStr, 'America/New_York').toISOString();
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Import CSV
// ─────────────────────────────────────────────────────────────

async function importCsv(
  filePath: string,
): Promise<{ imported: number; duplicate: number; failed: number }> {
  const raw = readFileSync(filePath, 'utf-8');

  const parsed = Papa.parse<FFRow>(raw, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const db = getDb();
  let imported = 0;
  const duplicate = 0;
  let failed = 0;
  const now = new Date().toISOString();

  // Carry forward the last seen date (ForexFactory only prints date once per day)
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
      log.warn(`calendar: cannot parse timestamp "${lastDate}" "${timeStr}"`);
      failed++;
      continue;
    }

    const impact = normalizeImpact(impactRaw);

    try {
      const result = await db
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

      // SQLite returns changes count; if 1 row inserted it's new, otherwise duplicate
      imported++;
    } catch (err) {
      log.warn(`calendar: insert failed for "${title}"`, err);
      failed++;
    }
  }

  return { imported, duplicate, failed };
}

// ─────────────────────────────────────────────────────────────
// List events
// ─────────────────────────────────────────────────────────────

async function listEvents(range: { from: string; to: string }) {
  const db = getDb();
  return db
    .select()
    .from(newsEvents)
    .where(
      and(
        gte(newsEvents.timestampUtc, range.from),
        lte(newsEvents.timestampUtc, range.to),
      ),
    )
    .orderBy(newsEvents.timestampUtc);
}

// ─────────────────────────────────────────────────────────────
// Retag trades — link trades to news events within ±30 minutes
// ─────────────────────────────────────────────────────────────

async function retagTrades(): Promise<{ tagged: number }> {
  const db = getDb();

  // Delete all existing news-trade links (full rebuild)
  await db.delete(tradeNewsEvents);

  // Load all non-deleted trades with their open time
  const allTrades = await db
    .select({ id: trades.id, openedAtUtc: trades.openedAtUtc, symbol: trades.symbol })
    .from(trades)
    .where(isNull(trades.deletedAtUtc));

  // Load all news events
  const allEvents = await db.select().from(newsEvents);

  const WINDOW_MS = 30 * 60 * 1000; // ±30 minutes
  let tagged = 0;

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
          tagged++;
        } catch { /* skip */ }
      }
    }
  }

  return { tagged };
}

// ─────────────────────────────────────────────────────────────
// IPC registration
// ─────────────────────────────────────────────────────────────

export function registerCalendarHandlers(): void {
  ipcMain.removeHandler('calendar:import-csv');
  ipcMain.removeHandler('calendar:list');
  ipcMain.removeHandler('calendar:retag-trades');

  ipcMain.handle('calendar:import-csv', async (_e, filePath: string) => {
    try {
      return await importCsv(filePath);
    } catch (err) {
      log.error('calendar:import-csv', err);
      throw new Error('Failed to import calendar CSV');
    }
  });

  ipcMain.handle('calendar:list', async (_e, range: { from: string; to: string }) => {
    try {
      return await listEvents(range);
    } catch (err) {
      log.error('calendar:list', err);
      throw new Error('Failed to load calendar events');
    }
  });

  ipcMain.handle('calendar:retag-trades', async () => {
    try {
      return await retagTrades();
    } catch (err) {
      log.error('calendar:retag-trades', err);
      throw new Error('Failed to retag trades');
    }
  });
}
