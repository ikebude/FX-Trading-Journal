import { describe, it, expect } from 'vitest';
import {
  isRtlLocale,
  localeDir,
  formatLocaleNumber,
  formatLocaleCurrency,
  formatLocaleDate,
  regionalHoliday,
} from '../src/lib/locale';

describe('RTL — T6.6', () => {
  it('detects RTL languages incl. region subtags', () => {
    expect(isRtlLocale('ar')).toBe(true);
    expect(isRtlLocale('he-IL')).toBe(true);
    expect(isRtlLocale('en-US')).toBe(false);
    expect(localeDir('fa')).toBe('rtl');
    expect(localeDir('de')).toBe('ltr');
  });
});

describe('locale formatting — T6.6', () => {
  it('formats numbers per locale and guards non-finite', () => {
    expect(formatLocaleNumber(1234.5, 'en-US')).toBe('1,234.5');
    expect(formatLocaleNumber(1234.5, 'de-DE')).toBe('1.234,5');
    expect(formatLocaleNumber(NaN, 'en-US')).toBe('—');
  });
  it('formats currency', () => {
    expect(formatLocaleCurrency(1000, 'en-US', 'USD')).toContain('1,000');
  });
  it('formats a UTC ISO date and guards bad input', () => {
    expect(formatLocaleDate('2026-04-01T00:00:00Z', 'en-US', { dateStyle: 'short' })).toMatch(
      /4\/1\/26|04\/01\/2026|4\/1\/2026/,
    );
    expect(formatLocaleDate('not-a-date', 'en-US')).toBe('—');
  });
});

describe('regional holidays — T6.6', () => {
  it('looks up a fixed-date holiday by region', () => {
    expect(regionalHoliday('2026-12-25T00:00:00Z', 'US')).toBe('Christmas');
    expect(regionalHoliday('2026-12-26T00:00:00Z', 'UK')).toBe('Boxing Day');
    expect(regionalHoliday('2026-03-14T00:00:00Z', 'US')).toBeNull();
    expect(regionalHoliday('2026-12-25T00:00:00Z', 'ZZ')).toBeNull();
  });
});
