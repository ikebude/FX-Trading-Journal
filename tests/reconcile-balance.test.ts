/**
 * Regression suite for the balance-reconciliation engine (v1.1 T1.5).
 *
 * The v1.1 implementation plan §1.5 requires:
 *   "Balance reconciliation (S02) holds for 1000 synthetic deal events
 *    with zero drift."
 *
 * This suite enforces that invariant and adds property-style coverage for
 * order-independence, soft-delete correctness, NaN-guards, tolerance
 * semantics and severity classification.
 */

import { describe, it, expect } from 'vitest';
import {
  reconcileBalance,
  type ReconcileBalanceOp,
  type ReconcileTradePnl,
  type ReconcileInput,
} from '../src/lib/reconcile-balance';

// ─────────────────────────────────────────────────────────────
// Fixture builders
// ─────────────────────────────────────────────────────────────

function mkOp(
  partial: Partial<ReconcileBalanceOp> & { amount: number },
): ReconcileBalanceOp {
  return {
    id: partial.id ?? `op-${Math.random().toString(36).slice(2, 10)}`,
    accountId: partial.accountId ?? 'acc-1',
    opType: partial.opType ?? 'DEPOSIT',
    amount: partial.amount,
    occurredAtUtc: partial.occurredAtUtc ?? '2026-01-01T00:00:00.000Z',
    deletedAtUtc: partial.deletedAtUtc ?? null,
  };
}

function mkTrade(
  partial: Partial<ReconcileTradePnl> & { netPnl: number },
): ReconcileTradePnl {
  return {
    tradeId: partial.tradeId ?? `tr-${Math.random().toString(36).slice(2, 10)}`,
    closedAtUtc: partial.closedAtUtc ?? '2026-01-01T00:00:00.000Z',
    netPnl: partial.netPnl,
  };
}

function baseInput(overrides: Partial<ReconcileInput> = {}): ReconcileInput {
  return {
    accountId: 'acc-1',
    initialBalance: 10_000,
    balanceOperations: [],
    closedTrades: [],
    reportedBalance: null,
    ...overrides,
  };
}

// Deterministic pseudo-RNG so the 1000-event test is reproducible.
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────
// Core math
// ─────────────────────────────────────────────────────────────

describe('reconcileBalance — core math', () => {
  it('empty account → expected == initial', () => {
    const r = reconcileBalance(baseInput({ initialBalance: 5_000 }));
    expect(r.expectedBalance).toBe(5_000);
    expect(r.tradePnlTotal).toBe(0);
    expect(r.balanceOpsTotal).toBe(0);
  });

  it('deposit then withdrawal then single winning trade', () => {
    const r = reconcileBalance(
      baseInput({
        initialBalance: 1_000,
        balanceOperations: [
          mkOp({ amount: 500, opType: 'DEPOSIT' }),
          mkOp({ amount: -200, opType: 'WITHDRAWAL' }),
        ],
        closedTrades: [mkTrade({ netPnl: 75.5 })],
        reportedBalance: 1_375.5,
      }),
    );
    expect(r.expectedBalance).toBeCloseTo(1_375.5, 10);
    expect(r.drift).toBeCloseTo(0, 10);
    expect(r.withinTolerance).toBe(true);
    expect(r.severity).toBe('NONE');
  });

  it('reportedBalance === null → no drift computed, withinTolerance true', () => {
    const r = reconcileBalance(
      baseInput({
        initialBalance: 1_000,
        closedTrades: [mkTrade({ netPnl: 50 })],
        reportedBalance: null,
      }),
    );
    expect(r.expectedBalance).toBe(1_050);
    expect(r.drift).toBeNull();
    expect(r.absDrift).toBeNull();
    expect(r.withinTolerance).toBe(true);
    expect(r.severity).toBe('NONE');
    expect(r.summary).toMatch(/No reported broker balance/i);
  });
});

// ─────────────────────────────────────────────────────────────
// Soft-delete, NaN guard, counts
// ─────────────────────────────────────────────────────────────

