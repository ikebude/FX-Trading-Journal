/**
 * Generic CSV importer.
 *
 * Accepts any CSV with at least: symbol, direction/type, open time, open price,
 * close time, close price, volume. Uses the fuzzy header matcher to be
 * tolerant of broker-specific column names.
 *
 * Pure function — no DB access, no I/O.
 */

import Papa from 'papaparse';
import { matchHeaders, type CanonicalField } from './headers';
import type { ParseResult, ParsedTrade, ParsedLeg } from './mt5-html';

export function parseCsv(csvText: string): ParseResult {
  const result = Papa.parse<string[]>(csvText, {
    skipEmptyLines: true,
    header: false,
  });

  if (result.data.length < 2) {
    return { trades: [], failed: [], rowsTotal: 0 };
  }

  const headers = result.data[0].map((h) => String(h).trim());
  const colMap = matchHeaders(headers);

  const dataRows = result.data.slice(1);
  const trades: ParsedTrade[] = [];
  const failed: ParseResult['failed'] = [];

  const get = (row: string[], field: CanonicalField): string | undefined => {
    const cols = colMap.get(field);
    if (!cols || cols.length === 0) return undefined;
    for (const idx of cols) {
      if (idx < row.length) {
        const v = row[idx]?.trim();
        if (v) return v;
      }
    }
    return undefined;
  };

  const parseNum = (s: string | undefined, rowIdx: number, field: string): number | null => {
    if (!s) return null;
    const n = parseFloat(s.replace(/,/g, ''));
    if (Number.isNaN(n)) {
      failed.push({ rowIndex: rowIdx, reason: `Non-numeric ${field}: "${s}"`, rawRow: [] });
      return null;
    }
    return n;
  };

  const parseTs = (s: string | undefined): string | null => {
    if (!s) return null;
    // Handle "YYYY.MM.DD HH:MM:SS", "YYYY-MM-DD HH:MM:SS", ISO formats
    const normalised = s
      .replace(/\./g, '-')           // YYYY.MM.DD → YYYY-MM-DD
      .replace(/\s+/g, 'T')          // space → T
      .replace(/\s*UTC\s*$/i, '')    // strip UTC suffix
      .replace(/T$/, '');
    const d = new Date(normalised.endsWith('Z') ? normalised : normalised + 'Z');
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  };

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i].map((c) => String(c ?? '').trim());
    const rowIdx = i + 1;

    const symbol = get(row, 'symbol');
    if (!symbol) { failed.push({ rowIndex: rowIdx, reason: 'Missing symbol', rawRow: row }); continue; }

    const dirRaw = get(row, 'type') ?? get(row, 'direction') ?? '';
    const dirLower = dirRaw.toLowerCase();
    let direction: 'LONG' | 'SHORT';
    if (dirLower.includes('buy') || dirLower.includes('long')) {
      direction = 'LONG';
    } else if (dirLower.includes('sell') || dirLower.includes('short')) {
      direction = 'SHORT';
    } else {
      failed.push({ rowIndex: rowIdx, reason: `Unrecognizable direction "${dirRaw}" — expected buy/sell/long/short`, rawRow: row });
      continue;
    }

    const openTs = parseTs(get(row, 'openTime') ?? get(row, 'time'));
    const closeTs = parseTs(get(row, 'closeTime'));
    if (!openTs) { failed.push({ rowIndex: rowIdx, reason: 'Cannot parse open time', rawRow: row }); continue; }

    const openPrice = parseNum(get(row, 'openPrice') ?? get(row, 'price'), rowIdx, 'open price');
    const closePrice = parseNum(get(row, 'closePrice'), rowIdx, 'close price');
    const volume = parseNum(get(row, 'volume'), rowIdx, 'volume');
    const commission = parseNum(get(row, 'commission'), rowIdx, 'commission') ?? 0;
    const swap = parseNum(get(row, 'swap'), rowIdx, 'swap') ?? 0;
    const profit = parseNum(get(row, 'profit'), rowIdx, 'profit');

    if (openPrice === null || volume === null) {
      failed.push({ rowIndex: rowIdx, reason: 'Missing price or volume', rawRow: row });
      continue;
    }

    if (volume <= 0) {
      failed.push({ rowIndex: rowIdx, reason: `Zero volume at row ${rowIdx}`, rawRow: row });
      continue;
    }

    const positionId = get(row, 'positionId') ?? get(row, 'ticket') ?? `csv-${rowIdx}`;

    const entryLeg: ParsedLeg = {
      externalDealId: `${positionId}-in`,
      legType: 'ENTRY',
      timestampUtc: openTs,
      price: openPrice,
      volumeLots: volume,
      commission,
      swap: 0,
      brokerProfit: null,
    };

    const legs: ParsedLeg[] = [entryLeg];

    if (closeTs && closePrice !== null) {
      legs.push({
        externalDealId: `${positionId}-out`,
        legType: 'EXIT',
        timestampUtc: closeTs,
        price: closePrice,
        volumeLots: volume,
        commission: 0,
        swap,
        brokerProfit: profit,
      });
    }

    trades.push({
      externalPositionId: positionId,
      symbol: symbol.toUpperCase(),
      direction,
      status: closeTs && closePrice !== null ? 'CLOSED' : 'OPEN',
      legs,
      rawDealCount: legs.length,
    });
  }

  return { trades, failed, rowsTotal: dataRows.length };
}
