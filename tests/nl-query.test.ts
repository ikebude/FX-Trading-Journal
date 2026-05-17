import { describe, it, expect } from 'vitest';
import {
  parseNlQuery,
  cosineSimilarity,
  embeddingStatus,
} from '../src/lib/nl-query';

describe('parseNlQuery — T6.2', () => {
  it('extracts symbol, direction, outcome and window', () => {
    const f = parseNlQuery('EURUSD long losing trades last month');
    expect(f.symbol).toBe('EURUSD');
    expect(f.direction).toBe('LONG');
    expect(f.outcome).toBe('LOSS');
    expect(f.window).toBe('30d');
  });

  it('maps status + confidence + pinned', () => {
    const f = parseNlQuery('open high confidence pinned shorts');
    expect(f.status).toEqual(['OPEN', 'PARTIAL']);
    expect(f.minConfidence).toBe(4);
    expect(f.pinnedOnly).toBe(true);
    expect(f.direction).toBe('SHORT');
  });

  it('recognises a session', () => {
    expect(parseNlQuery('GBPUSD london winners').session).toBe('LONDON');
  });

  it('leaves unrecognised words as free text for FTS', () => {
    const f = parseNlQuery('breakout retest setup on EURUSD');
    expect(f.symbol).toBe('EURUSD');
    expect(f.freeText).toContain('breakout');
    expect(f.freeText).not.toContain('eurusd');
  });

  it('empty query → only freeText, empty', () => {
    expect(parseNlQuery('')).toEqual({ freeText: '' });
  });
});

describe('cosineSimilarity — T6.2', () => {
  it('1 for identical, 0 for orthogonal', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });
  it('null for mismatched length or zero vector', () => {
    expect(cosineSimilarity([1, 2], [1])).toBeNull();
    expect(cosineSimilarity([0, 0], [1, 2])).toBeNull();
  });
});

describe('embeddingStatus — T6.2', () => {
  it('gates on engine then model', () => {
    expect(embeddingStatus({ enginePresent: false, modelPresent: true })).toBe('engine-missing');
    expect(embeddingStatus({ enginePresent: true, modelPresent: false })).toBe('model-missing');
    expect(embeddingStatus({ enginePresent: true, modelPresent: true })).toBe('available');
  });
});
