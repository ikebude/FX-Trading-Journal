/**
 * Fuzzy header matcher for trade statement importers.
 *
 * Broker variants change column ORDER and LABELS, never the underlying data.
 * Match against synonyms, not against fixed positions.
 */

export type CanonicalField =
  | 'ticket'
  | 'positionId'
  | 'dealId'
  | 'symbol'
  | 'type'
  | 'volume'
  | 'openTime'
  | 'closeTime'
  | 'time'
  | 'openPrice'
  | 'closePrice'
  | 'price'
  | 'stopLoss'
  | 'takeProfit'
  | 'commission'
  | 'swap'
  | 'profit'
  | 'comment'
  | 'direction';

export const SYNONYMS: Record<CanonicalField, readonly string[]> = {
  ticket: ['ticket', 'order', 'order #', 'order id', 'orderid'],
  positionId: ['position', 'position id', 'position_id', 'pos id', 'posid', 'pos'],
  dealId: ['deal', 'deal id', 'deal_id', 'deal #'],
  symbol: ['symbol', 'item', 'instrument', 'pair'],
  type: ['type', 'side', 'action', 'direction', 'buy/sell'],
  direction: ['direction', 'buy/sell', 'side'],
  volume: ['volume', 'size', 'lots', 'qty', 'quantity', 'lot'],
  openTime: ['open time', 'time open', 'entry time', 'opening time', 'time'],
  closeTime: ['close time', 'time close', 'exit time', 'closing time'],
  time: ['time', 'date', 'datetime'],
  openPrice: ['open price', 'price open', 'entry price', 'opening price'],
  closePrice: ['close price', 'price close', 'exit price', 'closing price'],
  price: ['price', 'rate'],
  stopLoss: ['s / l', 's/l', 'sl', 'stop loss', 'stoploss', 'stop'],
  takeProfit: ['t / p', 't/p', 'tp', 'take profit', 'takeprofit', 'target'],
  commission: ['commission', 'comm', 'fee', 'fees', 'commissions'],
  swap: ['swap', 'rollover', 'storage', 'swaps'],
  profit: ['profit', 'p/l', 'pnl', 'p / l', 'net', 'gross', 'profit/loss'],
  comment: ['comment', 'note', 'notes', 'description'],
};

/** Normalise a header cell for matching: lowercase, trim, collapse whitespace, strip punctuation. */
export function normalizeHeader(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\u00a0\s]+/g, ' ')
    // T6-4: Replace punctuation with a space, not empty string.
    // Without this, "Pos–ID" → "PosID" which fails synonym matching.
    // With the fix, "Pos–ID" → "Pos ID" → matches "pos id" synonym.
    .replace(/[^\w\s/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build a column index map from a header row.
 *
 * Returns a Map<CanonicalField, number[]>. Most fields map to a single column index,
 * but some (notably MT4's duplicated "Price" header) can map to multiple — the parser
 * disambiguates by position when needed.
 */
export function matchHeaders(headerRow: string[]): Map<CanonicalField, number[]> {
  const result = new Map<CanonicalField, number[]>();
  const normalized = headerRow.map(normalizeHeader);

  for (const [field, synonyms] of Object.entries(SYNONYMS) as Array<
    [CanonicalField, readonly string[]]
  >) {
    const matches: number[] = [];
    normalized.forEach((cell, idx) => {
      // Strict equality first
      if (synonyms.some((syn) => normalizeHeader(syn) === cell)) {
        matches.push(idx);
        return;
      }
      // Then substring match (handles "open time (utc)" → openTime)
      if (
        synonyms.some((syn) => {
          const ns = normalizeHeader(syn);
          return cell === ns || cell.startsWith(ns + ' ') || cell.endsWith(' ' + ns);
        })
      ) {
        matches.push(idx);
      }
    });
    if (matches.length > 0) result.set(field, matches);
  }

  return result;
}

/**
 * Score how well a row of headers matches the canonical field set.
 * Used to pick the right table out of an HTML statement that has many tables.
 */
export function scoreHeaderMatch(headerRow: string[]): number {
  const matched = matchHeaders(headerRow);
  return matched.size;
}
