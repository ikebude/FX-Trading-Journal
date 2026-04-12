import { describe, expect, it } from 'vitest';
import { normalizeHeader, matchHeaders, scoreHeaderMatch } from '../src/lib/importers/headers';
import { parseMt4Html } from '../src/lib/importers/mt4-html';
import { parseMt5Html } from '../src/lib/importers/mt5-html';

// ─────────────────────────────────────────────────────────────
// normalizeHeader
// ─────────────────────────────────────────────────────────────

describe('normalizeHeader', () => {
  it('lowercases input', () => {
    expect(normalizeHeader('SYMBOL')).toBe('symbol');
  });

  it('trims leading/trailing whitespace', () => {
    expect(normalizeHeader('  profit  ')).toBe('profit');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeHeader('open  time')).toBe('open time');
  });

  it('replaces non-breaking space with regular space', () => {
    expect(normalizeHeader('open\u00a0time')).toBe('open time');
  });

  it('replaces punctuation with a space (T6-4)', () => {
    // Em-dash should become a space, not be deleted
    expect(normalizeHeader('Pos\u2013ID')).toBe('pos id');
  });

  it('does not delete forward slash (used in buy/sell)', () => {
    expect(normalizeHeader('buy/sell')).toBe('buy/sell');
  });

  it('preserves forward slash so "S / L" stays as "s / l"', () => {
    // The regex allows / through (used in "buy/sell"), so "S / L" → "s / l"
    expect(normalizeHeader('S / L')).toBe('s / l');
  });
});

// ─────────────────────────────────────────────────────────────
// matchHeaders
// ─────────────────────────────────────────────────────────────

