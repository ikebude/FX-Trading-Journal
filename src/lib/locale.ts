/**
 * T6.6 — locale / cultural support (pure).
 *
 * Thin, deterministic helpers over Intl plus RTL detection and a small
 * regional market-holiday table. No network; timestamps stay UTC ISO
 * (Rule 2) — only *display* is localised.
 */

const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'dv']);

/** True for right-to-left UI locales (e.g. "ar", "he-IL"). */
export function isRtlLocale(locale: string): boolean {
  const lang = locale.toLowerCase().split('-')[0];
  return RTL_LANGS.has(lang);
}

/** Document direction for a locale. */
export function localeDir(locale: string): 'rtl' | 'ltr' {
  return isRtlLocale(locale) ? 'rtl' : 'ltr';
}

/** Locale-aware number; falls back to a fixed format on bad input. */
export function formatLocaleNumber(
  value: number,
  locale: string,
  opts: Intl.NumberFormatOptions = {},
): string {
  if (!Number.isFinite(value)) return '—';
  try {
    return new Intl.NumberFormat(locale, opts).format(value);
  } catch {
    return new Intl.NumberFormat('en-US', opts).format(value);
  }
}

/** Locale-aware money. */
export function formatLocaleCurrency(
  value: number,
  locale: string,
  currency: string,
): string {
  return formatLocaleNumber(value, locale, { style: 'currency', currency });
}

/** Locale-aware date from a UTC ISO string. */
export function formatLocaleDate(
  iso: string,
  locale: string,
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(locale, opts).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-US', opts).format(d);
  }
}

/**
 * Minimal regional market-holiday table (extensible). Keyed by region;
 * value = set of "MM-DD" fixed-date holidays. Used to annotate the
 * calendar / warn before trading a thin session.
 */
export const REGIONAL_HOLIDAYS: Record<string, Record<string, string>> = {
  US: { '01-01': "New Year's Day", '07-04': 'Independence Day', '12-25': 'Christmas' },
  UK: { '01-01': "New Year's Day", '12-25': 'Christmas', '12-26': 'Boxing Day' },
  EU: { '01-01': "New Year's Day", '05-01': 'Labour Day', '12-25': 'Christmas' },
  JP: { '01-01': 'Ganjitsu', '02-11': 'National Foundation Day', '05-03': 'Constitution Day' },
};

/** Returns the holiday name for a UTC ISO date in a region, or null. */
export function regionalHoliday(iso: string, region: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const mmdd = `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
  return REGIONAL_HOLIDAYS[region]?.[mmdd] ?? null;
}
