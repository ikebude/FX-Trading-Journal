/**
 * MT4 detailed statement HTML parser.
 *
 * MT4 statements have one row per closed trade with both open and close
 * fields collapsed into a single row. Different from MT5 which is per-fill.
 *
 * Pure function. No DB access, no I/O.
 */

import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { matchHeaders, scoreHeaderMatch, type CanonicalField } from './headers';
import type { ParsedTrade, ParsedLeg, ParseResult } from './mt5-html';

export function parseMt4Html(html: string): ParseResult {
  const $ = cheerio.load(html);
  const tables = $('table').toArray();

  let best: { table: Element; headers: string[]; score: number; headerRowIdx: number } | null = null;

  for (const table of tables) {
    const rows = $(table).find('tr').toArray();
    for (let r = 0; r < Math.min(rows.length, 8); r++) {
      const cells = $(rows[r])
        .find('td, th')
        .toArray()
        .map((c) => $(c).text().trim());
      if (cells.length < 5) continue;
      const score = scoreHeaderMatch(cells);
      if (score >= 5 && (!best || score > best.score)) {
        best = { table, headers: cells, score, headerRowIdx: r };
      }
    }
  }

  if (!best) return { trades: [], failed: [], rowsTotal: 0 };

  // MT4 statements have a duplicated "Price" header — first occurrence is open price,
  // second occurrence is close price. Resolve those positions explicitly.
  const priceColumns: number[] = [];
  best.headers.forEach((h, idx) => {
    if (h.toLowerCase().trim() === 'price') priceColumns.push(idx);
  });

  const colMap = matchHeaders(best.headers);
  // Force openPrice = first "Price" column, closePrice = second "Price" column.
  if (priceColumns.length >= 2) {
    colMap.set('openPrice', [priceColumns[0]]);
    colMap.set('closePrice', [priceColumns[1]]);
    colMap.delete('price');
  }

  const dataRows = $(best.table).find('tr').toArray().slice(best.headerRowIdx + 1);
  const failed: ParseResult['failed'] = [];
  const trades: ParsedTrade[] = [];

  const get = (cells: string[], field: CanonicalField): string | undefined => {
    const cols = colMap.get(field);
    if (!cols || cols.length === 0) return undefined;
    // T6-2: Bounds check — MT4 statements sometimes omit trailing columns.
    return cols[0] < cells.length ? cells[cols[0]] : undefined;
  };

  for (let i = 0; i < dataRows.length; i++) {
    const cells = $(dataRows[i])
      .find('td')
      .toArray()
      .map((c) => $(c).text().trim());

    if (cells.length === 0 || cells.every((c) => c === '')) continue;
    if (cells.length < 6) continue;

    try {
      const ticket = get(cells, 'ticket');
      const type = (get(cells, 'type') ?? '').toLowerCase();
      const symbol = get(cells, 'symbol');
      const volume = parseNum(get(cells, 'volume'));
      const openTime = parseTs(get(cells, 'openTime') ?? get(cells, 'time') ?? '');
      const openPrice = parseNum(get(cells, 'openPrice'));
      const closeTime = parseTs(get(cells, 'closeTime') ?? '');
      const closePrice = parseNum(get(cells, 'closePrice'));
      const commission = parseNum(get(cells, 'commission'));
      const swap = parseNum(get(cells, 'swap'));
      const profit = parseNum(get(cells, 'profit'));

      // Skip non-trade rows: balance, credit, pending orders, summary lines
      if (!ticket || !symbol || !type) continue;
      if (type === 'balance' || type === 'credit') continue;
      if (volume === 0) {
        // T6-2: Log zero-volume rows (unfilled pending orders) instead of silently skipping.
        failed.push({ rowIndex: i, reason: 'Volume is 0 — unfilled pending order. Skipped.', rawRow: cells });
        continue;
      }

      const direction: 'LONG' | 'SHORT' | null = type.includes('buy') ? 'LONG' : type.includes('sell') ? 'SHORT' : null;
      if (!direction) continue;

      // Open trade case (no close time/price)
      const isOpen = !closeTime || closePrice === 0;

      const entryLeg: ParsedLeg = {
        externalDealId: `${ticket}-entry`,
        legType: 'ENTRY',
        timestampUtc: openTime,
        price: openPrice,
        volumeLots: volume,
        commission: 0,
        swap: 0,
        brokerProfit: null,
      };

      const legs: ParsedLeg[] = [entryLeg];

      if (!isOpen) {
        legs.push({
          externalDealId: `${ticket}-exit`,
          legType: 'EXIT',
          timestampUtc: closeTime,
          price: closePrice,
          volumeLots: volume,
          commission,
          swap,
          brokerProfit: profit,
        });
      }

      trades.push({
        externalPositionId: ticket,
        symbol,
        direction,
        status: isOpen ? 'OPEN' : 'CLOSED',
        legs,
        rawDealCount: legs.length,
      });
    } catch (err) {
      failed.push({
        rowIndex: i,
        reason: (err as Error).message,
        rawRow: cells,
      });
    }
  }

  return { trades, failed, rowsTotal: dataRows.length };
}

function parseNum(s: string | undefined): number {
  if (!s) return 0;
  const cleaned = s
    .replace(/\u00a0/g, '')
    .replace(/\s/g, '')
    .replace(/,/g, '')
    .replace(/^\((.*)\)$/, '-$1');
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? 0 : n;
}

function parseTs(s: string): string {
  if (!s) return '';
  // T2-5: Use /\s+/g (all whitespace) not just the first space, and strip any
  // trailing UTC marker first. Without this, "2024.01.15 12:34:56 UTC" becomes
  // "2024-01-15T12:34:56TUTCZ" — invalid ISO-8601 that breaks Date parsing.
  const clean = s
    .trim()
    .replace(/\./g, '-')
    .replace(/\s+UTC$/i, '')
    .replace(/\s+/g, 'T');
  if (!/Z$|[+-]\d{2}:?\d{2}$/.test(clean)) return clean + 'Z';
  return clean;
}
