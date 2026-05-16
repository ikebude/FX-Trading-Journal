import { describe, it, expect } from 'vitest';
import {
  computePortfolioSummary,
  detectCrossAccountHedges,
  computeAccountOpenRisk,
  type PortfolioAccountInput,
  type OpenPositionInput,
} from '../src/lib/portfolio';

const acct = (o: Partial<PortfolioAccountInput> & { accountId: string }): PortfolioAccountInput => ({
  name: o.accountId,
  currency: 'USD',
  netPnl: 0,
  ...o,
});

describe('computePortfolioSummary — T5.1', () => {
  it('sums same-currency accounts at rate 1', () => {
    const s = computePortfolioSummary(
      [acct({ accountId: 'a', netPnl: 100 }), acct({ accountId: 'b', netPnl: -40 })],
      'USD',
    );
    expect(s.totalNetPnlBase).toBe(60);
    expect(s.missingRates).toEqual([]);
    expect(s.accounts[0].rateUsed).toBe(1);
  });

  it('converts foreign currency via the supplied rate', () => {
    const s = computePortfolioSummary(
      [acct({ accountId: 'eu', currency: 'EUR', netPnl: 100 })],
      'USD',
      { EUR: 1.1 },
    );
    expect(s.totalNetPnlBase).toBeCloseTo(110, 6);
    expect(s.accounts[0].netPnlBase).toBeCloseTo(110, 6);
  });

  it('flags missing rates and excludes them from the total (never assumes 1)', () => {
    const s = computePortfolioSummary(
      [
        acct({ accountId: 'us', netPnl: 50 }),
        acct({ accountId: 'jp', currency: 'JPY', netPnl: 100000 }),
      ],
      'USD',
    );
    expect(s.missingRates).toEqual(['JPY']);
    expect(s.totalNetPnlBase).toBe(50);
    expect(s.accounts.find((a) => a.accountId === 'jp')!.rateUsed).toBeNull();
  });

  it('builds a unioned, currency-converted equity curve', () => {
    const s = computePortfolioSummary(
      [
        acct({
          accountId: 'a',
          netPnl: 0,
          equityCurve: [
            { timestamp: '2026-04-01T00:00:00Z', equity: 1000 },
            { timestamp: '2026-04-03T00:00:00Z', equity: 1200 },
          ],
        }),
        acct({
          accountId: 'b',
          currency: 'EUR',
          netPnl: 0,
          equityCurve: [{ timestamp: '2026-04-02T00:00:00Z', equity: 500 }],
        }),
      ],
      'USD',
      { EUR: 2 },
    );
    // ts1: a=1000, b=0 → 1000; ts2: a=1000 (hold), b=500*2=1000 → 2000;
    // ts3: a=1200, b=1000 → 2200
    expect(s.equityCurve.map((p) => p.equity)).toEqual([1000, 2000, 2200]);
  });

  it('groups net P&L by account group', () => {
    const s = computePortfolioSummary(
      [
        acct({ accountId: 'p1', netPnl: 100, group: 'Prop' }),
        acct({ accountId: 'p2', netPnl: 50, group: 'Prop' }),
        acct({ accountId: 'x', netPnl: 30 }),
      ],
      'USD',
    );
    expect(s.byGroup[0]).toEqual({ group: 'Prop', netPnlBase: 150 });
    expect(s.byGroup.find((g) => g.group === 'Ungrouped')!.netPnlBase).toBe(30);
  });
});

describe('detectCrossAccountHedges — T5.2', () => {
  const pos = (o: Partial<OpenPositionInput> & { accountId: string; direction: 'LONG' | 'SHORT' }): OpenPositionInput => ({
    accountName: o.accountId,
    symbol: 'EURUSD',
    lots: 1,
    ...o,
  });

  it('flags a symbol long in one account, short in another', () => {
    const h = detectCrossAccountHedges([
      pos({ accountId: 'A', direction: 'LONG', lots: 2 }),
      pos({ accountId: 'B', direction: 'SHORT', lots: 1.5 }),
    ]);
    expect(h).toHaveLength(1);
    expect(h[0].symbol).toBe('EURUSD');
    expect(h[0].hedgedLots).toBe(1.5);
    expect(h[0].longAccounts).toEqual(['A']);
    expect(h[0].shortAccounts).toEqual(['B']);
  });

  it('ignores opposite legs within the SAME account', () => {
    expect(
      detectCrossAccountHedges([
        pos({ accountId: 'A', direction: 'LONG' }),
        pos({ accountId: 'A', direction: 'SHORT' }),
      ]),
    ).toEqual([]);
  });

  it('no hedge when all accounts are same-direction', () => {
    expect(
      detectCrossAccountHedges([
        pos({ accountId: 'A', direction: 'LONG' }),
        pos({ accountId: 'B', direction: 'LONG' }),
      ]),
    ).toEqual([]);
  });
});

describe('computeAccountOpenRisk — T5.2', () => {
  it('aggregates open count + risk per account, sorted by risk', () => {
    const r = computeAccountOpenRisk([
      { accountId: 'A', accountName: 'A', symbol: 'EURUSD', direction: 'LONG', lots: 1, riskAmount: 100 },
      { accountId: 'A', accountName: 'A', symbol: 'GBPUSD', direction: 'SHORT', lots: 1, riskAmount: 50 },
      { accountId: 'B', accountName: 'B', symbol: 'USDJPY', direction: 'LONG', lots: 1, riskAmount: 200 },
    ]);
    expect(r[0]).toEqual({ accountId: 'B', accountName: 'B', openPositions: 1, totalRiskAmount: 200 });
    expect(r[1]).toEqual({ accountId: 'A', accountName: 'A', openPositions: 2, totalRiskAmount: 150 });
  });
});
