import { describe, expect, it } from 'vitest';
import {
  detectSession,
  formatForDisplay,
  dayOfWeekInTz,
  hourOfDayInTz,
  type Session,
} from '../src/lib/tz';

// ─────────────────────────────────────────────────────────────
// Helpers — build a UTC ISO string for a given NY hour
// (2024-03-20 is during NY DST, UTC offset = -4)
// ─────────────────────────────────────────────────────────────

/** Returns a UTC ISO string corresponding to the given NY clock hour on 2024-03-20 (DST active). */
function nyHourUtc(nyHour: number): string {
  // NY is UTC-4 during summer DST
  const utcHour = (nyHour + 4) % 24;
  return `2024-03-20T${String(utcHour).padStart(2, '0')}:30:00.000Z`;
}

/** Returns a UTC ISO string corresponding to the given NY clock hour on 2024-01-15 (no DST, UTC-5). */
function nyHourUtcWinter(nyHour: number): string {
  const utcHour = (nyHour + 5) % 24;
  return `2024-01-15T${String(utcHour).padStart(2, '0')}:00:00.000Z`;
}

// ─────────────────────────────────────────────────────────────
// detectSession — session coverage for all 24 NY hours
// ─────────────────────────────────────────────────────────────

describe('detectSession', () => {
  const HOUR_TO_SESSION: Record<number, Session> = {
    0:  'TOKYO',
    1:  'TOKYO',
    2:  'LONDON',
    3:  'LONDON',
    4:  'LONDON',
    5:  'LONDON',
    6:  'LONDON',
    7:  'LONDON',
    8:  'NY_AM',
    9:  'NY_AM',
    10: 'NY_AM',
    11: 'LONDON_CLOSE',
    12: 'LONDON_CLOSE',
    13: 'NY_PM',
    14: 'NY_PM',
    15: 'NY_PM',
    16: 'OFF_HOURS',
    17: 'SYDNEY',
    18: 'SYDNEY',
    19: 'TOKYO',
    20: 'TOKYO',
    21: 'TOKYO',
    22: 'TOKYO',
    23: 'TOKYO',
  };

  for (const [hour, expected] of Object.entries(HOUR_TO_SESSION)) {
    it(`NY hour ${hour} → ${expected} (DST)`, () => {
      expect(detectSession(nyHourUtc(Number(hour)))).toBe(expected);
    });
  }

  it('accepts a Date object, not just a string', () => {
    const date = new Date(nyHourUtc(10));
    expect(detectSession(date)).toBe('NY_AM');
  });

  describe('winter (no DST)', () => {
    it('NY hour 8 → NY_AM in winter', () => {
      expect(detectSession(nyHourUtcWinter(8))).toBe('NY_AM');
    });

    it('NY hour 12 → LONDON_CLOSE in winter (not OFF_HOURS)', () => {
      expect(detectSession(nyHourUtcWinter(12))).toBe('LONDON_CLOSE');
    });

    it('NY hour 16 → OFF_HOURS in winter', () => {
      expect(detectSession(nyHourUtcWinter(16))).toBe('OFF_HOURS');
    });

    it('NY hour 17 → SYDNEY in winter', () => {
      expect(detectSession(nyHourUtcWinter(17))).toBe('SYDNEY');
    });
  });

  describe('boundary conditions', () => {
    it('hour 11 is LONDON_CLOSE, not NY_AM', () => {
      expect(detectSession(nyHourUtc(11))).toBe('LONDON_CLOSE');
    });

    it('hour 13 is NY_PM, not LONDON_CLOSE', () => {
      expect(detectSession(nyHourUtc(13))).toBe('NY_PM');
    });

    it('hour 2 is LONDON, not TOKYO', () => {
      expect(detectSession(nyHourUtc(2))).toBe('LONDON');
    });

    it('hour 8 is NY_AM, not LONDON', () => {
      expect(detectSession(nyHourUtc(8))).toBe('NY_AM');
    });

    it('hour 19 is TOKYO, not SYDNEY', () => {
      expect(detectSession(nyHourUtc(19))).toBe('TOKYO');
    });
  });
});

// ─────────────────────────────────────────────────────────────
// formatForDisplay
// ─────────────────────────────────────────────────────────────

describe('formatForDisplay', () => {
  const utcIso = '2024-03-20T14:30:00.000Z';

  it('formats in London timezone (UTC+0 in March, pre-BST)', () => {
    // 2024-03-20 is before BST switch (last Sunday of March = 2024-03-31)
    const result = formatForDisplay(utcIso, 'Europe/London');
    expect(result).toBe('2024-03-20 14:30:00');
  });

  it('formats in New York timezone', () => {
    // UTC-4 during DST
    const result = formatForDisplay(utcIso, 'America/New_York');
    expect(result).toBe('2024-03-20 10:30:00');
  });

  it('accepts a custom pattern', () => {
    const result = formatForDisplay(utcIso, 'America/New_York', 'yyyy-MM-dd');
    expect(result).toBe('2024-03-20');
  });

  it('formats in Tokyo timezone (UTC+9, no DST)', () => {
    const result = formatForDisplay(utcIso, 'Asia/Tokyo');
    expect(result).toBe('2024-03-20 23:30:00');
  });
});

// ─────────────────────────────────────────────────────────────
// dayOfWeekInTz
// ─────────────────────────────────────────────────────────────

describe('dayOfWeekInTz', () => {
  // 2024-03-20 is a Wednesday
  const utcWed = '2024-03-20T12:00:00.000Z';

  it('returns 3 (Wednesday) in UTC', () => {
    expect(dayOfWeekInTz(utcWed, 'UTC')).toBe(3);
  });

  it('returns 0 (Sunday) for 2024-03-17', () => {
    expect(dayOfWeekInTz('2024-03-17T12:00:00.000Z', 'UTC')).toBe(0);
  });

  it('returns 1 (Monday) for 2024-03-18', () => {
    expect(dayOfWeekInTz('2024-03-18T12:00:00.000Z', 'UTC')).toBe(1);
  });

  it('returns 6 (Saturday) for 2024-03-16', () => {
    expect(dayOfWeekInTz('2024-03-16T12:00:00.000Z', 'UTC')).toBe(6);
  });

  it('timezone shift can change the day', () => {
    // 2024-03-20T01:00Z = 2024-03-19 in NY (UTC-5 winter)
    const result = dayOfWeekInTz('2024-01-16T01:00:00.000Z', 'America/New_York');
    // 2024-01-16 UTC = 2024-01-15 NY → Monday
    expect(result).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────
// hourOfDayInTz
// ─────────────────────────────────────────────────────────────

describe('hourOfDayInTz', () => {
  it('returns hour in UTC', () => {
    expect(hourOfDayInTz('2024-03-20T09:00:00.000Z', 'UTC')).toBe(9);
  });

  it('returns NY hour (DST, UTC-4)', () => {
    // 14:00 UTC = 10:00 NY
    expect(hourOfDayInTz('2024-03-20T14:00:00.000Z', 'America/New_York')).toBe(10);
  });

  it('returns Tokyo hour (UTC+9)', () => {
    // 00:00 UTC = 09:00 Tokyo
    expect(hourOfDayInTz('2024-03-20T00:00:00.000Z', 'Asia/Tokyo')).toBe(9);
  });

  it('returns 23 for 23:30', () => {
    expect(hourOfDayInTz('2024-03-20T23:30:00.000Z', 'UTC')).toBe(23);
  });
});
