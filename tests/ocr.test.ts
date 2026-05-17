import { describe, it, expect } from 'vitest';
import { ocrStatus, normalizeOcrText, ocrSearchTerms } from '../src/lib/ocr';

describe('ocrStatus — T6.3', () => {
  it('gates disabled > engine > lang > available', () => {
    expect(ocrStatus({ enabled: false, enginePresent: true, langDataPresent: true })).toBe('disabled');
    expect(ocrStatus({ enabled: true, enginePresent: false, langDataPresent: true })).toBe('engine-missing');
    expect(ocrStatus({ enabled: true, enginePresent: true, langDataPresent: false })).toBe('lang-missing');
    expect(ocrStatus({ enabled: true, enginePresent: true, langDataPresent: true })).toBe('available');
  });
});

describe('normalizeOcrText / ocrSearchTerms — T6.3', () => {
  it('collapses whitespace and trims', () => {
    expect(normalizeOcrText('  EUR\nUSD\t\t1.0850   ')).toBe('EUR USD 1.0850');
  });
  it('tokenises to lowercase terms >= 2 chars', () => {
    expect(ocrSearchTerms('EURUSD H4 BOS @ 1.0850, a')).toEqual([
      'eurusd',
      'h4',
      'bos',
      '1.0850',
    ]);
  });
  it('empty / whitespace → no terms', () => {
    expect(ocrSearchTerms('   \n  ')).toEqual([]);
  });
});
