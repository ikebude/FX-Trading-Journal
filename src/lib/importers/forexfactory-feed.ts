/**
 * ForexFactory Feed Fetcher
 *
 * T1.10: Fetches the ForexFactory economic calendar CSV from public feed.
 * This is the only network call (outside auto-update) permitted by Hard Rule #11.
 *
 * ForexFactory publishes a free weekly CSV that can be fetched via:
 * https://www.forexfactory.com/calendar.php?week=YYYYMMDD&format=csv
 *
 * Format: CSV with headers: Date, Time, Currency, Impact, Detail, Forecast, Previous, Actual
 */

import log from 'electron-log/main.js';

/**
 * Fetch the current week's economic calendar from ForexFactory.
 *
 * @returns Promise<string> - Raw CSV content
 * @throws Error if fetch fails or response is invalid
 */
export async function fetchNewsEventsFromForexFactory(): Promise<string> {
  try {
    // T1.10: Compute week start date (Monday of current week)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // adjust when day is Sunday
    const monday = new Date(now.setDate(diff));
    const weekDateStr = monday.toISOString().slice(0, 10).replace(/-/g, '');

    const url = `https://www.forexfactory.com/calendar.php?week=${weekDateStr}&format=csv`;

    log.info(`Calendar: fetching ForexFactory feed for week starting ${weekDateStr}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'FXLedger/1.1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`ForexFactory responded with status ${response.status}`);
      }
      const csv = await response.text();

      if (!csv || csv.length === 0) {
        throw new Error('ForexFactory CSV is empty');
      }

      // Basic validation: CSV should have "Date" and "Currency" headers
      if (!csv.includes('Date') || !csv.includes('Currency')) {
        log.warn('Calendar: ForexFactory CSV missing expected headers');
      }

      log.info(`Calendar: fetched ${csv.length} bytes from ForexFactory`);

      return csv;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error('Calendar: ForexFactory fetch failed:', msg);
    throw new Error(`Failed to fetch ForexFactory calendar: ${msg}`);
  }
}