describe('reconcileBalance — integrity guards', () => {
  it('soft-deleted balance ops are ignored', () => {
    const r = reconcileBalance(
      baseInput({
        balanceOperations: [
          mkOp({ amount: 500, opType: 'DEPOSIT' }),
          mkOp({
            amount: 99_999,
            opType: 'BONUS',
            deletedAtUtc: '2026-02-01T00:00:00.000Z',
          }),
        ],
      }),
    );
    expect(r.balanceOpsTotal).toBe(500);
    expect(r.counts.balanceOps).toBe(1);
    expect(r.counts.balanceOpsByType.BONUS).toBeUndefined();
  });

  it('non-finite trade netPnl is coerced to 0 and flagged in summary', () => {
    const r = reconcileBalance(
      baseInput({
        closedTrades: [
          mkTrade({ netPnl: 100 }),
          mkTrade({ netPnl: Number.NaN }),
          mkTrade({ netPnl: Number.POSITIVE_INFINITY }),
        ],
      }),
    );
    expect(r.tradePnlTotal).toBe(100);
    expect(r.summary).toMatch(/2 trade\(s\) had non-finite netPnl/);
  });

  it('op-type counts aggregate correctly', () => {
    const r = reconcileBalance(
      baseInput({
        balanceOperations: [
          mkOp({ amount: 100, opType: 'DEPOSIT' }),
          mkOp({ amount: 200, opType: 'DEPOSIT' }),
          mkOp({ amount: -50, opType: 'COMMISSION' }),
        ],
      }),
    );
    expect(r.counts.balanceOpsByType.DEPOSIT).toBe(2);
    expect(r.counts.balanceOpsByType.COMMISSION).toBe(1);
  });

  it('rejects non-finite tolerance', () => {
    expect(() =>
      reconcileBalance(baseInput({ tolerance: Number.NaN })),
    ).toThrow(/tolerance/);
    expect(() =>
      reconcileBalance(baseInput({ tolerance: -1 })),
    ).toThrow(/tolerance/);
  });

  it('rejects non-finite initialBalance', () => {
    expect(() =>
      reconcileBalance(baseInput({ initialBalance: Number.NaN })),
    ).toThrow(/initialBalance/);
  });
});

// ─────────────────────────────────────────────────────────────
// Severity classification
// ─────────────────────────────────────────────────────────────

describe('reconcileBalance — severity classification', () => {
  it('drift within tolerance → NONE', () => {
    const r = reconcileBalance(
      baseInput({ reportedBalance: 10_000.005, tolerance: 0.01 }),
    );
    expect(r.severity).toBe('NONE');
    expect(r.withinTolerance).toBe(true);
  });

  it('drift above tolerance but below major floor → MINOR', () => {
    // initial 10_000 → 1% floor = 100, tolerance 0.01 × 10 = 0.1, $10 floor.
    // Drift of $5 is above tolerance (0.01) but below majorFloor (max = 100).
    const r = reconcileBalance(
      baseInput({ initialBalance: 10_000, reportedBalance: 10_005 }),
    );
    expect(r.drift).toBeCloseTo(5, 10);
    expect(r.severity).toBe('MINOR');
    expect(r.withinTolerance).toBe(false);
  });

  it('drift above major floor → MAJOR', () => {
    const r = reconcileBalance(
      baseInput({ initialBalance: 10_000, reportedBalance: 10_500 }),
    );
    expect(r.drift).toBeCloseTo(500, 10);
    expect(r.severity).toBe('MAJOR');
  });

  it('negative drift (broker reports LESS than expected) is still classified', () => {
    const r = reconcileBalance(
      baseInput({ initialBalance: 10_000, reportedBalance: 9_400 }),
    );
    expect(r.drift).toBeCloseTo(-600, 10);
    expect(r.absDrift).toBeCloseTo(600, 10);
    expect(r.severity).toBe('MAJOR');
  });
});

// ─────────────────────────────────────────────────────────────
// Order-independence property
// ─────────────────────────────────────────────────────────────

describe('reconcileBalance — order independence', () => {
  it('shuffling balance_operations does not change expectedBalance', () => {
    const ops = [
      mkOp({ amount: 100 }),
      mkOp({ amount: -25.5 }),
      mkOp({ amount: 42.07 }),
      mkOp({ amount: -3 }),
      mkOp({ amount: 500 }),
    ];
    const trades = [
      mkTrade({ netPnl: 17.3 }),
      mkTrade({ netPnl: -8.1 }),
      mkTrade({ netPnl: 55 }),
    ];
    const a = reconcileBalance(
      baseInput({ balanceOperations: ops, closedTrades: trades }),
    );
    const b = reconcileBalance(
      baseInput({
        balanceOperations: [...ops].reverse(),
        closedTrades: [...trades].reverse(),
      }),
    );
    // Floating point: addition is not strictly associative but for these
    // magnitudes the difference is well under 1e-10.
    expect(a.expectedBalance).toBeCloseTo(b.expectedBalance, 10);
  });
});

// ─────────────────────────────────────────────────────────────
// The critical invariant — plan §1.5
// ─────────────────────────────────────────────────────────────

