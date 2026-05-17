/**
 * T6.2 — natural-language blotter query + trade-similarity primitives.
 *
 * `parseNlQuery` is a pure, deterministic DSL: it maps a free-text query
 * to a partial blotter filter (no model needed — always available).
 * Embedding-based similarity is model-gated like transcription (T6.1).
 */

export interface NlFilter {
  symbol?: string;
  direction?: 'LONG' | 'SHORT';
  status?: Array<'OPEN' | 'PARTIAL' | 'CLOSED' | 'CANCELLED'>;
  outcome?: 'WIN' | 'LOSS';
  minConfidence?: number;
  session?: string;
  pinnedOnly?: boolean;
  /** Relative date window the UI maps to dateFrom/dateTo. */
  window?: 'today' | '7d' | '30d' | '90d' | 'ytd';
  /** Free terms not understood — fall back to FTS over these. */
  freeText: string;
}

const CCY = '(?:AUD|CAD|CHF|EUR|GBP|JPY|NZD|USD|SGD|HKD|NOK|SEK|MXN|ZAR|TRY)';
const SYMBOL_RE = new RegExp(
  `\\b(${CCY}[/]?${CCY}|XAU[/]?USD|XAG[/]?USD|US30|NAS100|SPX500|GER40|UK100|JP225)\\b`,
);

/** Deterministic, model-free NL → filter. Case-insensitive. */
export function parseNlQuery(raw: string): NlFilter {
  const text = raw.trim();
  const lower = text.toLowerCase();
  const f: NlFilter = { freeText: '' };
  const consumed: string[] = [];

  const sym = text.toUpperCase().match(SYMBOL_RE);
  if (sym) {
    f.symbol = sym[1].replace('/', '');
    consumed.push(sym[1].toLowerCase());
  }

  if (/\b(long|buy|buys|longs)\b/.test(lower)) f.direction = 'LONG';
  else if (/\b(short|sell|sells|shorts)\b/.test(lower)) f.direction = 'SHORT';

  if (/\b(win|wins|winning|winners?|profitable)\b/.test(lower)) f.outcome = 'WIN';
  else if (/\b(loss|losses|losing|losers?)\b/.test(lower)) f.outcome = 'LOSS';

  if (/\bopen\b/.test(lower)) f.status = ['OPEN', 'PARTIAL'];
  else if (/\bclosed\b/.test(lower)) f.status = ['CLOSED'];

  if (/\bpinned|starred\b/.test(lower)) f.pinnedOnly = true;

  if (/\b(high[- ]conf|high confidence|confident)\b/.test(lower)) f.minConfidence = 4;

  for (const s of ['london', 'newyork', 'new york', 'tokyo', 'asian', 'sydney']) {
    if (lower.includes(s)) {
      f.session = s.replace(' ', '').toUpperCase();
      break;
    }
  }

  if (/\btoday\b/.test(lower)) f.window = 'today';
  else if (/\b(last week|past week|7 days|7d)\b/.test(lower)) f.window = '7d';
  else if (/\b(last month|past month|30 days|30d)\b/.test(lower)) f.window = '30d';
  else if (/\b(last quarter|90 days|90d)\b/.test(lower)) f.window = '90d';
  else if (/\b(this year|ytd|year to date)\b/.test(lower)) f.window = 'ytd';

  // Anything not recognised becomes FTS free text.
  void consumed;
  f.freeText = lower
    .replace(new RegExp(SYMBOL_RE.source, 'gi'), ' ')
    .replace(
      /\b(long|short|buy|sell|win|wins|winning|winners?|loss|losses|losing|losers?|open|closed|pinned|starred|today|last week|past week|last month|past month|last quarter|this year|ytd|high confidence|trades?|with|the|and|in)\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();

  return f;
}

/** Cosine similarity of two equal-length vectors; null if undefined. */
export function cosineSimilarity(a: number[], b: number[]): number | null {
  if (a.length === 0 || a.length !== b.length) return null;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return null;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export type EmbeddingStatus = 'available' | 'model-missing' | 'engine-missing';

export function embeddingStatus(i: {
  enginePresent: boolean;
  modelPresent: boolean;
}): EmbeddingStatus {
  if (!i.enginePresent) return 'engine-missing';
  if (!i.modelPresent) return 'model-missing';
  return 'available';
}
