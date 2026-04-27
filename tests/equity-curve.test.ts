import { describe, it, expect } from 'vitest';
import { buildModifiedDietzCurve } from '../src/lib/equity-curve';
import type { EquityPoint } from '../src/lib/pnl';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function makeEquityPoints(startBalance: number, pnls: Array<{ ts: string; pnl: number }>): EquityPoint[] {
  let running = startBalance;
  let peak = startBalance;
  return pnls.map(({ ts, pnl }) => {
    running += pnl;
    if (running > peak) peak = running;
    const drawdown = Math.max(0, peak - running);
    return { timestamp: ts, equity: running, drawdown, drawdownPct: peak > 0 ? (drawdown / peak) * 100 : 0 };
  });
}

const APPROX = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('buildModifiedDietzCurve', () => {
  it('returns empty array when no trades and no cash flows', () => {
    const result = buildModifiedDietzCurve(10_000, [], []);
    expect(result).toHaveLength(0);
  });

  it('mirrors plain equity curve when there are no cash flows', () => {
    const pts = makeEquityPoints(10_000, [
      { ts: '2024-01-02T10:00:00Z', pnl: 500 },
      { ts: '2024-01-03T10:00:00Z', pnl: -200 },
      { ts: '2024-01-04T10:00:00Z', pnl: 300 },
    ]);
    const result = buildModifiedDietzCurve(10_000, pts, []);

    expect(result).toHaveLength(3);
    expect(result[0].balance).toBe(10_500);
    expect(result[1].balance).toBe(10_300);
    expect(result[2].balance).toBe(10_600);

    // Modified Dietz without deposits = simple cumulative P&L return on starting balance
    expect(APPROX(result[2].modDietzReturn, 600 / 10_000)).toBe(true);
    expect(result.every((p) => p.cashFlowAmount === undefined)).toBe(true);
  });

  it('marks cash flow events and resets sub-period correctly', () => {
    // Equity points are a continuous P&L series from startingBalance — deposits are NOT included.
    const pts = makeEquityPoints(10_000, [
      { ts: '2024-01-02T10:00:00Z', pnl: 1_000 },
      { ts: '2024-01-04T10:00:00Z', pnl: 800 },
    ]);
    const cashFlows = [
      { timestampUtc: '2024-01-03T09:00:00Z', amount: 5_000, opType: 'DEPOSIT' },
    ];

    const result = buildModifiedDietzCurve(10_000, pts, cashFlows);

    // 3 points total: 2 trade closes + 1 deposit event
    expect(result).toHaveLength(3);

    // Deposit event is the middle entry (Jan 3 is between Jan 2 and Jan 4)
    const depositPt = result.find((p) => p.cashFlowAmount !== undefined);
    expect(depositPt).toBeDefined();
    expect(depositPt!.cashFlowAmount).toBe(5_000);
    expect(depositPt!.balance).toBe(16_000); // 10k + 1k trade + 5k deposit

    // Sub-period 1 return: 1000/10000 = 0.1
    // Sub-period 2 return: 800/16000 = 0.05
    // Chain: (1 + 0.1) * (1 + 0.05) - 1 = 0.155
    const lastPt = result[result.length - 1];
    expect(APPROX(lastPt.modDietzReturn, 0.155)).toBe(true);
    expect(lastPt.balance).toBe(16_800);
  });

  it('does not inflate return for a deposit — performance reflects only trading gains', () => {
    const startingBalance = 10_000;
    // Equity points: pure P&L series from startingBalance, no deposit included.
    const pts = makeEquityPoints(startingBalance, [
      { ts: '2024-06-02T10:00:00Z', pnl: 1_000 },
    ]);
    // 90k deposit on Jun 1 (before the trade on Jun 2)
    const cashFlows = [
      { timestampUtc: '2024-06-01T00:00:00Z', amount: 90_000, opType: 'DEPOSIT' },
    ];

    const result = buildModifiedDietzCurve(startingBalance, pts, cashFlows);
    expect(result).toHaveLength(2);

    // Sub-period 1: deposit closes the empty period (return = 0)
    // Sub-period 2: balance after deposit = 100k; trade P&L = 1k
    //   return = 1000/100000 = 0.01
    // Linked: (1+0) * (1+0.01) - 1 = 0.01
    const tradePt = result.find((p) => p.cashFlowAmount === undefined)!;
    expect(APPROX(tradePt.modDietzReturn, 0.01)).toBe(true);
  });

  it('correctly handles a withdrawal reducing the balance', () => {
    // Continuous P&L series from startingBalance (no withdrawal effect in equity points)
    const pts = makeEquityPoints(10_000, [
      { ts: '2024-01-02T10:00:00Z', pnl: 2_000 },
      { ts: '2024-01-04T10:00:00Z', pnl: 500 },
    ]);
    const cashFlows = [
      { timestampUtc: '2024-01-03T08:00:00Z', amount: -3_000, opType: 'WITHDRAWAL' },
    ];

    const result = buildModifiedDietzCurve(10_000, pts, cashFlows);
    // Points: trade@Jan2, withdrawal@Jan3, trade@Jan4
    expect(result).toHaveLength(3);
    const withdrawalPt = result.find((p) => p.cashFlowAmount !== undefined)!;
    expect(withdrawalPt.balance).toBe(9_000); // 10k + 2k - 3k
    expect(withdrawalPt.cashFlowAmount).toBe(-3_000);

    // Sub-period 1 return: 2000/10000 = 0.2
    // Sub-period 2: 500/9000; linked: (1+0.2) * (1+500/9000) - 1
    const expected = (1 + 0.2) * (1 + 500 / 9_000) - 1;
    const lastPt = result[result.length - 1];
    expect(APPROX(lastPt.modDietzReturn, expected)).toBe(true);
  });

  it('tracks drawdown correctly across deposits', () => {
    // Continuous P&L series: -2k on Jan 2, then -1k on Jan 4
    const pts = makeEquityPoints(10_000, [
      { ts: '2024-01-02T10:00:00Z', pnl: -2_000 },
      { ts: '2024-01-04T10:00:00Z', pnl: -1_000 },
    ]);
    const cashFlows = [
      { timestampUtc: '2024-01-03T08:00:00Z', amount: 5_000, opType: 'DEPOSIT' },
    ];

    const result = buildModifiedDietzCurve(10_000, pts, cashFlows);
    const depositPt = result.find((p) => p.cashFlowAmount !== undefined)!;
    // After trade 1: balance=8k (peak=10k). After deposit: balance=13k → new peak=13k
    expect(depositPt.drawdown).toBe(0);

    const lastPt = result[result.length - 1];
    // After trade 2: balance=12k, peak=13k, drawdown=1k
    expect(lastPt.drawdown).toBe(1_000);
    expect(APPROX(lastPt.drawdownPct, (1_000 / 13_000) * 100)).toBe(true);
  });

  it('handles cash flow at same timestamp as trade — cash flow is processed first', () => {
    const cashFlows = [
      { timestampUtc: '2024-01-02T10:00:00Z', amount: 2_000, opType: 'DEPOSIT' },
    ];
    // Equity points from startingBalance (10k), no deposit baked in
    const pts = makeEquityPoints(10_000, [
      { ts: '2024-01-02T10:00:00Z', pnl: 500 },
    ]);

    const result = buildModifiedDietzCurve(10_000, pts, cashFlows);
    // cash flow sorted before trade at same timestamp: balance = 12k, then +500 = 12.5k
    expect(result).toHaveLength(2);
    const tradePt = result.find((p) => p.cashFlowAmount === undefined)!;
    expect(tradePt.balance).toBe(12_500);
    // Sub-period starts at 12k (after deposit); return = 500/12000
    expect(APPROX(tradePt.modDietzReturn, 500 / 12_000)).toBe(true);
  });

  it('zero starting balance does not produce NaN', () => {
    const pts = makeEquityPoints(0, [
      { ts: '2024-01-02T10:00:00Z', pnl: 100 },
    ]);
    const result = buildModifiedDietzCurve(0, pts, []);
    expect(result[0].modDietzReturn).toBe(0); // divide-by-zero guard
    expect(Number.isNaN(result[0].modDietzReturn)).toBe(false);
  });
});
