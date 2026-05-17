import { describe, it, expect } from 'vitest';
import {
  transcriptionStatus,
  canAutoTranscribe,
  transcriptionStatusMessage,
} from '../src/lib/transcription';

describe('transcriptionStatus — T6.1 (model-gated)', () => {
  it('available only when enabled + engine + model all present', () => {
    expect(
      transcriptionStatus({ enabled: true, enginePresent: true, modelPresent: true }),
    ).toBe('available');
    expect(canAutoTranscribe({ enabled: true, enginePresent: true, modelPresent: true })).toBe(
      true,
    );
  });

  it('disabled wins over everything', () => {
    expect(
      transcriptionStatus({ enabled: false, enginePresent: true, modelPresent: true }),
    ).toBe('disabled');
  });

  it('engine-missing before model-missing', () => {
    expect(
      transcriptionStatus({ enabled: true, enginePresent: false, modelPresent: true }),
    ).toBe('engine-missing');
  });

  it('model-missing when engine present but no model', () => {
    const s = transcriptionStatus({ enabled: true, enginePresent: true, modelPresent: false });
    expect(s).toBe('model-missing');
    expect(canAutoTranscribe({ enabled: true, enginePresent: true, modelPresent: false })).toBe(
      false,
    );
  });

  it('every status has a non-empty message', () => {
    for (const s of ['available', 'model-missing', 'engine-missing', 'disabled'] as const) {
      expect(transcriptionStatusMessage(s).length).toBeGreaterThan(0);
    }
  });
});
