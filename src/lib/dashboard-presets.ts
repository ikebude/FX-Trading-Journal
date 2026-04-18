/**
 * Dashboard date-range presets.
 *
 * Produces ISO-8601 datetime strings accepted by `TradeFiltersSchema`. The
 * schema's `utcString` requires a full `YYYY-MM-DDTHH:MM:SS...` format — a
 * date-only value is rejected, which caused the v1.0.2 dashboard-not-loading
 * bug (see tests/dashboard-date-range.test.ts).
 */

export type DashboardPreset = '7d' | '30d' | '90d' | 'ytd' | 'all';

export function getDashboardDateRange(
  preset: DashboardPreset,
  now: Date = new Date(),
): { dateFrom?: string; dateTo?: string } {
  if (preset === 'all') return {};

  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const startOfDay = (d: Date) => `${ymd(d)}T00:00:00.000Z`;
  const endOfDay = (d: Date) => `${ymd(d)}T23:59:59.999Z`;

  if (preset === 'ytd') {
    return { dateFrom: `${now.getFullYear()}-01-01T00:00:00.000Z`, dateTo: endOfDay(now) };
  }

  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  return { dateFrom: startOfDay(from), dateTo: endOfDay(now) };
}