describe('reconcileBalance — 1000 synthetic deal events (plan §1.5)', () => {
  it('reportedBalance == expectedBalance ⇒ zero drift across 1000 events', () => {
    const rng = mulberry32(0xC0FFEE);
    const ops: ReconcileBalanceOp[] = [];
    const trades: ReconcileTradePnl[] = [];
    const opTypes: ReconcileBalanceOp['opType'][] = [
      'DEPOSIT',
      'WITHDRAWAL',
      'BONUS',
      'CREDIT',
      'CHARGE',
      'CORRECTION',
      'COMMISSION',
      'INTEREST',
      'PAYOUT',
      'OTHER',
    ];
    let runningTruth = 10_000; // initialBalance

    for (let i = 0; i < 1000; i++) {
      // 60% trades, 40% balance ops — mirrors a real active account.
      if (rng() < 0.6) {
        // Two-decimal P&L in [-200, +200]
        const pnl = Math.round((rng() * 400 - 200) * 100) / 100;
        trades.push(
          mkTrade({
            tradeId: `tr-${i}`,
            closedAtUtc: `2026-01-01T${String(i % 24).padStart(2, '0')}:00:00.000Z`,
            netPnl: pnl,
          }),
        );
        runningTruth += pnl;
      } else {
        const opType = opTypes[Math.floor(rng() * opTypes.length)];
        // Sign follows the schema convention.
        const signIsNegative = (
          ['WITHDRAWAL', 'CHARGE', 'COMMISSION', 'PAYOUT'] as const
        ).includes(opType as 'WITHDRAWAL' | 'CHARGE' | 'COMMISSION' | 'PAYOUT');
        const magnitude = Math.round(rng() * 100_00) / 100; // 0.00 – 100.00
        const amount = signIsNegative ? -magnitude : magnitude;
        ops.push(
          mkOp({
            id: `op-${i}`,
            amount,
            opType,
            occurredAtUtc: `2026-01-02T00:00:00.${String(i).padStart(3, '0')}Z`,
          }),
        );
        runningTruth += amount;
      }
    }

    const r = reconcileBalance({
      accountId: 'synthetic',
      initialBalance: 10_000,
      balanceOperations: ops,
      closedTrades: trades,
      reportedBalance: runningTruth,
      tolerance: 0.01,
    });

    expect(r.counts.closedTrades + r.counts.balanceOps).toBe(1000);
    // Floating-point: 1000 additions of two-decimal values can accrue at
    // the 1e-11 scale. The plan's "zero drift" means "within tolerance",
    // not bit-exact — a $0.01 tolerance is the product-level truth.
    expect(r.absDrift!).toBeLessThanOrEqual(0.01);
    expect(r.withinTolerance).toBe(true);
    expect(r.severity).toBe('NONE');
  });

  it('one missing $50 withdrawal in 1000 events is detected as drift', () => {
    const rng = mulberry32(0xBADC0DE);
    const ops: ReconcileBalanceOp[] = [];
    const trades: ReconcileTradePnl[] = [];
    let runningTruth = 10_000;

    for (let i = 0; i < 999; i++) {
      const pnl = Math.round((rng() * 100 - 50) * 100) / 100;
      trades.push(mkTrade({ tradeId: `tr-${i}`, netPnl: pnl }));
      runningTruth += pnl;
    }
    // The broker reported this $50 withdrawal, but we failed to ingest it.
    const hiddenWithdrawal = 50;
    runningTruth -= hiddenWithdrawal;

    const r = reconcileBalance({
      accountId: 'synthetic',
      initialBalance: 10_000,
      balanceOperations: ops,
      closedTrades: trades,
      reportedBalance: runningTruth,
      tolerance: 0.01,
    });

    expect(r.withinTolerance).toBe(false);
    expect(r.absDrift!).toBeGreaterThan(49.9);
    expect(r.absDrift!).toBeLessThan(50.1);
    expect(r.severity).toBe('MINOR'); // $50 < 1% of $10k floor ($100)
  });
});

// ─────────────────────────────────────────────────────────────
// lastActivityUtc
// ─────────────────────────────────────────────────────────────

describe('reconcileBalance — lastActivityUtc', () => {
  it('picks the max timestamp across ops and trades', () => {
    const r = reconcileBalance(
      baseInput({
        balanceOperations: [
          mkOp({ amount: 1, occurredAtUtc: '2026-01-01T00:00:00.000Z' }),
          mkOp({ amount: 1, occurredAtUtc: '2026-03-15T12:00:00.000Z' }),
        ],
        closedTrades: [
          mkTrade({ netPnl: 1, closedAtUtc: '2026-02-01T00:00:00.000Z' }),
          mkTrade({ netPnl: 1, closedAtUtc: '2026-04-10T08:00:00.000Z' }),
        ],
      }),
    );
    expect(r.lastActivityUtc).toBe('2026-04-10T08:00:00.000Z');
  });

  it('null when no ops or trades', () => {
    const r = reconcileBalance(baseInput());
    expect(r.lastActivityUtc).toBeNull();
  });
});
