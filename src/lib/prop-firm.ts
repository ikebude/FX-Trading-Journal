/**
 * Prop firm guardrail calculations.
 *
 * Pure functions — no DB access, no I/O.
 * All inputs are plain values; all outputs are plain values.
 * Called from the PropFirmBanner component with data fetched via IPC.
 */

import type { Account } from './db/schema';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type GuardrailLevel = 'OK' | 'WARNING' | 'BREACH';

export interface GuardrailStatus {
  level: GuardrailLevel;
  dailyLossCurrent: number;         // negative number (loss) or 0
  dailyLossLimit: number | null;    // absolute dollar limit (always positive)
  dailyLossPct: number | null;      // percentage of initial balance consumed (0-100)
  dailyLossLimitPct: number | null; // configured % limit (e.g. 5 for 5%)

  drawdownCurrent: number;          // absolute drawdown from peak (always positive or 0)
  drawdownLimit: number | null;     // absolute dollar drawdown limit
  drawdownPct: number | null;       // percentage of initial balance consumed (0-100)
  drawdownLimitPct: number | null;  // configured % limit

  profitCurrent: number;            // net P&L since account start
  profitTarget: number | null;      // absolute dollar target
  profitTargetPct: number | null;   // configured % target

  phase: Account['propPhase'];
}

// ─────────────────────────────────────────────────────────────
// Warning threshold — trigger amber at 70% of any limit
// ─────────────────────────────────────────────────────────────

const WARNING_THRESHOLD = 0.7;

// ─────────────────────────────────────────────────────────────
// computeGuardrails
// ─────────────────────────────────────────────────────────────

/**
 * Computes the current guardrail status for a PROP account.
 *
 * @param account  - The account record (must have accountType = 'PROP')
 * @param closedPnls - Array of net P&L values for ALL closed trades on the account
 *                     (in chronological order, oldest first)
 * @param todayClosedPnls - Net P&L values for trades closed TODAY (in account timezone)
 */
export function computeGuardrails(
  account: Account,
  closedPnls: number[],
  todayClosedPnls: number[],
): GuardrailStatus {
  const initial = account.initialBalance;

  // ── Daily loss ────────────────────────────────────────────
  const dailyLossCurrent = todayClosedPnls.reduce((a, b) => a + b, 0);

  // Absolute daily loss limit (from either the fixed amount or the percentage)
  let dailyLossLimit: number | null = account.propDailyLossLimit ?? null;
  if (dailyLossLimit === null && account.propDailyLossPct != null && initial > 0) {
    dailyLossLimit = (account.propDailyLossPct / 100) * initial;
  }

  const dailyLossPct =
    dailyLossLimit != null && dailyLossLimit > 0
      ? Math.min(100, (Math.abs(Math.min(0, dailyLossCurrent)) / dailyLossLimit) * 100)
      : null;

  // ── Max drawdown ──────────────────────────────────────────
  let peak = initial;
  let maxDrawdown = 0;
  let running = initial;
  for (const pnl of closedPnls) {
    running += pnl;
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  const drawdownCurrent = maxDrawdown;

  let drawdownLimit: number | null = account.propMaxDrawdown ?? null;
  if (drawdownLimit === null && account.propMaxDrawdownPct != null && initial > 0) {
    // For TRAILING drawdown type, limit is from peak; for STATIC it's from initial.
    // We always compute absolute limit from initial for conservative display.
    drawdownLimit = (account.propMaxDrawdownPct / 100) * initial;
  }

  const drawdownPct =
    drawdownLimit != null && drawdownLimit > 0
      ? Math.min(100, (drawdownCurrent / drawdownLimit) * 100)
      : null;

  // ── Profit target ─────────────────────────────────────────
  const profitCurrent = closedPnls.reduce((a, b) => a + b, 0);

  let profitTarget: number | null = account.propProfitTarget ?? null;
  if (profitTarget === null && account.propProfitTargetPct != null && initial > 0) {
    profitTarget = (account.propProfitTargetPct / 100) * initial;
  }

  // ── Level ─────────────────────────────────────────────────
  let level: GuardrailLevel = 'OK';

  // BREACH conditions
  const dailyLossBreached =
    dailyLossLimit != null && dailyLossCurrent < 0 &&
    Math.abs(dailyLossCurrent) >= dailyLossLimit;

  const drawdownBreached =
    drawdownLimit != null && drawdownCurrent >= drawdownLimit;

  if (dailyLossBreached || drawdownBreached) {
    level = 'BREACH';
  } else {
    // WARNING: >70% of any limit consumed
    const dailyWarn =
      dailyLossPct != null && dailyLossPct >= WARNING_THRESHOLD * 100;
    const ddWarn =
      drawdownPct != null && drawdownPct >= WARNING_THRESHOLD * 100;

    if (dailyWarn || ddWarn) level = 'WARNING';
  }

  return {
    level,
    dailyLossCurrent,
    dailyLossLimit,
    dailyLossPct,
    dailyLossLimitPct: account.propDailyLossPct ?? null,
    drawdownCurrent,
    drawdownLimit,
    drawdownPct,
    drawdownLimitPct: account.propMaxDrawdownPct ?? null,
    profitCurrent,
    profitTarget,
    profitTargetPct: account.propProfitTargetPct ?? null,
    phase: account.propPhase,
  };
}