describe('matchHeaders', () => {
  it('maps a standard MT4 header row', () => {
    const headers = ['Ticket', 'Open Time', 'Type', 'Lots', 'Symbol', 'Price', 'Price', 'S / L', 'T / P', 'Close Time', 'Commission', 'Swap', 'Profit'];
    const result = matchHeaders(headers);
    expect(result.has('ticket')).toBe(true);
    expect(result.has('symbol')).toBe(true);
    expect(result.has('volume')).toBe(true);
    expect(result.has('openTime')).toBe(true);
    expect(result.has('closeTime')).toBe(true);
    expect(result.has('profit')).toBe(true);
  });

  it('maps stopLoss from "S / L"', () => {
    const result = matchHeaders(['S / L']);
    expect(result.has('stopLoss')).toBe(true);
  });

  it('maps takeProfit from "T / P"', () => {
    const result = matchHeaders(['T / P']);
    expect(result.has('takeProfit')).toBe(true);
  });

  it('handles broker variant: "Order #" → ticket', () => {
    const result = matchHeaders(['Order #']);
    expect(result.has('ticket')).toBe(true);
  });

  it('handles synonym: "Lots" → volume', () => {
    const result = matchHeaders(['Lots']);
    expect(result.has('volume')).toBe(true);
  });

  it('handles case-insensitive "SYMBOL" → symbol', () => {
    const result = matchHeaders(['SYMBOL']);
    expect(result.has('symbol')).toBe(true);
  });

  it('duplicated "Price" header maps both indices', () => {
    const result = matchHeaders(['Price', 'Something', 'Price']);
    const indices = result.get('price');
    expect(indices).toBeDefined();
    expect(indices!.length).toBe(2);
    expect(indices).toContain(0);
    expect(indices).toContain(2);
  });

  it('returns empty map for unrecognized headers', () => {
    const result = matchHeaders(['FooBar', 'BazQux', 'Unrelated']);
    expect(result.size).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// scoreHeaderMatch
// ─────────────────────────────────────────────────────────────

describe('scoreHeaderMatch', () => {
  it('scores a trade row higher than a non-trade row', () => {
    const tradeRow = ['Ticket', 'Symbol', 'Type', 'Volume', 'Open Time', 'Close Time', 'Profit'];
    const summaryRow = ['Total Profit', 'Number of Trades', 'Win Rate'];
    expect(scoreHeaderMatch(tradeRow)).toBeGreaterThan(scoreHeaderMatch(summaryRow));
  });

  it('returns 0 for empty row', () => {
    expect(scoreHeaderMatch([])).toBe(0);
  });

  it('scores at least 5 for a typical MT4 header', () => {
    const headers = ['Ticket', 'Open Time', 'Type', 'Lots', 'Symbol', 'Price', 'Price', 'Close Time', 'Commission', 'Swap', 'Profit'];
    expect(scoreHeaderMatch(headers)).toBeGreaterThanOrEqual(5);
  });
});

// ─────────────────────────────────────────────────────────────
// MT4 HTML parser
// ─────────────────────────────────────────────────────────────

/** Minimal MT4 HTML statement with two trades */
function makeMt4Html(rows: string[]): string {
  const header = `<tr><th>Ticket</th><th>Open Time</th><th>Type</th><th>Lots</th><th>Symbol</th><th>Price</th><th>S / L</th><th>T / P</th><th>Close Time</th><th>Price</th><th>Commission</th><th>Swap</th><th>Profit</th><th>Comment</th></tr>`;
  return `<html><body><table>${header}${rows.join('')}</table></body></html>`;
}

describe('parseMt4Html', () => {
  it('parses a single closed trade', () => {
    const row = `<tr><td>12345</td><td>2024.01.15 09:00:00</td><td>buy</td><td>0.10</td><td>EURUSD</td><td>1.08500</td><td>1.08200</td><td>1.09000</td><td>2024.01.15 12:00:00</td><td>1.09100</td><td>-3.00</td><td>0.00</td><td>61.00</td><td></td></tr>`;
    const result = parseMt4Html(makeMt4Html([row]));
    expect(result.trades).toHaveLength(1);
    const trade = result.trades[0];
    expect(trade.symbol).toBe('EURUSD');
    expect(trade.direction).toBe('LONG');
    expect(trade.status).toBe('CLOSED');
    expect(trade.legs).toHaveLength(2);
    expect(trade.legs[0].legType).toBe('ENTRY');
    expect(trade.legs[1].legType).toBe('EXIT');
  });

  it('parses a sell trade as SHORT', () => {
    const row = `<tr><td>12346</td><td>2024.01.15 09:00:00</td><td>sell</td><td>0.20</td><td>GBPUSD</td><td>1.27000</td><td>1.27300</td><td>1.26500</td><td>2024.01.15 13:00:00</td><td>1.26800</td><td>-5.00</td><td>0.00</td><td>40.00</td><td></td></tr>`;
    const result = parseMt4Html(makeMt4Html([row]));
    expect(result.trades[0].direction).toBe('SHORT');
  });

  it('returns empty when no valid table found', () => {
    const result = parseMt4Html('<html><body><p>No trades</p></body></html>');
    expect(result.trades).toHaveLength(0);
    expect(result.rowsTotal).toBe(0);
  });

  it('skips balance rows', () => {
    const balanceRow = `<tr><td>-</td><td>2024.01.15 00:00:00</td><td>balance</td><td>0</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td>10000.00</td><td>Deposit</td></tr>`;
    const result = parseMt4Html(makeMt4Html([balanceRow]));
    expect(result.trades).toHaveLength(0);
  });

  it('sets entry timestamp from open time', () => {
    const row = `<tr><td>99999</td><td>2024.03.20 08:30:00</td><td>buy</td><td>0.10</td><td>USDJPY</td><td>149.500</td><td>149.000</td><td>150.500</td><td>2024.03.20 14:00:00</td><td>150.000</td><td>0.00</td><td>0.00</td><td>35.00</td><td></td></tr>`;
    const result = parseMt4Html(makeMt4Html([row]));
    expect(result.trades[0].legs[0].timestampUtc).toContain('2024-03-20T08:30:00');
  });

  it('parses timestamps with space separator correctly (T2-5)', () => {
    const row = `<tr><td>55555</td><td>2024.01.15 09:00:00 UTC</td><td>buy</td><td>0.10</td><td>EURUSD</td><td>1.08500</td><td>0</td><td>0</td><td>2024.01.15 12:00:00 UTC</td><td>1.09000</td><td>0</td><td>0</td><td>50.00</td><td></td></tr>`;
    const result = parseMt4Html(makeMt4Html([row]));
    const ts = result.trades[0].legs[0].timestampUtc;
    // Must be valid ISO — no "UTC" literal in the string
    expect(ts).not.toContain('UTC');
    expect(() => new Date(ts)).not.toThrow();
    expect(isNaN(new Date(ts).getTime())).toBe(false);
  });

  it('adds zero-volume rows to failed[] (T6-2)', () => {
    const row = `<tr><td>77777</td><td>2024.01.15 09:00:00</td><td>buy</td><td>0.00</td><td>EURUSD</td><td>1.08500</td><td>0</td><td>0</td><td></td><td>0</td><td>0</td><td>0</td><td>0</td><td></td></tr>`;
    const result = parseMt4Html(makeMt4Html([row]));
    expect(result.failed.length).toBeGreaterThan(0);
    expect(result.failed[0].reason).toMatch(/volume/i);
  });

  it('reports rowsTotal correctly', () => {
    const row1 = `<tr><td>11111</td><td>2024.01.15 09:00:00</td><td>buy</td><td>0.10</td><td>EURUSD</td><td>1.085</td><td>0</td><td>0</td><td>2024.01.15 12:00:00</td><td>1.091</td><td>0</td><td>0</td><td>61</td><td></td></tr>`;
    const row2 = `<tr><td>11112</td><td>2024.01.15 10:00:00</td><td>sell</td><td>0.20</td><td>GBPUSD</td><td>1.270</td><td>0</td><td>0</td><td>2024.01.15 14:00:00</td><td>1.268</td><td>0</td><td>0</td><td>40</td><td></td></tr>`;
    const result = parseMt4Html(makeMt4Html([row1, row2]));
    expect(result.rowsTotal).toBe(2);
    expect(result.trades).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────
// MT5 HTML parser
// ─────────────────────────────────────────────────────────────

function makeMt5Html(rows: string[]): string {
  const header = `<tr><th>Deal</th><th>Time</th><th>Symbol</th><th>Type</th><th>Direction</th><th>Volume</th><th>Price</th><th>Commission</th><th>Swap</th><th>Profit</th><th>Position</th><th>Comment</th></tr>`;
  return `<html><body><table>${header}${rows.join('')}</table></body></html>`;
}

describe('parseMt5Html', () => {
  it('parses a closed position from entry + exit deals', () => {
    const entry = `<tr><td>1001</td><td>2024.01.15 09:00:00</td><td>EURUSD</td><td>buy</td><td>in</td><td>0.10</td><td>1.08500</td><td>-3.00</td><td>0.00</td><td>0.00</td><td>5001</td><td></td></tr>`;
    const exit  = `<tr><td>1002</td><td>2024.01.15 12:00:00</td><td>EURUSD</td><td>buy</td><td>out</td><td>0.10</td><td>1.09100</td><td>-3.00</td><td>0.00</td><td>61.00</td><td>5001</td><td></td></tr>`;
    const result = parseMt5Html(makeMt5Html([entry, exit]));
    expect(result.trades).toHaveLength(1);
    const trade = result.trades[0];
    expect(trade.symbol).toBe('EURUSD');
    expect(trade.direction).toBe('LONG');
    expect(trade.status).toBe('CLOSED');
    expect(trade.legs).toHaveLength(2);
    expect(trade.legs.find(l => l.legType === 'ENTRY')).toBeDefined();
    expect(trade.legs.find(l => l.legType === 'EXIT')).toBeDefined();
  });

  it('parses a sell position as SHORT', () => {
    const entry = `<tr><td>2001</td><td>2024.01.15 09:00:00</td><td>GBPUSD</td><td>sell</td><td>in</td><td>0.20</td><td>1.27000</td><td>-5.00</td><td>0.00</td><td>0.00</td><td>6001</td><td></td></tr>`;
    const exit  = `<tr><td>2002</td><td>2024.01.15 13:00:00</td><td>GBPUSD</td><td>sell</td><td>out</td><td>0.20</td><td>1.26800</td><td>-5.00</td><td>0.00</td><td>40.00</td><td>6001</td><td></td></tr>`;
    const result = parseMt5Html(makeMt5Html([entry, exit]));
    expect(result.trades[0].direction).toBe('SHORT');
  });

  it('groups multiple positions correctly', () => {
    const e1 = `<tr><td>3001</td><td>2024.01.15 09:00:00</td><td>EURUSD</td><td>buy</td><td>in</td><td>0.10</td><td>1.085</td><td>0</td><td>0</td><td>0</td><td>7001</td><td></td></tr>`;
    const x1 = `<tr><td>3002</td><td>2024.01.15 12:00:00</td><td>EURUSD</td><td>buy</td><td>out</td><td>0.10</td><td>1.091</td><td>0</td><td>0</td><td>61</td><td>7001</td><td></td></tr>`;
    const e2 = `<tr><td>3003</td><td>2024.01.15 10:00:00</td><td>USDJPY</td><td>sell</td><td>in</td><td>0.20</td><td>150.0</td><td>0</td><td>0</td><td>0</td><td>7002</td><td></td></tr>`;
    const x2 = `<tr><td>3004</td><td>2024.01.15 14:00:00</td><td>USDJPY</td><td>sell</td><td>out</td><td>0.20</td><td>149.5</td><td>0</td><td>0</td><td>35</td><td>7002</td><td></td></tr>`;
    const result = parseMt5Html(makeMt5Html([e1, x1, e2, x2]));
    expect(result.trades).toHaveLength(2);
  });

  it('returns empty for HTML with no valid trade table', () => {
    const result = parseMt5Html('<html><body><p>No table here</p></body></html>');
    expect(result.trades).toHaveLength(0);
  });
});
