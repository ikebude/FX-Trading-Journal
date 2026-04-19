import { describe, expect, it } from 'vitest';
import { computeGuardrails } from '../src/lib/prop-firm';
import type { Account } from '../src/lib/db/schema';

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const NOW = '2024-03-20T12:00:00.000Z';

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc-1',
    name: 'Test Prop',
    broker: 'FTMO',
    accountCurrency: 'USD',
    initialBalance: 10000,
    accountType: 'PROP',
    displayColor: '#3b82f6',
    isActive: true,
    openedAtUtc: '2024-01-01T00:00:00.000Z',
    propDailyLossLimit: null,
    propDailyLossPct: null,
    propMaxDrawdown: null,
    propMaxDrawdownPct: null,
    propDrawdownType: null,
    propProfitTarget: null,
    propProfitTargetPct: null,
    propPhase: 'PHASE_1',
    // Broker metadata (v1.1 — T1.3); all nullable for forward-compat.
    server: null,
    platform: null,
    leverage: null,
    timezone: null,
    login: null,
    brokerType: null,
    createdAtUtc: NOW,
    updatedAtUtc: NOW,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────
// OK state — no limits configured
// ─────────────────────────────────────────────────────────────

describe('computeGuardrails — no limits configured', () => {
  it('returns OK when no limits are set', () => {
    const result = computeGuardrails(makeAccount(), [100, 200], [50]);
    expect(result.level).toBe('OK');
  });

  it('dailyLossLimit is null when no limit configured', () => {
    const result = computeGuardrails(makeAccount(), [], []);
    expect(result.dailyLossLimit).toBeNull();
    expect(result.drawdownLimit).toBeNull();
    expect(result.profitTarget).toBeNull();
  });

  it('computes profitCurrent as sum of all closed P&Ls', () => {
    const result = computeGuardrails(makeAccount(), [100, 200, -50], []);
    expect(result.profitCurrent).toBe(250);
  });
});

// ─────────────────────────────────────────────────────────────
// Daily loss — absolute limit
// ─────────────────────────────────────────────────────────────

