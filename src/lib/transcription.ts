/**
 * T6.1 — local voice-memo transcription policy (pure, model-gated).
 *
 * The heavy Whisper engine lives in the main process (lazy-imported).
 * This module holds the *pure* gating logic so it is unit-testable
 * without loading any native binary or model:
 *   - decide whether transcription is available
 *   - produce a stable user-facing status
 *
 * No network, ever (Rule 11): a missing model means "manual transcript".
 */

export type TranscriptionStatus =
  | 'available' // engine + model present → auto-transcribe
  | 'model-missing' // engine present, model not bundled/downloaded
  | 'engine-missing' // optional native dep not installed
  | 'disabled'; // user turned the feature off

export interface TranscriptionGateInput {
  /** User setting (default true). */
  enabled: boolean;
  /** Optional native dep resolvable (require/import succeeds). */
  enginePresent: boolean;
  /** Whisper model file exists on disk. */
  modelPresent: boolean;
}

export function transcriptionStatus(i: TranscriptionGateInput): TranscriptionStatus {
  if (!i.enabled) return 'disabled';
  if (!i.enginePresent) return 'engine-missing';
  if (!i.modelPresent) return 'model-missing';
  return 'available';
}

export function canAutoTranscribe(i: TranscriptionGateInput): boolean {
  return transcriptionStatus(i) === 'available';
}

/** Human-readable explanation for the UI when auto-transcription is off. */
export function transcriptionStatusMessage(s: TranscriptionStatus): string {
  switch (s) {
    case 'available':
      return 'Voice memos are transcribed automatically (offline).';
    case 'model-missing':
      return 'Speech model not installed — memos are saved; add the model to enable auto-transcription. You can still type a transcript.';
    case 'engine-missing':
      return 'Transcription engine unavailable in this build — memos are saved; type a transcript manually.';
    case 'disabled':
      return 'Auto-transcription is turned off in Settings.';
  }
}
