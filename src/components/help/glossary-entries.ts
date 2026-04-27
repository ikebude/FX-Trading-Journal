export interface GlossaryEntry {
  term: string;
  definition: string;
  example?: string;
  seeAlso?: string[];
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    term: 'R-multiple',
    definition:
      'Profit or loss expressed as a multiple of your initial risk. +2R means you made twice what you risked. −1R means you lost your full risk amount.',
    example: 'You risk $50, win $100 → +2R. You risk $50, lose $50 → −1R.',
    seeAlso: ['R:R (Risk:Reward)', 'Expectancy'],
  },
  {
    term: 'R:R (Risk:Reward)',
    definition:
      'The ratio of your target profit to your risk on a trade before entry. A 1:2 R:R means you target $200 profit while risking $100.',
    example: 'Stop 20 pips below entry, target 40 pips above → 1:2 R:R.',
    seeAlso: ['R-multiple'],
  },
  {
    term: 'Expectancy',
    definition:
      'Average R-multiple across all closed trades. Positive expectancy means you make money on average per trade, even with a sub-50% win rate.',
    example:
      '60% win rate × +1.5R average win − 40% loss rate × 1R average loss = +0.5R expectancy.',
    seeAlso: ['R-multiple', 'Profit Factor'],
  },
  {
    term: 'Profit Factor',
    definition:
      'Gross profit divided by gross loss. Above 1.0 means you earn more than you lose overall. A value of 1.5 means you made $1.50 for every $1.00 lost.',
    example: 'Total wins $3,000, total losses $2,000 → Profit Factor = 1.5.',
    seeAlso: ['Expectancy'],
  },
  {
    term: 'Sharpe Ratio',
    definition:
      'Risk-adjusted return: average R-multiple divided by the standard deviation of R-multiples. Higher is better. Above 1.0 is generally acceptable.',
    seeAlso: ['Sortino Ratio'],
  },
  {
    term: 'Sortino Ratio',
    definition:
      'Like Sharpe Ratio but only penalises downside volatility (losing trades), not upside. Better suited to trading where large wins are desirable.',
    seeAlso: ['Sharpe Ratio'],
  },
  {
    term: 'Calmar Ratio',
    definition:
      'Risk-adjusted performance metric computed as annualized return divided by maximum drawdown (as a fraction). Higher is better; values >1 are generally desirable. In FXLedger Calmar is time-normalized using the equity-curve period.',
    example: 'Annualized return 20% and max drawdown 10% → Calmar = 0.20 / 0.10 = 2.0',
    seeAlso: ['Max Drawdown', 'Equity Curve'],
  },
  {
    term: 'Recovery Factor',
    definition:
      'Net P&L divided by absolute maximum drawdown. Measures how many units of net profit were earned per unit of the largest peak-to-trough loss. Higher is better; values <1 indicate the account has not recovered from its largest drawdown.',
    example: 'Net P&L $2,000, Max DD $1,000 → Recovery Factor = 2.0',
    seeAlso: ['Max Drawdown'],
  },
  {
    term: 'Max Drawdown',
    definition:
      'The largest peak-to-trough decline in account equity during the measured period. A key risk metric — prop firms set hard limits on this.',
    example: 'Equity peaks at $11,000 then falls to $9,500 → Max DD = $1,500.',
    seeAlso: ['Equity Curve'],
  },
  {
    term: 'Equity Curve',
    definition:
      'A chart of cumulative account balance or P&L over time. A smooth upward slope with shallow dips indicates consistent, low-risk trading.',
    seeAlso: ['Max Drawdown'],
  },
  {
    term: 'Pip / Pip Size',
    definition:
      'The smallest standard price increment for a currency pair. For most pairs (e.g. EURUSD) 1 pip = 0.0001. For JPY pairs 1 pip = 0.01. For gold (XAUUSD) 1 pip = 0.1.',
    example: 'EURUSD moves from 1.0800 to 1.0850 = 50 pips.',
  },
  {
    term: 'Lot Size',
    definition:
      'The volume of a trade. 1 standard lot = 100,000 units of base currency. 0.01 lots = 1 micro-lot. Pip value depends on lot size and pair.',
    example: '1 lot on EURUSD = $10/pip. 0.10 lots = $1/pip.',
    seeAlso: ['Pip / Pip Size'],
  },
  {
    term: 'Spread',
    definition:
      'The difference between the bid (sell) and ask (buy) price quoted by your broker. You pay the spread on every trade as an implicit cost.',
    example: 'EURUSD bid 1.0800, ask 1.0802 → spread = 2 pips.',
  },
  {
    term: 'Slippage',
    definition:
      'The difference between your intended entry/exit price and the price you actually got. Common during fast markets and news events.',
    seeAlso: ['Spread'],
  },
  {
    term: 'Commission',
    definition:
      'A fixed fee charged per lot traded by ECN/raw-spread brokers. Appears as a negative value on each trade leg in FXLedger.',
    example: '$7/lot round-trip = −$3.50 on entry leg, −$3.50 on exit leg.',
  },
  {
    term: 'Kill Zone',
    definition:
      'A high-probability trading window when major session opens overlap and institutional order flow is highest. The main kill zones are London Open (7–9 AM GMT), NY Open (12–2 PM GMT), and London Close (3–5 PM GMT).',
    seeAlso: ['Asian / London / NY Session'],
  },
  {
    term: 'Asian / London / NY Session',
    definition:
      'The three main forex trading sessions. Asia (Tokyo): 11 PM – 8 AM GMT. London: 7 AM – 4 PM GMT. New York: 12 PM – 9 PM GMT. Overlap periods have the highest volume.',
    seeAlso: ['Kill Zone'],
  },
  {
    term: 'Confluence',
    definition:
      'Multiple independent signals or reasons that align at the same price level or time. More confluences = higher-probability trade setup.',
    example:
      'Price at a key support level + aligned with the daily trend + inside a kill zone = 3 confluences.',
  },
  {
    term: 'ICT 2022',
    definition:
      'Inner Circle Trader mentorship model (2022 curriculum). Focuses on smart money concepts: order blocks, fair value gaps, liquidity sweeps, and market structure shifts.',
    seeAlso: ['SMC (Smart Money Concepts)'],
  },
  {
    term: 'SMC (Smart Money Concepts)',
    definition:
      'A trading methodology based on tracking institutional (smart money) activity through order blocks, imbalances, and liquidity pools rather than retail indicators.',
    seeAlso: ['ICT 2022'],
  },
  {
    term: 'FOMO',
    definition:
      'Fear Of Missing Out. The impulse to enter a trade that has already moved significantly, outside your setup criteria. A leading cause of poor entries and outsized losses.',
    seeAlso: ['Revenge Trading'],
  },
  {
    term: 'Revenge Trading',
    definition:
      'Taking trades to "win back" losses after a losing trade or session. Typically bypasses your trading plan and leads to compounding losses. Tag your trades to identify this pattern.',
    seeAlso: ['FOMO'],
  },
  {
    term: 'Setup',
    definition:
      'A defined, repeatable set of conditions that must be met before you take a trade. Examples: "Order Block Retest", "FVG Fill", "Breakout Retest". FXLedger tracks performance per setup.',
  },
  {
    term: 'Entry Model',
    definition:
      'The specific trigger used to enter a trade once the setup conditions are met. Examples: "M1 BOS", "Engulfing candle", "Limit order at 50%". A setup may have multiple valid entry models.',
    seeAlso: ['Setup'],
  },
  {
    term: 'Prop Firm',
    definition:
      'A proprietary trading firm that provides funded accounts to traders who pass a qualifying challenge. Traders keep 70–90% of profits but must follow strict daily loss and drawdown limits.',
    seeAlso: ['Phase 1 / Phase 2 / Funded', 'Daily Loss Limit'],
  },
  {
    term: 'Phase 1 / Phase 2 / Funded',
    definition:
      "The typical prop firm evaluation structure. Phase 1 and 2 are challenge stages with profit targets and loss limits. Funded is the live account stage where you trade the firm's capital.",
    seeAlso: ['Prop Firm'],
  },
  {
    term: 'Daily Loss Limit',
    definition:
      'A prop firm rule that caps how much you can lose in a single trading day (usually 4–5% of account balance). Breaching it instantly fails the challenge or funded account.',
    example: '$100k account, 5% daily loss limit = you cannot lose more than $5,000 in one day.',
    seeAlso: ['Prop Firm', 'Max Drawdown'],
  },
];

export const GLOSSARY_MAP = new Map<string, GlossaryEntry>(
  GLOSSARY.map((e) => [e.term.toLowerCase(), e]),
);

export function getEntry(term: string): GlossaryEntry | undefined {
  return GLOSSARY_MAP.get(term.toLowerCase());
}
