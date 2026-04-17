/**
 * MT5 detailed statement HTML parser.
 *
 * Parses the "Deals" section of an MT5 statement export and groups deals
 * by position_id to synthesize trade + leg records.
 *
 * Pure function. No DB access, no I/O.
 */

import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { matchHeaders, scoreHeaderMatch, type CanonicalField } from './headers';

export interface ParsedTrade {
  externalPositionId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  status: 'CLOSED' | 'OPEN' | 'CANCELLED';
  legs: ParsedLeg[];
  rawDealCount: number;
}

export interface ParsedLeg {
  externalDealId: string;
  legType: 'ENTRY' | 'EXIT';
  timestampUtc: string; // ISO-8601
  price: number;
  volumeLots: number;
  commission: number;
  swap: number;
  brokerProfit: number | null;
}

export interface ParseResult {
  trades: ParsedTrade[];
  failed: Array<{ rowIndex: number; reason: string; rawRow: string[] }>;
  rowsTotal: number;
}

interface RawDeal {
  rowIndex: number;
  dealId: string;
  positionId: string;
  symbol: string;
  type: string; // "buy" / "sell" / "in" / "out" / "in/out"
  direction: string; // "in" / "out" / "in/out" / "" — separate column in newer statements
  volume: number;
  timestamp: string;
  price: number;
  commission: number;
  swap: number;
  profit: number | null;
  comment: string;
}

export function parseMt5Html(html: string): ParseResult {
  const $ = cheerio.load(html);
  const tables = $('table').toArray();

  // Score each table by header match quality and pick the best.
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

  if (!best) {
    return { trades: [], failed: [], rowsTotal: 0 };
  }

  const colMap = matchHeaders(best.headers);
  const dataRows = $(best.table).find('tr').toArray().slice(best.headerRowIdx + 1);

  const failed: ParseResult['failed'] = [];
  const deals: RawDeal[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const cells = $(dataRows[i])
      .find('td')
      .toArray()
      .map((c) => $(c).text().trim());

    if (cells.length === 0 || cells.every((c) => c === '')) continue;

    // Skip summary/footer rows that aren't actual deals
    if (cells.length < 6) continue;

    try {
      const deal = parseDealRow(cells, colMap, i);
      if (deal) deals.push(deal);
    } catch (err) {
      failed.push({
        rowIndex: i,
        reason: (err as Error).message,
        rawRow: cells,
      });
    }
  }

  // Group deals by position_id and synthesize trades
  const grouped = new Map<string, RawDeal[]>();
  for (const d of deals) {
    if (!d.positionId) {
      // T6-3: Log deals with no position_id instead of silently skipping.
      // A missing position_id means the deal cannot be grouped into a trade.
      failed.push({
        rowIndex: d.rowIndex,
        reason: `Deal ${d.dealId} has no position_id — cannot group into a trade. Skipped.`,
        rawRow: [],
      });
      continue;
    }
    const arr = grouped.get(d.positionId) ?? [];
    arr.push(d);
    grouped.set(d.positionId, arr);
  }

  const trades: ParsedTrade[] = [];
  for (const [positionId, group] of grouped) {
    group.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    // Determine direction from the first deal
    const first = group[0];
    const direction = inferDirection(first);
    if (direction === null) continue;

    const legs: ParsedLeg[] = group.map((d) => ({
      externalDealId: d.dealId,
      legType: isEntryDeal(d, group[0], direction) ? 'ENTRY' : 'EXIT',
      timestampUtc: d.timestamp,
      price: d.price,
      volumeLots: d.volume,
      commission: d.commission,
      swap: d.swap,
      brokerProfit: d.profit,
    }));

    // Determine status: if any deals are exit-side and the volumes balance, it's CLOSED.
    const entryVol = legs
      .filter((l) => l.legType === 'ENTRY')
      .reduce((s, l) => s + l.volumeLots, 0);
    const exitVol = legs
      .filter((l) => l.legType === 'EXIT')
      .reduce((s, l) => s + l.volumeLots, 0);

    let status: ParsedTrade['status'];
    if (exitVol === 0) status = 'OPEN';
    else if (Math.abs(entryVol - exitVol) < 0.001) status = 'CLOSED';
    else status = 'OPEN'; // partial — still open

    trades.push({
      externalPositionId: positionId,
      symbol: first.symbol,
      direction,
      status,
      legs,
      rawDealCount: group.length,
    });
  }

  return { trades, failed, rowsTotal: deals.length };
}

