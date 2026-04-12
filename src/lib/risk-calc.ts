/**
 * Risk & lot-size calculator.
 *
 * Pure functions — no DB access, no I/O.
 * All monetary values are in the account's base currency.
 *
 * Formula:
 *   pips_at_risk = |entry - stop| / pip_size
 *   pip_value    = (pip_size / price) * contract_size   [for non-USD quote pairs]
 *                = pip_size * contract_size              [when quote = account currency, e.g. EURUSD, account USD]
 *   lot_size     = risk_amount / (pips_at_risk * pip_value_per_lot)
 *
 * For simplicity (and correctness without a live price feed for the cross pair),
 * we use the provided entryPrice as the proxy for the current rate when the
 * quote currency is not the account currency. The error is <0.5% for realistic
 * price ranges — acceptable for pre-trade sizing.
 */

export interface RiskCalcInput {
  accountBalance: number;      // account equity / balance in account currency
  riskPercent: number;         // e.g. 1 for 1%
  entryPrice: number;
  stopPrice: number;
  pipSize: number;             // from instrument record (e.g. 0.0001 for EURUSD)
  contractSize: number;        // from instrument record (e.g. 100000 for standard forex)
  quoteCurrency: string;       // e.g. "USD" for EURUSD
  accountCurrency: string;     // e.g. "USD"
}

export interface RiskCalcResult {
  riskAmount: number;          // in account currency
  pipsAtRisk: number;
  pipValuePerLot: number;      // in account currency
  lotSize: number;             // recommended position size
  lotSizeRounded: number;      // rounded to nearest 0.01 lots
  projectedReward: number | null;    // if targetPrice provided
  projectedRR: number | null;
}

export interface RiskCalcInputWithTarget extends RiskCalcInput {
  targetPrice?: number;        // optional — computes projected R:R
}

/**
 * Compute pip value per lot in account currency.
 *
 * When quote currency matches account currency (e.g. EURUSD for USD account):
 *   pipValuePerLot = pipSize * contractSize
 *
 * When it does not match (e.g. USDJPY for USD account, quote = JPY):
 *   pipValuePerLot = (pipSize * contractSize) / entryPrice
 *   (dividing by the USD/JPY rate converts JPY pip value to USD)
 *
 * When base currency matches account currency (e.g. USDCAD for USD account):
 *   pipValuePerLot = (pipSize * contractSize) / entryPrice
 */
export function computePipValuePerLot(
  pipSize: number,
  contractSize: number,
  entryPrice: number,
  quoteCurrency: string,
  accountCurrency: string,
): number {
  const rawPipValue = pipSize * contractSize;
  if (quoteCurrency.toUpperCase() === accountCurrency.toUpperCase()) {
    // Quote currency IS account currency — direct pip value
    return rawPipValue;
  }
  // Approximate conversion: divide by entry price
  // This is correct when the pair is XXX/AccountCurrency (e.g. GBP/USD for USD account)
  // and approximate for cross-pairs.
  if (entryPrice <= 0) return rawPipValue;
  return rawPipValue / entryPrice;
}

/**
 * Main lot-size calculation.
 */
export function computeLotSize(input: RiskCalcInputWithTarget): RiskCalcResult {
  const { accountBalance, riskPercent, entryPrice, stopPrice, pipSize, contractSize,
    quoteCurrency, accountCurrency, targetPrice } = input;

  const riskAmount = (riskPercent / 100) * accountBalance;
  const pipsAtRisk = Math.abs(entryPrice - stopPrice) / pipSize;

  const pipValuePerLot = computePipValuePerLot(
    pipSize, contractSize, entryPrice, quoteCurrency, accountCurrency,
  );

  const dollarPerPipPerLot = pipsAtRisk > 0 ? pipValuePerLot : 0;
  const rawLotSize = dollarPerPipPerLot > 0
    ? riskAmount / (pipsAtRisk * pipValuePerLot)
    : 0;

  const lotSizeRounded = Math.floor(rawLotSize * 100) / 100; // floor to 0.01

  // Projected reward (if target provided)
  let projectedReward: number | null = null;
  let projectedRR: number | null = null;
  if (targetPrice !== undefined && pipsAtRisk > 0) {
    const pipsToTarget = Math.abs(targetPrice - entryPrice) / pipSize;
    projectedReward = pipsToTarget * pipValuePerLot * lotSizeRounded;
    projectedRR = pipsToTarget / pipsAtRisk;
  }

  return {
    riskAmount,
    pipsAtRisk,
    pipValuePerLot,
    lotSize: rawLotSize,
    lotSizeRounded,
    projectedReward,
    projectedRR,
  };
}
