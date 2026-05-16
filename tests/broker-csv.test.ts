/**
 * T4.1+ — Broker CSV dialect fixtures.
 *
 * Parametrized over every file in tests/fixtures/broker-csv/*.csv. Each
 * fixture is routed through detectAndParse() exactly as a real import would
 * be. Drop a new {broker}.csv in and it is covered automatically.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detectAndParse } from '../src/lib/importers/detect';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, 'fixtures', 'broker-csv');
const fixtures = readdirSync(DIR).filter((f) => f.endsWith('.csv'));

describe('broker CSV dialects', () => {
  it('has at least one fixture', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const file of fixtures) {
    describe(file, () => {
      const content = readFileSync(join(DIR, file), 'utf-8');
      const { format, result } = detectAndParse(content, file);

      it('detects CSV format', () => {
        expect(format).toBe('CSV');
      });

      it('parses at least one trade', () => {
        expect(result.trades.length).toBeGreaterThan(0);
      });

      it('never drops more rows than it keeps', () => {
        expect(result.failed.length).toBeLessThanOrEqual(result.trades.length);
      });

      it('every trade has a symbol, a direction and ≥1 leg', () => {
        for (const t of result.trades) {
          expect(t.symbol).toBeTruthy();
          expect(['LONG', 'SHORT']).toContain(t.direction);
          expect(t.legs.length).toBeGreaterThan(0);
        }
      });
    });
  }
});

describe('cTrader dialect specifics (T4.1)', () => {
  const content = readFileSync(join(DIR, 'ctrader.csv'), 'utf-8');
  const { result } = detectAndParse(content, 'ctrader.csv');

  it('parses all 5 cTrader rows', () => {
    expect(result.trades.length).toBe(5);
    expect(result.failed.length).toBe(0);
  });

  it('maps direction from the cTrader "Direction" column', () => {
    const eur = result.trades.find((t) => t.symbol === 'EURUSD');
    const gbp = result.trades.find((t) => t.symbol === 'GBPUSD');
    expect(eur?.direction).toBe('LONG');
    expect(gbp?.direction).toBe('SHORT');
  });

  it('parses UTC timestamps into ISO-8601 Z', () => {
    const eur = result.trades.find((t) => t.symbol === 'EURUSD')!;
    expect(eur.legs[0].timestampUtc).toMatch(/^2026-04-01T08:15:00\.000Z$/);
  });
});

describe('MatchTrader / DXtrade dialects (T4.2)', () => {
  it('MatchTrader (semicolon-delimited) parses all rows', () => {
    const c = readFileSync(join(DIR, 'matchtrader.csv'), 'utf-8');
    const { format, result } = detectAndParse(c, 'matchtrader.csv');
    expect(format).toBe('CSV');
    expect(result.trades.length).toBe(4);
    expect(result.failed.length).toBe(0);
    expect(result.trades.find((t) => t.symbol === 'US30')?.direction).toBe('SHORT');
  });

  it('DXtrade ("B/S", "Fill Price", ISO-Z) parses all rows', () => {
    const c = readFileSync(join(DIR, 'dxtrade.csv'), 'utf-8');
    const { format, result } = detectAndParse(c, 'dxtrade.csv');
    expect(format).toBe('CSV');
    expect(result.trades.length).toBe(3);
    expect(result.failed.length).toBe(0);
    const eur = result.trades.find((t) => t.symbol === 'EURUSD')!;
    expect(eur.direction).toBe('LONG');
    expect(eur.legs[0].timestampUtc).toMatch(/^2026-04-01T08:00:00\.000Z$/);
  });
});
