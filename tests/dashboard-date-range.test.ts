/**
 * Regression test for v1.0.2 dashboard-not-loading bug.
 *
 * Dashboard built a filter object whose `dateFrom`/`dateTo` were `YYYY-MM-DD`
 * strings, but `TradeFiltersSchema.utcString` requires a full ISO-8601
 * datetime (`YYYY-MM-DDTHH:MM:SS...`). Zod rejected every non-"All" preset,
 * the handler caught the error, and the UI showed "Failed to load dashboard
 * data." on every fresh install (default preset is `30d`).
 */

import { describe, expect, it } from 'vitest';
import {
  getDashboardDateRange,
  type DashboardPreset,
} from '../src/lib/dashboard-presets';
import { TradeFiltersSchema } from '../src/lib/schemas';

const PRESETS: DashboardPreset[] = ['7d', '30d', '90d', 'ytd', 'all'];

describe('getDashboardDateRange', () => {
  for (const preset of PRESETS) {
    it(`preset "${preset}" produces values accepted by TradeFiltersSchema`, () => {
      const range = getDashboardDateRange(preset);
      expect(() => TradeFiltersSchema.parse(range)).not.toThrow();
    });
  }

  it('non-"all" presets include both dateFrom and dateTo', () => {
    for (const preset of PRESETS.filter((p) => p !== 'all')) {
      const range = getDashboardDateRange(preset);
      expect(range.dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(range.dateTo).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    }
  });

  it('"all" preset returns empty range', () => {
    expect(getDashboardDateRange('all')).toEqual({});
  });

  it('dateFrom precedes dateTo for relative presets', () => {
    for (const preset of ['7d', '30d', '90d', 'ytd'] as DashboardPreset[]) {
      const { dateFrom, dateTo } = getDashboardDateRange(preset);
      expect(new Date(dateFrom!).getTime()).toBeLessThan(new Date(dateTo!).getTime());
    }
  });

  it('7d range spans exactly 7 days back', () => {
    const now = new Date('2026-04-18T12:00:00.000Z');
    const range = getDashboardDateRange('7d', now);
    expect(range.dateFrom).toBe('2026-04-11T00:00:00.000Z');
    expect(range.dateTo).toBe('2026-04-18T23:59:59.999Z');
  });
});
