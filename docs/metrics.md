# Metrics reference — FXLedger

This document defines the advanced metrics shown in the Dashboard and the thresholds
used for color-coding in the UI.

## Calmar Ratio (time-normalized)

Definition
: Annualized return divided by maximum drawdown (max drawdown expressed as a
fraction, e.g. 10% → 0.10).

Computation (FXLedger)
: 1) Compute total return = Net P&L / Starting Balance.
  2) Derive measured period from the equity curve timestamps (first → last).
  3) Convert period to years (days / 365).
  4) Annualized return = (1 + totalReturn)^(1/years) − 1 (guard: if totalReturn ≤ −1 → annualized = −1).
  5) Calmar = annualizedReturn / (maxDrawdownPct / 100).

Notes
: - If the equity-curve period is very short (e.g., a few days), annualization
  can produce misleadingly large numbers — use the dashboard tooltip to inspect
  the `Period used` and `Annualized return` values.

Recommended interpretation
: - Calmar ≥ 2: excellent (green)
  - 1 ≤ Calmar < 2: acceptable (amber)
  - Calmar < 1: poor (red)

## Sortino Ratio

Definition
: Mean return divided by downside deviation (only negative returns considered).

Interpretation
: Higher is better. FXLedger uses the population denominator (N) for downside
variance as a conservative measure.

Recommended thresholds
: - ≥ 1: good (green)
  - 0.5–1: mixed (amber)
  - < 0.5: poor (red)

## Recovery Factor

Definition
: Net P&L divided by absolute maximum drawdown.

Interpretation
: Higher means the trading performance has produced more net profit relative
to the worst peak-to-trough loss. Values < 1 mean the account hasn't yet
recovered from its largest drawdown.

Recommended thresholds
: - ≥ 2: good (green)
  - 1 ≤ Recovery < 2: acceptable (amber)
  - Recovery < 1: poor (red)

## Expectancy and 95% CI

Definition
: Expectancy is the average R-multiple per trade. FXLedger also reports a 95%
confidence interval computed as mean ± 1.96 × (sd / sqrt(n)), where sd is the
sample standard deviation of R-multiples and n is the number of trades.

Interpretation
: If the 95% CI does not include 0, the expectancy is statistically significant
at ≈95% confidence.

---

If you want these thresholds or wording tweaked for your trading style or for
prop-firm presets, say which presets (e.g., conservative / balanced / aggressive)
and I will add a short section with per-preset thresholds and examples.