function parseDealRow(
  cells: string[],
  colMap: Map<CanonicalField, number[]>,
  rowIndex: number,
): RawDeal | null {
  const get = (field: CanonicalField, idx = 0): string | undefined => {
    const cols = colMap.get(field);
    if (!cols || cols.length === 0) return undefined;
    return cells[cols[idx]];
  };

  const dealId = get('dealId') ?? get('ticket') ?? '';
  const positionId = get('positionId') ?? '';
  const symbol = get('symbol') ?? '';
  const type = (get('type') ?? '').toLowerCase();
  const direction = (get('direction') ?? '').toLowerCase();
  const volumeStr = get('volume') ?? '';
  const timeStr = get('time') ?? get('openTime') ?? '';
  const priceStr = get('price') ?? '';
  const commStr = get('commission') ?? '0';
  const swapStr = get('swap') ?? '0';
  const profitStr = get('profit');
  const comment = get('comment') ?? '';

  if (!symbol || !timeStr || !priceStr) return null;

  // Filter out balance/credit/correction rows that have no symbol
  if (type === 'balance' || type === 'credit' || type === 'correction') return null;

  const volume = parseNumber(volumeStr);
  const price = parseNumber(priceStr);
  const commission = parseNumber(commStr);
  const swap = parseNumber(swapStr);
  const profit = profitStr !== undefined && profitStr !== '' ? parseNumber(profitStr) : null;

  if (Number.isNaN(volume) || volume === 0) {
    // Pending order that didn't fill — caller can decide to skip or import as CANCELLED.
    return null;
  }

  // T2-6: Reject rows where critical numeric fields parsed to NaN.
  // Without this, NaN propagates as a trade price/P&L into the DB and corrupts analytics.
  if (Number.isNaN(price)) {
    throw new Error(`Non-numeric price "${priceStr}" in deal ${dealId}`);
  }
  if (profit !== null && Number.isNaN(profit)) {
    throw new Error(`Non-numeric profit "${profitStr}" in deal ${dealId}`);
  }

  return {
    rowIndex,
    dealId,
    positionId,
    symbol,
    type,
    direction,
    volume,
    timestamp: parseTimestamp(timeStr),
    price,
    commission,
    swap,
    profit,
    comment,
  };
}

function inferDirection(deal: RawDeal): 'LONG' | 'SHORT' | null {
  const t = deal.type.toLowerCase();
  if (t.includes('buy')) return 'LONG';
  if (t.includes('sell')) return 'SHORT';
  return null;
}

function isEntryDeal(deal: RawDeal, firstDeal: RawDeal, positionDirection: 'LONG' | 'SHORT'): boolean {
  // MT5 marks deals as in/out/inout in a separate column. If we have it, use it.
  if (deal.direction === 'in') return true;
  if (deal.direction === 'out') return false;
  // No direction column — infer from type relative to the position's direction.
  // For scale-in trades: LONG scale-ins have type "buy", SHORT scale-ins have type "sell".
  const t = deal.type.toLowerCase();
  if (positionDirection === 'LONG') {
    if (t.includes('buy')) return true;
    if (t.includes('sell')) return false;
  } else {
    if (t.includes('sell')) return true;
    if (t.includes('buy')) return false;
  }
  // Absolute fallback: the first chronological deal is the entry.
  return deal === firstDeal;
}

function parseNumber(s: string): number {
  if (!s) return 0;
  // Handle thousands separators and parentheses negatives
  const cleaned = s
    .replace(/\u00a0/g, '')
    .replace(/\s/g, '')
    .replace(/,/g, '')
    .replace(/^\((.*)\)$/, '-$1');
  return parseFloat(cleaned);
}

function parseTimestamp(s: string): string {
  // MT5 timestamps are typically "YYYY.MM.DD HH:MM:SS" in server time.
  // We treat them as UTC unless the user configures otherwise.
  // Fix: use /\s+/g (all whitespace) and strip trailing UTC marker, same as mt4-html.ts.
  const clean = s
    .trim()
    .replace(/\./g, '-')
    .replace(/\s+UTC$/i, '')
    .replace(/\s+/g, 'T');
  if (!/Z$|[+-]\d{2}:?\d{2}$/.test(clean)) {
    return clean + 'Z';
  }
  return clean;
}
