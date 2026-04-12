/**
 * Timezone and trading session detection.
 *
 * RULE: never hardcode UTC offsets. Always go through IANA timezones via date-fns-tz.
 * London/NY DST shifts on different dates — fixed offsets break the journal twice a year.
 */

import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

export type Session =
  | 'SYDNEY'
  | 'TOKYO'
  | 'LONDON'
  | 'NY_AM'
  | 'NY_PM'
  | 'LONDON_CLOSE'
  | 'ASIAN_RANGE'
  | 'OFF_HOURS';

/**
 * Detect the trading session for a given UTC timestamp.
 *
 * Sessions are defined in NY local time (America/New_York) so they shift
 * correctly with DST. Overlap windows favour the more specific (later in
 * the chain) session — NY AM beats London on the 8–11 am NY overlap.
 */
export function detectSession(timestampUtc: string | Date): Session {
  const date = typeof timestampUtc === 'string' ? new Date(timestampUtc) : timestampUtc;

  // T6-1: Single formatInTimeZone call — all session boundaries fall on whole hours,
  // so sub-hour precision doesn't change any session assignment.
  const nyHour = parseInt(formatInTimeZone(date, 'America/New_York', 'H'), 10);

  // Sessions defined in NY local time so DST is handled automatically.
  // The order of these checks matters — the most specific (kill-zone) wins overlaps.
  // Coverage: 0-1=TOKYO, 2-7=LONDON, 8-10=NY_AM, 11-12=LONDON_CLOSE,
  //           13-15=NY_PM, 16=OFF_HOURS, 17-18=SYDNEY, 19-23=TOKYO.
  if (nyHour >= 8  && nyHour < 11) return 'NY_AM';
  if (nyHour >= 13 && nyHour < 16) return 'NY_PM';
  // T1-3: Extended to nyHour < 13 (was < 12). Hour 12 (12:00-12:59 NY) was
  // falling through to OFF_HOURS, corrupting session analytics.
  if (nyHour >= 11 && nyHour < 13) return 'LONDON_CLOSE';
  if (nyHour >= 2  && nyHour < 8)  return 'LONDON';
  if (nyHour >= 19 || nyHour < 2)  return 'TOKYO';
  if (nyHour >= 17 && nyHour < 19) return 'SYDNEY';
  // Hour 16 (16:00-16:59): post-NY PM quiet period — intentionally OFF_HOURS.
  return 'OFF_HOURS';
}

/** Format a UTC ISO timestamp for display in the user's chosen IANA timezone. */
export function formatForDisplay(
  timestampUtc: string,
  displayTz: string,
  pattern = 'yyyy-MM-dd HH:mm:ss',
): string {
  return formatInTimeZone(new Date(timestampUtc), displayTz, pattern);
}

/** Convert a UTC ISO timestamp to a Date in the display timezone. */
export function toDisplayDate(timestampUtc: string, displayTz: string): Date {
  return toZonedTime(new Date(timestampUtc), displayTz);
}

/** Get the day-of-week index (0 = Sunday … 6 = Saturday) in the display timezone. */
export function dayOfWeekInTz(timestampUtc: string, displayTz: string): number {
  const dayNum = parseInt(
    formatInTimeZone(new Date(timestampUtc), displayTz, 'i'),
    10,
  );
  // ISO returns 1=Mon..7=Sun; convert to 0=Sun..6=Sat
  return dayNum === 7 ? 0 : dayNum;
}

/** Get the hour-of-day (0-23) in the display timezone. */
export function hourOfDayInTz(timestampUtc: string, displayTz: string): number {
  return parseInt(formatInTimeZone(new Date(timestampUtc), displayTz, 'H'), 10);
}
