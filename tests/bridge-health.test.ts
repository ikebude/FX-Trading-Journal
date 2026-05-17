import { describe, it, expect } from 'vitest';
import { isForexMarketOpen, evaluateBridgeHealth } from '../src/lib/bridge-health';

describe('isForexMarketOpen — T4.9', () => {
  it('closed all Saturday', () => {
    expect(isForexMarketOpen(new Date('2026-04-04T12:00:00Z'))).toBe(false); // Sat
  });
  it('Sunday opens at 22:00 UTC', () => {
    expect(isForexMarketOpen(new Date('2026-04-05T21:00:00Z'))).toBe(false);
    expect(isForexMarketOpen(new Date('2026-04-05T22:30:00Z'))).toBe(true);
  });
  it('Friday closes at 22:00 UTC', () => {
    expect(isForexMarketOpen(new Date('2026-04-03T21:00:00Z'))).toBe(true);
    expect(isForexMarketOpen(new Date('2026-04-03T22:30:00Z'))).toBe(false);
  });
  it('Wednesday is open', () => {
    expect(isForexMarketOpen(new Date('2026-04-01T03:00:00Z'))).toBe(true);
  });
});

describe('evaluateBridgeHealth — T4.9', () => {
  const wed = new Date('2026-04-01T12:00:00Z'); // market open
  const sat = new Date('2026-04-04T12:00:00Z'); // market closed

  it('not quiet when last file is recent', () => {
    const h = evaluateBridgeHealth({ lastFileAtUtc: '2026-04-01T11:58:00Z', now: wed });
    expect(h.quiet).toBe(false);
  });

  it('quiet when silent past threshold during market hours', () => {
    const h = evaluateBridgeHealth({ lastFileAtUtc: '2026-04-01T11:50:00Z', now: wed });
    expect(h.quiet).toBe(true);
  });

  it('never quiet when the market is closed', () => {
    const h = evaluateBridgeHealth({ lastFileAtUtc: null, now: sat });
    expect(h.quiet).toBe(false);
  });

  it('quiet when market open and never heard from EA', () => {
    expect(evaluateBridgeHealth({ lastFileAtUtc: null, now: wed }).quiet).toBe(true);
  });

  it('computes signed drift and alerts past the limit', () => {
    const h = evaluateBridgeHealth({
      lastFileAtUtc: '2026-04-01T11:59:30Z',
      now: wed,
      serverTimeUtc: '2026-04-01T12:01:00Z', // +60s ahead
    });
    expect(h.driftSeconds).toBe(60);
    expect(h.driftAlert).toBe(true);
  });

  it('no drift alert within tolerance', () => {
    const h = evaluateBridgeHealth({
      lastFileAtUtc: '2026-04-01T11:59:55Z',
      now: wed,
      serverTimeUtc: '2026-04-01T12:00:10Z', // +10s
    });
    expect(h.driftAlert).toBe(false);
    expect(h.driftSeconds).toBe(10);
  });
});
