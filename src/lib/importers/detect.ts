/**
 * Detect the format of an import file and route to the correct parser.
 *
 * Detection rules (in priority order):
 *  1. .csv extension → CSV
 *  2. HTML content with "MetaTrader 4" → MT4_HTML
 *  3. HTML content with "MetaTrader 5" or position-id column → MT5_HTML
 *  4. HTML content without MT markers → try both parsers, pick the one with more trades
 */

import { parseMt4Html } from './mt4-html';
import { parseMt5Html } from './mt5-html';
import { parseCsv } from './csv';
import type { ParseResult } from './mt5-html';

export type ImportFormat = 'MT4_HTML' | 'MT5_HTML' | 'CSV' | 'UNKNOWN';

export interface DetectResult {
  format: ImportFormat;
  result: ParseResult;
}

export function detectAndParse(content: string, filename: string): DetectResult {
  const ext = filename.split('.').pop()?.toLowerCase();

  if (ext === 'csv') {
    return { format: 'CSV', result: parseCsv(content) };
  }

  if (ext === 'htm' || ext === 'html' || content.trimStart().startsWith('<')) {
    const lower = content.toLowerCase();

    if (lower.includes('metatrader 4') || lower.includes('meta trader 4')) {
      return { format: 'MT4_HTML', result: parseMt4Html(content) };
    }

    if (
      lower.includes('metatrader 5') ||
      lower.includes('meta trader 5') ||
      lower.includes('position id') ||
      lower.includes('positionid')
    ) {
      return { format: 'MT5_HTML', result: parseMt5Html(content) };
    }

    // Ambiguous HTML — try both and take the result with more successfully parsed trades
    const mt4 = parseMt4Html(content);
    const mt5 = parseMt5Html(content);
    if (mt5.trades.length >= mt4.trades.length) {
      return { format: 'MT5_HTML', result: mt5 };
    }
    return { format: 'MT4_HTML', result: mt4 };
  }

  // Fall back to CSV for unknown text files
  const csvResult = parseCsv(content);
  if (csvResult.trades.length > 0) {
    return { format: 'CSV', result: csvResult };
  }

  return { format: 'UNKNOWN', result: { trades: [], failed: [], rowsTotal: 0 } };
}
