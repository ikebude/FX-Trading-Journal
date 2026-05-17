/**
 * T5.10 — margin usage, leverage utilisation, correlation-adjusted risk.
 * Pure; no money math beyond exposure ratios (Rule 3 keeps P&L in pnl.ts).
 */

export interface ExposurePosition {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  /** Notional in account currency (lots · contract size · price). */
  notional: number;
  /** Open risk to stop in account currency, if known. */
  riskAmount?: number | null;
}

export interface MarginUsage {
  totalNotional: number;
  /** Margin required = Σ notional / leverage. */
  marginUsed: number;
  /** marginUsed / equity (0–∞; > 1 means over-committed). */
  marginUtilisation: number;
  /** Effective account leverage actually deployed = totalNotional / equity. */
  effectiveLeverage: number;
}

export function computeMarginUsage(
  positions: ExposurePosition[],
  equity: number,
  leverage: number,
): MarginUsage {
  const totalNotional = positions.reduce((s, p) => s + Math.abs(p.notional), 0);
  const marginUsed = leverage > 0 ? totalNotional / leverage : totalNotional;
  return {
    totalNotional,
    marginUsed,
    marginUtilisation: equity > 0 ? marginUsed / equity : 0,
    effectiveLeverage: equity > 0 ? totalNotional / equity : 0,
  };
}

/**
 * Correlation-adjusted open risk. Naive-sum understates risk when
 * positions are correlated in the same net direction. Given a symbol
 * correlation matrix (ρ ∈ [-1,1]) and signed risk (LONG +, SHORT −),
 * portfolio risk = sqrt(Σ_i Σ_j ρ_ij · r_i · r_j), clamped ≥ |Σ r_i|·0.
 *
 * Falls back to the absolute sum when no correlations are supplied.
 */
export function correlationAdjustedRisk(
  positions: ExposurePosition[],
  corr: Record<string, Record<string, number>> = {},
): { naiveRisk: number; adjustedRisk: number } {
  const signed = positions.map((p) => ({
    symbol: p.symbol,
    r: (p.direction === 'LONG' ? 1 : -1) * Math.abs(p.riskAmount ?? 0),
  }));
  const naiveRisk = signed.reduce((s, p) => s + Math.abs(p.r), 0);

  let variance = 0;
  for (const a of signed) {
    for (const b of signed) {
      let rho: number;
      if (a.symbol === b.symbol) rho = 1;
      else rho = corr[a.symbol]?.[b.symbol] ?? corr[b.symbol]?.[a.symbol] ?? 0;
      variance += rho * a.r * b.r;
    }
  }
  // variance can be negative when offsetting hedges dominate → floor at 0.
  const adjustedRisk = Math.sqrt(Math.max(0, variance));
  return { naiveRisk, adjustedRisk };
}
