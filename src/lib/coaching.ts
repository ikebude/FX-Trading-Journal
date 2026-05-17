/**
 * T6.4 — end-of-day coaching prompts (pure, rule-based, no LLM).
 *
 * Deterministic insight rules over a single day's closed trades. Each rule
 * emits at most one short, specific, actionable line. Order = severity.
 */

export interface CoachingTrade {
  closedAtUtc: string | null;
  netPnl: number | null;
  rMultiple: number | null;
  /** Realised R at exit vs. planned target R, if both known. */
  plannedRr?: number | null;
  direction?: 'LONG' | 'SHORT';
  anxietyLevel?: number | null;
}

export interface CoachingInsight {
  /** Stable rule id (for dedupe / telemetry-free analytics). */
  id: string;
  severity: 'info' | 'watch' | 'warn';
  message: string;
}

const isWin = (t: CoachingTrade) => (t.netPnl ?? 0) > 0;
const isLoss = (t: CoachingTrade) => (t.netPnl ?? 0) < 0;

/**
 * Generate coaching insights for the given day's trades. Pure; empty when
 * there is nothing noteworthy (a calm, disciplined day needs no nagging).
 */
export function generateCoaching(trades: CoachingTrade[]): CoachingInsight[] {
  const out: CoachingInsight[] = [];
  const closed = trades.filter((t) => t.closedAtUtc && t.netPnl != null);
  if (closed.length === 0) return out;

  const wins = closed.filter(isWin);
  const losses = closed.filter(isLoss);

  // 1. Cut winners short — exited well before the 1R target.
  const earlyWinners = wins.filter(
    (t) => t.rMultiple != null && t.rMultiple > 0 && t.rMultiple < 1,
  );
  if (wins.length >= 2 && earlyWinners.length / wins.length >= 0.5) {
    out.push({
      id: 'cut-winners-short',
      severity: 'warn',
      message: `You exited ${earlyWinners.length} of ${wins.length} winners before 1R today — let winners run to target.`,
    });
  }

  // 2. Overtrading — high trade count in one day.
  if (closed.length >= 10) {
    out.push({
      id: 'overtrading',
      severity: 'warn',
      message: `${closed.length} trades today — well above a typical session. Quality over quantity.`,
    });
  }

  // 3. Loss streak — 3+ consecutive losses (by close time).
  const ordered = [...closed].sort((a, b) =>
    (a.closedAtUtc ?? '').localeCompare(b.closedAtUtc ?? ''),
  );
  let streak = 0;
  let maxStreak = 0;
  for (const t of ordered) {
    streak = isLoss(t) ? streak + 1 : 0;
    maxStreak = Math.max(maxStreak, streak);
  }
  if (maxStreak >= 3) {
    out.push({
      id: 'loss-streak',
      severity: 'warn',
      message: `${maxStreak} losses in a row today — a hard stop after 3 consecutive losses protects the account.`,
    });
  }

  // 4. Trading anxious — most trades logged with high anxiety.
  const anx = closed.filter((t) => (t.anxietyLevel ?? 0) >= 7);
  if (closed.length >= 3 && anx.length / closed.length >= 0.5) {
    out.push({
      id: 'high-anxiety',
      severity: 'watch',
      message: `Over half of today's trades were logged at high anxiety (≥7/10) — consider smaller size or a break when tense.`,
    });
  }

  // 5. Positive reinforcement — disciplined green day.
  if (
    out.length === 0 &&
    losses.length <= 1 &&
    wins.length >= 2 &&
    closed.reduce((s, t) => s + (t.netPnl ?? 0), 0) > 0
  ) {
    out.push({
      id: 'disciplined-day',
      severity: 'info',
      message: `Clean, disciplined session — ${wins.length} winners, controlled losses. Repeat the process, not the P&L.`,
    });
  }

  return out;
}