describe('computeGuardrails — daily loss (absolute)', () => {
  const account = makeAccount({ propDailyLossLimit: 500 });

  it('OK when daily loss is zero', () => {
    const result = computeGuardrails(account, [], [0]);
    expect(result.level).toBe('OK');
  });

  it('OK when daily loss is below 70% threshold', () => {
    const result = computeGuardrails(account, [], [-300]); // 60% of 500
    expect(result.level).toBe('OK');
  });

  it('WARNING when daily loss reaches 70% of limit', () => {
    const result = computeGuardrails(account, [], [-350]); // 70% of 500
    expect(result.level).toBe('WARNING');
  });

  it('BREACH when daily loss equals the limit', () => {
    const result = computeGuardrails(account, [], [-500]);
    expect(result.level).toBe('BREACH');
  });

  it('BREACH when daily loss exceeds the limit', () => {
    const result = computeGuardrails(account, [], [-600]);
    expect(result.level).toBe('BREACH');
  });

  it('profits on the day do not count as losses', () => {
    const result = computeGuardrails(account, [], [200, 300]);
    expect(result.level).toBe('OK');
    expect(result.dailyLossCurrent).toBeGreaterThan(0);
  });

  it('dailyLossPct is 100 when exactly at limit', () => {
    const result = computeGuardrails(account, [], [-500]);
    expect(result.dailyLossPct).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────
// Daily loss — percentage limit
// ─────────────────────────────────────────────────────────────

describe('computeGuardrails — daily loss (percentage)', () => {
  // 5% of $10,000 = $500 limit
  const account = makeAccount({ propDailyLossPct: 5 });

  it('computes absolute limit from percentage', () => {
    const result = computeGuardrails(account, [], []);
    expect(result.dailyLossLimit).toBe(500);
  });

  it('WARNING at 70% of percentage limit', () => {
    const result = computeGuardrails(account, [], [-350]);
    expect(result.level).toBe('WARNING');
  });

  it('BREACH at 100% of percentage limit', () => {
    const result = computeGuardrails(account, [], [-500]);
    expect(result.level).toBe('BREACH');
  });
});

// ─────────────────────────────────────────────────────────────
// Max drawdown — absolute limit
// ─────────────────────────────────────────────────────────────

describe('computeGuardrails — max drawdown (absolute)', () => {
  const account = makeAccount({ propMaxDrawdown: 1000 });

  it('OK when no losses', () => {
    const result = computeGuardrails(account, [100, 200], []);
    expect(result.level).toBe('OK');
  });

  it('computes drawdown from equity peak', () => {
    // Peak at 10,000 + 500 = 10,500; then draws down to 10,500 - 800 = 9,700 → DD = 800
    // 800 / 1000 = 80% which exceeds the 70% WARNING threshold
    const result = computeGuardrails(account, [500, -800], []);
    expect(result.drawdownCurrent).toBe(800);
    expect(result.level).toBe('WARNING');
  });

  it('WARNING at 70% of drawdown limit', () => {
    const result = computeGuardrails(account, [-700], []);
    expect(result.level).toBe('WARNING');
  });

  it('BREACH when drawdown reaches limit', () => {
    const result = computeGuardrails(account, [-1000], []);
    expect(result.level).toBe('BREACH');
  });

  it('BREACH when drawdown exceeds limit', () => {
    const result = computeGuardrails(account, [-1200], []);
    expect(result.level).toBe('BREACH');
  });

  it('drawdown of 0 when all trades are profitable', () => {
    const result = computeGuardrails(account, [100, 200, 300], []);
    expect(result.drawdownCurrent).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Max drawdown — percentage limit
// ─────────────────────────────────────────────────────────────

describe('computeGuardrails — max drawdown (percentage)', () => {
  // 10% of $10,000 = $1,000
  const account = makeAccount({ propMaxDrawdownPct: 10 });

  it('computes absolute limit from percentage', () => {
    const result = computeGuardrails(account, [], []);
    expect(result.drawdownLimit).toBe(1000);
  });

  it('BREACH at 100% of drawdown percentage limit', () => {
    const result = computeGuardrails(account, [-1000], []);
    expect(result.level).toBe('BREACH');
  });
});

// ─────────────────────────────────────────────────────────────
// Profit target
// ─────────────────────────────────────────────────────────────

describe('computeGuardrails — profit target', () => {
  const account = makeAccount({ propProfitTarget: 800 });

  it('returns profitTarget in result', () => {
    const result = computeGuardrails(account, [500], []);
    expect(result.profitTarget).toBe(800);
  });

  it('level stays OK even after profit target hit (not a breach)', () => {
    const result = computeGuardrails(account, [900], []);
    expect(result.level).toBe('OK');
    expect(result.profitCurrent).toBe(900);
  });
});

// ─────────────────────────────────────────────────────────────
// Phase passthrough
// ─────────────────────────────────────────────────────────────

describe('computeGuardrails — phase', () => {
  it('passes through PHASE_1', () => {
    const result = computeGuardrails(makeAccount({ propPhase: 'PHASE_1' }), [], []);
    expect(result.phase).toBe('PHASE_1');
  });

  it('passes through FUNDED', () => {
    const result = computeGuardrails(makeAccount({ propPhase: 'FUNDED' }), [], []);
    expect(result.phase).toBe('FUNDED');
  });
});

// ─────────────────────────────────────────────────────────────
// Both limits breached simultaneously
// ─────────────────────────────────────────────────────────────

describe('computeGuardrails — multiple limit breaches', () => {
  it('BREACH when both daily loss and drawdown are breached', () => {
    const account = makeAccount({
      propDailyLossLimit: 300,
      propMaxDrawdown: 400,
    });
    const result = computeGuardrails(account, [-500], [-400]);
    expect(result.level).toBe('BREACH');
  });
});
