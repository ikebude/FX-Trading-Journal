/**
 * Ledger — Formatting utilities
 *
 * All display formatting lives here. No inline formatting in components.
 * Uses date-fns-tz for timezone-aware display (no hardcoded UTC offsets).
 */

import { formatInTimeZone } from 'date-fns-tz';

// ─────────────────────────────────────────────────────────────
// Currency
// ─────────────────────────────────────────────────────────────

/**
 * Format a monetary value with currency symbol and 2 decimal places.
 * Always shows sign for non-zero values in signed mode.
 */
export function formatCurrency(
  value: number | null | undefined,
  currency = 'USD',
  opts: { signed?: boolean } = {},
): string {
  if (value == null) return '—';
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: opts.signed ? 'always' : 'auto',
  }).format(value);
  return formatted;
}

/**
 * Format a P&L value — always signed, colored by caller via CSS class.
 */
export function formatPnl(value: number | null | undefined, currency = 'USD'): string {
  return formatCurrency(value, currency, { signed: true });
}

// ─────────────────────────────────────────────────────────────
// Pips
// ─────────────────────────────────────────────────────────────

export function formatPips(value: number | null | undefined, decimals = 1): string {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}p`;
}

// ─────────────────────────────────────────────────────────────
// R-multiple
// ─────────────────────────────────────────────────────────────

export function formatR(value: number | null | undefined): string {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}R`;
}

// ─────────────────────────────────────────────────────────────
// Volume / lots
// ─────────────────────────────────────────────────────────────

export function formatLots(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toFixed(2);
}

// ─────────────────────────────────────────────────────────────
// Price
// ─────────────────────────────────────────────────────────────

export function formatPrice(value: number | null | undefined, digits = 5): string {
  if (value == null) return '—';
  return value.toFixed(digits);
}

// ─────────────────────────────────────────────────────────────
// Percentages
// ─────────────────────────────────────────────────────────────

export function formatPct(value: number | null | undefined, decimals = 1): string {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

// ─────────────────────────────────────────────────────────────
// Dates / timestamps
// ─────────────────────────────────────────────────────────────

/**
 * Format a UTC ISO-8601 string for display in the user's chosen timezone.
 * Falls back to browser local time if timezone is invalid.
 */
export function formatDatetime(
  utcString: string | null | undefined,
  timezone: string,
  fmt = 'dd MMM yyyy HH:mm',
): string {
  if (!utcString) return '—';
  try {
    return formatInTimeZone(new Date(utcString), timezone, fmt);
  } catch {
    return utcString.slice(0, 16).replace('T', ' ');
  }
}

export function formatDate(
  utcString: string | null | undefined,
  timezone: string,
): string {
  return formatDatetime(utcString, timezone, 'dd MMM yyyy');
}

export function formatTime(
  utcString: string | null | undefined,
  timezone: string,
): string {
  return formatDatetime(utcString, timezone, 'HH:mm');
}

/**
 * Duration in minutes between two UTC strings.
 */
export function tradeDurationMins(
  openedAtUtc: string | null | undefined,
  closedAtUtc: string | null | undefined,
): string {
  if (!openedAtUtc || !closedAtUtc) return '—';
  const diffMs = new Date(closedAtUtc).getTime() - new Date(openedAtUtc).getTime();
  if (diffMs < 0) return '—';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ─────────────────────────────────────────────────────────────
// Direction badge text
// ─────────────────────────────────────────────────────────────

export function formatDirection(d: 'LONG' | 'SHORT' | null | undefined): string {
  if (!d) return '—';
  return d === 'LONG' ? 'Long' : 'Short';
}

// ─────────────────────────────────────────────────────────────
// Status badge text
// ─────────────────────────────────────────────────────────────

export function formatStatus(
  s: 'OPEN' | 'PARTIAL' | 'CLOSED' | 'CANCELLED' | null | undefined,
): string {
  if (!s) return '—';
  return s.charAt(0) + s.slice(1).toLowerCase();
}

// ─────────────────────────────────────────────────────────────
// Compact number (for dashboard stats)
// ─────────────────────────────────────────────────────────────

export function formatCompact(value: number | null | undefined): string {
  if (value == null) return '—';
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toFixed(2);
}

// ─────────────────────────────────────────────────────────────
// CSS colour helpers (for P&L colouring)
// ─────────────────────────────────────────────────────────────

/** Tailwind class based on sign of a numeric value. */
export function pnlClass(value: number | null | undefined): string {
  if (value == null || value === 0) return 'text-muted-foreground';
  return value > 0 ? 'text-emerald-400' : 'text-rose-400';
}

/** Tailwind class for R-multiple colouring. */
export function rClass(value: number | null | undefined): string {
  return pnlClass(value);
}
