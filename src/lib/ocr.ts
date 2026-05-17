/**
 * T6.3 - screenshot OCR policy + text normalisation (pure, model-gated).
 * The tesseract.js engine runs in the main process (lazy). This holds the
 * pure gate + normaliser so it is unit-testable with no wasm/lang data.
 */

export type OcrStatus = 'available' | 'lang-missing' | 'engine-missing' | 'disabled';

export function ocrStatus(i: {
  enabled: boolean;
  enginePresent: boolean;
  langDataPresent: boolean;
}): OcrStatus {
  if (!i.enabled) return 'disabled';
  if (!i.enginePresent) return 'engine-missing';
  if (!i.langDataPresent) return 'lang-missing';
  return 'available';
}

/** Normalise raw OCR output: collapse all whitespace runs, trim. */
export function normalizeOcrText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** Tokenise OCR text into searchable lowercase terms (len >= 2). */
export function ocrSearchTerms(raw: string): string[] {
  return normalizeOcrText(raw)
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter((t) => t.length >= 2);
}
