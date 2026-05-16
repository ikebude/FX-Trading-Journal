/**
 * T4.9 — Bridge heartbeat + server-time drift (pure, testable).
 *
 * The forex market trades ~24h Sunday 22:00 UTC → Friday 22:00 UTC. Outside
 * that window a silent bridge is expected, so we never raise a "quiet" alert.
 */

/** True when the FX spot market is open at the given instant (UTC). */
export function isForexMarketOpen(now: Date): boolean {
  const day = now.getUTCDay(); // 0 Sun … 6 Sat
  const hour = now.getUTCHours();
  if (day === 6) return false; // Saturday: closed all day
  if (day === 0) return hour >= 22; // Sunday: opens 22:00 UTC
  if (day === 5) return hour < 22; // Friday: closes 22:00 UTC
  return true; // Mon–Thu
}

export interface BridgeHealthInput {
  /** ISO-8601 UTC of the last bridge file processed, or null if none yet. */
  lastFileAtUtc: string | null;
  /** Now (UTC). */
  now: Date;
  /** EA-reported server time (ISO-8601 UTC) from the last file, if any. */
  serverTimeUtc?: string | null;
  /** Minutes of silence (during market hours) before "quiet". Default 5. */
  quietThresholdMin?: number;
  /** Seconds of server↔local drift before alerting. Default 30. */
  driftThresholdSec?: number;
}

export interface BridgeHealth {
  /** Bridge has been silent past the threshold while the market is open. */
  quiet: boolean;
  /** Signed seconds (serverTime − local); null when no server time. */
  driftSeconds: number | null;
  /** |driftSeconds| exceeds the threshold. */
  driftAlert: boolean;
}

export function evaluateBridgeHealth(input: BridgeHealthInput): BridgeHealth {
  const quietMs = (input.quietThresholdMin ?? 5) * 60_000;
  const driftLimit = input.driftThresholdSec ?? 30;
  const nowMs = input.now.getTime();

  let quiet = false;
  if (isForexMarketOpen(input.now)) {
    if (input.lastFileAtUtc == null) {
      quiet = true; // market open, never heard from the EA
    } else {
      const lastMs = new Date(input.lastFileAtUtc).getTime();
      if (!Number.isNaN(lastMs) && nowMs - lastMs >= quietMs) quiet = true;
    }
  }

  let driftSeconds: number | null = null;
  if (input.serverTimeUtc) {
    const s = new Date(input.serverTimeUtc).getTime();
    if (!Number.isNaN(s)) driftSeconds = Math.round((s - nowMs) / 1000);
  }
  const driftAlert = driftSeconds != null && Math.abs(driftSeconds) > driftLimit;

  return { quiet, driftSeconds, driftAlert };
}
