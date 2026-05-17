import { describe, it, expect } from 'vitest';
import { generateCoaching, type CoachingTrade } from '../src/lib/coaching';

const t = (o: Partial<CoachingTrade>): CoachingTrade => ({
  closedAtUtc: '2026-04-01T10:00:00Z',
  netPnl: 0,
  rMultiple: 0,
  ...o,
});

describe('generateCoaching — T6.4', () => {
  it('no insights for an empty / open-only day', () => {
    expect(generateCoaching([])).toEqual([]);
    expect(generateCoaching([t({ closedAtUtc: null, netPnl: null })])).toEqual([]);
  });

  it('flags cutting winners short', () => {
    const ins = generateCoaching([
      t({ netPnl: 10, rMultiple: 0.4 }),
      t({ netPnl: 12, rMultiple: 0.5 }),
      t({ netPnl: 30, rMultiple: 2 }),
      t({ netPnl: 8, rMultiple: 0.3 }),
    ]);
    expect(ins.find((i) => i.id === 'cut-winners-short')).toBeTruthy();
  });

  it('flags overtrading at 10+ trades', () => {
    const day = Array.from({ length: 11 }, (_, i) =>
      t({ netPnl: i % 2 ? 5 : -5, closedAtUtc: `2026-04-01T1${i}:00:00Z` }),
    );
    expect(generateCoaching(day).some((i) => i.id === 'overtrading')).toBe(true);
  });

  it('flags a 3+ loss streak in close-time order', () => {
    const ins = generateCoaching([
      t({ netPnl: -5, closedAtUtc: '2026-04-01T10:00:00Z' }),
      t({ netPnl: -5, closedAtUtc: '2026-04-01T11:00:00Z' }),
      t({ netPnl: -5, closedAtUtc: '2026-04-01T12:00:00Z' }),
      t({ netPnl: 20, closedAtUtc: '2026-04-01T13:00:00Z' }),
    ]);
    expect(ins.find((i) => i.id === 'loss-streak')).toBeTruthy();
  });

  it('flags trading while anxious', () => {
    const ins = generateCoaching([
      t({ netPnl: 5, anxietyLevel: 8 }),
      t({ netPnl: -5, anxietyLevel: 9 }),
      t({ netPnl: 5, anxietyLevel: 2 }),
    ]);
    expect(ins.some((i) => i.id === 'high-anxiety')).toBe(true);
  });

  it('gives positive reinforcement on a clean green day', () => {
    const ins = generateCoaching([
      t({ netPnl: 20, rMultiple: 2 }),
      t({ netPnl: 25, rMultiple: 2.5 }),
      t({ netPnl: -5, rMultiple: -0.5 }),
    ]);
    expect(ins).toHaveLength(1);
    expect(ins[0].id).toBe('disciplined-day');
    expect(ins[0].severity).toBe('info');
  });
});
