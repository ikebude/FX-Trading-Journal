import { describe, expect, it } from 'vitest';
import {
  scoreCandidate,
  extractQualitative,
  QUALITATIVE_FIELDS,
  type ReconcileManualTrade,
  type ReconcileImportedTrade,
} from '../src/lib/reconcile';

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const baseManual: ReconcileManualTrade = {
  id: 'manual-1',
  symbol: 'EURUSD',
  direction: 'LONG',
  openedAtUtc: '2024-03-20T08:00:00.000Z',
  totalEntryVolume: 0.1,
  setupName: 'London Open',
  marketCondition: 'TRENDING',
  entryModel: 'LIMIT',
  confidence: 4,
  preTradeEmotion: 'CALM',
  postTradeEmotion: 'SATISFIED',
  initialStopPrice: 1.0850,
  initialTargetPrice: 1.0920,
  plannedRr: 2.5,
  plannedRiskAmount: 50,
  plannedRiskPct: 1,
};

const baseImported: ReconcileImportedTrade = {
  externalPositionId: 'pos-123',
  symbol: 'EURUSD',
  direction: 'LONG',
  openedAtUtc: '2024-03-20T08:00:00.000Z',
  entryVolume: 0.1,
};

// ─────────────────────────────────────────────────────────────
// scoreCandidate
// ─────────────────────────────────────────────────────────────

describe('scoreCandidate', () => {
  it('exact time + exact volume → score 100', () => {
    const score = scoreCandidate(baseImported, baseManual);
    expect(score).toBe(100);
  });

  it('base score (passes hard filters) starts at 50', () => {
    // No time or volume data → only base score
    const imported: ReconcileImportedTrade = {
      ...baseImported,
      openedAtUtc: null,
      entryVolume: 0,
    };
    const manual: ReconcileManualTrade = {
      ...baseManual,
      openedAtUtc: null,
      totalEntryVolume: null as unknown as number,
    };
    const score = scoreCandidate(imported, manual);
    expect(score).toBe(50);
  });

  it('1 minute apart → near-max time bonus (~24 points)', () => {
    const imported: ReconcileImportedTrade = {
      ...baseImported,
      openedAtUtc: '2024-03-20T08:01:00.000Z',
    };
    const score = scoreCandidate(imported, baseManual);
    // base(50) + time(30 - 1*6 = 24) + volume(20) = 94
    expect(score).toBe(94);
  });

  it('5 minutes apart → zero time bonus', () => {
    const imported: ReconcileImportedTrade = {
      ...baseImported,
      openedAtUtc: '2024-03-20T08:05:00.000Z',
    };
    const score = scoreCandidate(imported, baseManual);
    // base(50) + time(0) + volume(20) = 70
    expect(score).toBe(70);
  });

  it('0.05 lot difference → zero volume bonus', () => {
    const imported: ReconcileImportedTrade = {
      ...baseImported,
      entryVolume: 0.15, // 0.05 diff
    };
    const score = scoreCandidate(imported, baseManual);
    // base(50) + time(30) + volume(0) = 80
    expect(score).toBe(80);
  });

  it('0.025 lot difference → partial volume bonus (~10 points)', () => {
    const imported: ReconcileImportedTrade = {
      ...baseImported,
      entryVolume: 0.125, // 0.025 diff
    };
    const score = scoreCandidate(imported, baseManual);
    // base(50) + time(30) + volume(20 - 0.025*400 = 10) = 90
    expect(score).toBe(90);
  });

  it('score is capped at 100', () => {
    const score = scoreCandidate(baseImported, baseManual);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('score is always a whole number (rounded)', () => {
    const imported: ReconcileImportedTrade = {
      ...baseImported,
      openedAtUtc: '2024-03-20T08:00:30.000Z',
    };
    const score = scoreCandidate(imported, baseManual);
    expect(score).toBe(Math.round(score));
  });
});

// ─────────────────────────────────────────────────────────────
// extractQualitative
// ─────────────────────────────────────────────────────────────

describe('extractQualitative', () => {
  it('returns all qualitative fields from a manual trade', () => {
    const result = extractQualitative(baseManual);
    expect(result).toEqual({
      setupName: 'London Open',
      marketCondition: 'TRENDING',
      entryModel: 'LIMIT',
      confidence: 4,
      preTradeEmotion: 'CALM',
      postTradeEmotion: 'SATISFIED',
      initialStopPrice: 1.0850,
      initialTargetPrice: 1.0920,
      plannedRr: 2.5,
      plannedRiskAmount: 50,
      plannedRiskPct: 1,
    });
  });

  it('does not include id, symbol, direction, or openedAtUtc', () => {
    const result = extractQualitative(baseManual);
    expect('id' in result).toBe(false);
    expect('symbol' in result).toBe(false);
    expect('direction' in result).toBe(false);
    expect('openedAtUtc' in result).toBe(false);
  });

  it('preserves null qualitative fields', () => {
    const manual: ReconcileManualTrade = {
      ...baseManual,
      setupName: null,
      marketCondition: null,
      entryModel: null,
      confidence: null,
      preTradeEmotion: null,
      postTradeEmotion: null,
      initialStopPrice: null,
      initialTargetPrice: null,
      plannedRr: null,
      plannedRiskAmount: null,
      plannedRiskPct: null,
    };
    const result = extractQualitative(manual);
    for (const field of QUALITATIVE_FIELDS) {
      expect(result[field]).toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────
// QUALITATIVE_FIELDS constant
// ─────────────────────────────────────────────────────────────

describe('QUALITATIVE_FIELDS', () => {
  it('contains exactly 11 fields', () => {
    expect(QUALITATIVE_FIELDS).toHaveLength(11);
  });

  it('includes setupName', () => {
    expect(QUALITATIVE_FIELDS).toContain('setupName');
  });

  it('includes plannedRiskPct', () => {
    expect(QUALITATIVE_FIELDS).toContain('plannedRiskPct');
  });
});
