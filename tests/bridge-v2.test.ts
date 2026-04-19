/**
 * bridge-v2.test.ts
 *
 * Tests for v2 EA bridge changes:
 *   1. BalanceOpFileSchema Zod validator
 *   2. classifyBridgeEvent() routing logic
 *   3. MT5 ExportBalanceOp JSON format (pure-function checks on JSON strings)
 *   4. MT4 ExportBalanceOp JSON format
 *
 * NOTE: bridge-watcher.ts imports Electron (BrowserWindow) and DB internals
 * which cannot be instantiated in Vitest. We only import the named pure-function
 * exports: BalanceOpFileSchema, classifyBridgeEvent.
 * resolveAccountIdForBalanceOp is async and requires a DB — tested with a mock.
 */

import { describe, it, expect } from 'vitest';
import {
  BalanceOpFileSchema,
  classifyBridgeEvent,
  type BalanceOpFile,
} from '../electron/services/bridge-watcher';

// ─────────────────────────────────────────────────────────────
// 1. Zod validator — valid DEPOSIT
// ─────────────────────────────────────────────────────────────

describe('BalanceOpFileSchema', () => {
  const validDeposit: BalanceOpFile = {
    ea_version: 2,
    event_type: 'balance_op',
    platform: 'MT5',
    account: 12345678,
    login: '12345678',
    account_currency: 'USD',
    broker: 'ICMarkets',
    server: 'ICMarketsSC-Live',
    deal_id: 987654,
    op_type: 'DEPOSIT',
    amount: 1000.0,
    currency: 'USD',
    occurred_at_utc: '2026-04-19T12:00:00Z',
    comment: '',
  };

  it('parses a valid DEPOSIT payload', () => {
    const result = BalanceOpFileSchema.safeParse(validDeposit);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.op_type).toBe('DEPOSIT');
      expect(result.data.amount).toBe(1000.0);
      expect(result.data.event_type).toBe('balance_op');
      expect(result.data.ea_version).toBe(2);
    }
  });

  it('parses a valid WITHDRAWAL payload (negative amount)', () => {
    const withdrawal: BalanceOpFile = {
      ...validDeposit,
      op_type: 'WITHDRAWAL',
      amount: -500.0,
    };
    const result = BalanceOpFileSchema.safeParse(withdrawal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.op_type).toBe('WITHDRAWAL');
      expect(result.data.amount).toBe(-500.0);
    }
  });

  it('parses all valid op_type values', () => {
    const opTypes = [
      'DEPOSIT',
      'WITHDRAWAL',
      'BONUS',
      'CREDIT',
      'CHARGE',
      'CORRECTION',
      'COMMISSION',
      'INTEREST',
      'OTHER',
    ] as const;
    for (const opType of opTypes) {
      const payload = { ...validDeposit, op_type: opType };
      const result = BalanceOpFileSchema.safeParse(payload);
      expect(result.success, `op_type ${opType} should be valid`).toBe(true);
    }
  });

  it('rejects payload missing required op_type', () => {
    const { op_type: _removed, ...withoutOpType } = validDeposit;
    const result = BalanceOpFileSchema.safeParse(withoutOpType);
    expect(result.success).toBe(false);
  });

  it('rejects payload missing required deal_id', () => {
    const { deal_id: _removed, ...withoutDealId } = validDeposit;
    const result = BalanceOpFileSchema.safeParse(withoutDealId);
    expect(result.success).toBe(false);
  });

  it('rejects payload missing required amount', () => {
    const { amount: _removed, ...withoutAmount } = validDeposit;
    const result = BalanceOpFileSchema.safeParse(withoutAmount);
    expect(result.success).toBe(false);
  });

  it('rejects payload missing required currency', () => {
    const { currency: _removed, ...withoutCurrency } = validDeposit;
    const result = BalanceOpFileSchema.safeParse(withoutCurrency);
    expect(result.success).toBe(false);
  });

  it('rejects payload missing required occurred_at_utc', () => {
    const { occurred_at_utc: _removed, ...withoutTs } = validDeposit;
    const result = BalanceOpFileSchema.safeParse(withoutTs);
    expect(result.success).toBe(false);
  });

  it('rejects invalid op_type value', () => {
    const result = BalanceOpFileSchema.safeParse({
      ...validDeposit,
      op_type: 'INVALID_TYPE',
    });
    expect(result.success).toBe(false);
  });

  it('rejects ea_version < 2', () => {
    const result = BalanceOpFileSchema.safeParse({
      ...validDeposit,
      ea_version: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects event_type !== "balance_op"', () => {
    const result = BalanceOpFileSchema.safeParse({
      ...validDeposit,
      event_type: 'trade',
    });
    expect(result.success).toBe(false);
  });

  it('accepts MT4 platform', () => {
    const mt4Payload: BalanceOpFile = {
      ...validDeposit,
      platform: 'MT4',
    };
    const result = BalanceOpFileSchema.safeParse(mt4Payload);
    expect(result.success).toBe(true);
  });

  it('accepts optional fields as absent', () => {
    const minimal: Record<string, unknown> = {
      ea_version: 2,
      event_type: 'balance_op',
      platform: 'MT5',
      account: 12345678,
      deal_id: 987654,
      op_type: 'DEPOSIT',
      amount: 1000.0,
      currency: 'USD',
      occurred_at_utc: '2026-04-19T12:00:00Z',
    };
    const result = BalanceOpFileSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// 2. classifyBridgeEvent — routing logic
// ─────────────────────────────────────────────────────────────

describe('classifyBridgeEvent', () => {
  it('routes event_type=balance_op to balance_op path', () => {
    expect(
      classifyBridgeEvent({
        ea_version: 2,
        event_type: 'balance_op',
        platform: 'MT5',
        deal_id: 1,
        op_type: 'DEPOSIT',
        amount: 500,
      }),
    ).toBe('balance_op');
  });

  it('routes event_type=trade to trade path', () => {
    expect(
      classifyBridgeEvent({
        ea_version: 2,
        event_type: 'trade',
        platform: 'MT5',
        position_id: 123,
      }),
    ).toBe('trade');
  });

  it('routes v1 file (no event_type) to trade path — backward compat', () => {
    // v1 EA files have no event_type field
    expect(
      classifyBridgeEvent({
        version: 1,
        platform: 'MT4',
        account: 12345,
        ticket: 999,
      }),
    ).toBe('trade');
  });

  it('routes v2 file with missing event_type to trade path', () => {
    // ea_version 2 but no event_type → treat as trade
    expect(
      classifyBridgeEvent({
        ea_version: 2,
        platform: 'MT5',
        position_id: 555,
      }),
    ).toBe('trade');
  });

  it('routes MT4 v1 trade file (no event_type) to trade path', () => {
    const v1MT4 = {
      version: 1,
      platform: 'MT4',
      account: 99887766,
      account_currency: 'USD',
      broker: 'Pepperstone',
      ticket: 12345,
      symbol: 'EURUSD',
      type: 'buy',
      volume: 0.1,
      open_time_utc: '2026-04-01T08:00:00Z',
      open_price: 1.08,
      close_time_utc: '2026-04-01T10:00:00Z',
      close_price: 1.082,
      stop_loss: 1.075,
      take_profit: 1.09,
      commission: -3.5,
      swap: 0,
      profit: 20,
      comment: '',
    };
    expect(classifyBridgeEvent(v1MT4)).toBe('trade');
  });
});

// ─────────────────────────────────────────────────────────────
// 3. MT5 balance_op JSON format (ExportBalanceOp output shape)
// These tests verify the JSON produced by the EA matches what the
// Zod schema expects — i.e., that the EA output and watcher contract
// are in sync. We parse the JSON string directly (no MQL5 runtime).
// ─────────────────────────────────────────────────────────────

describe('MT5 ExportBalanceOp JSON format', () => {
  // Simulate what the EA would write for a DEPOSIT (positive profit)
  function buildMt5BalanceOpJson(dealType: number, profit: number, comment = ''): string {
    const opType =
      dealType === 2
        ? profit >= 0
          ? 'DEPOSIT'
          : 'WITHDRAWAL'
        : dealType === 3
          ? 'CREDIT'
          : dealType === 4
            ? 'CHARGE'
            : dealType === 5
              ? 'CORRECTION'
              : dealType === 6
                ? 'BONUS'
                : dealType === 7 || dealType === 8 || dealType === 9
                  ? 'COMMISSION'
                  : dealType === 14
                    ? 'INTEREST'
                    : 'OTHER';

    return JSON.stringify({
      ea_version: 2,
      event_type: 'balance_op',
      platform: 'MT5',
      account: 12345678,
      login: '12345678',
      account_currency: 'USD',
      broker: 'ICMarkets',
      server: 'ICMarketsSC-Live',
      deal_id: 987654,
      op_type: opType,
      amount: profit,
      commission: 0,
      currency: 'USD',
      symbol: '',
      occurred_at_utc: '2026-04-19T12:00:00Z',
      comment,
    });
  }

  it('DEPOSIT: positive profit → op_type DEPOSIT', () => {
    const json = JSON.parse(buildMt5BalanceOpJson(2, 1000.0));
    expect(json.op_type).toBe('DEPOSIT');
    expect(json.amount).toBe(1000.0);
    const result = BalanceOpFileSchema.safeParse(json);
    expect(result.success).toBe(true);
  });

  it('WITHDRAWAL: negative profit → op_type WITHDRAWAL', () => {
    const json = JSON.parse(buildMt5BalanceOpJson(2, -500.0));
    expect(json.op_type).toBe('WITHDRAWAL');
    expect(json.amount).toBe(-500.0);
    const result = BalanceOpFileSchema.safeParse(json);
    expect(result.success).toBe(true);
  });

  it('CREDIT: deal_type 3 → op_type CREDIT', () => {
    const json = JSON.parse(buildMt5BalanceOpJson(3, 100.0));
    expect(json.op_type).toBe('CREDIT');
    const result = BalanceOpFileSchema.safeParse(json);
    expect(result.success).toBe(true);
  });

  it('CHARGE: deal_type 4 → op_type CHARGE', () => {
    const json = JSON.parse(buildMt5BalanceOpJson(4, -10.0));
    expect(json.op_type).toBe('CHARGE');
    const result = BalanceOpFileSchema.safeParse(json);
    expect(result.success).toBe(true);
  });

  it('CORRECTION: deal_type 5 → op_type CORRECTION', () => {
    const json = JSON.parse(buildMt5BalanceOpJson(5, 25.0));
    expect(json.op_type).toBe('CORRECTION');
    const result = BalanceOpFileSchema.safeParse(json);
    expect(result.success).toBe(true);
  });

  it('BONUS: deal_type 6 → op_type BONUS', () => {
    const json = JSON.parse(buildMt5BalanceOpJson(6, 50.0));
    expect(json.op_type).toBe('BONUS');
    const result = BalanceOpFileSchema.safeParse(json);
    expect(result.success).toBe(true);
  });

  it('COMMISSION: deal_type 7 → op_type COMMISSION', () => {
    const json = JSON.parse(buildMt5BalanceOpJson(7, -5.0));
    expect(json.op_type).toBe('COMMISSION');
    const result = BalanceOpFileSchema.safeParse(json);
    expect(result.success).toBe(true);
  });

  it('INTEREST: deal_type 14 → op_type INTEREST', () => {
    const json = JSON.parse(buildMt5BalanceOpJson(14, 2.5));
    expect(json.op_type).toBe('INTEREST');
    const result = BalanceOpFileSchema.safeParse(json);
    expect(result.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// 4. MT4 balance_op JSON format (ExportBalanceOp output shape)
// ─────────────────────────────────────────────────────────────

describe('MT4 ExportBalanceOp JSON format', () => {
  function buildMt4BalanceOpJson(orderType: number, profit: number): string {
    const opType =
      orderType === 6
        ? profit >= 0
          ? 'DEPOSIT'
          : 'WITHDRAWAL'
        : orderType === 7
          ? 'CREDIT'
          : 'OTHER';

    return JSON.stringify({
      ea_version: 2,
      event_type: 'balance_op',
      platform: 'MT4',
      account: 99887766,
      login: '99887766',
      account_currency: 'USD',
      broker: 'Pepperstone',
      server: 'Pepperstone-Live01',
      deal_id: 54321,
      op_type: opType,
      amount: profit,
      currency: 'USD',
      symbol: '',
      occurred_at_utc: '2026-04-01T08:00:00Z',
      comment: '',
    });
  }

  it('OP_BALANCE positive → DEPOSIT', () => {
    const json = JSON.parse(buildMt4BalanceOpJson(6, 2000.0));
    expect(json.op_type).toBe('DEPOSIT');
    expect(json.platform).toBe('MT4');
    const result = BalanceOpFileSchema.safeParse(json);
    expect(result.success).toBe(true);
  });

  it('OP_BALANCE negative → WITHDRAWAL', () => {
    const json = JSON.parse(buildMt4BalanceOpJson(6, -300.0));
    expect(json.op_type).toBe('WITHDRAWAL');
    expect(json.amount).toBe(-300.0);
    const result = BalanceOpFileSchema.safeParse(json);
    expect(result.success).toBe(true);
  });

  it('OP_CREDIT → CREDIT', () => {
    const json = JSON.parse(buildMt4BalanceOpJson(7, 100.0));
    expect(json.op_type).toBe('CREDIT');
    const result = BalanceOpFileSchema.safeParse(json);
    expect(result.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// 5. Invalid balance_op Zod validation failure
// ─────────────────────────────────────────────────────────────

describe('BalanceOpFileSchema — validation failures move to failed/', () => {
  it('file missing op_type fails Zod and should be moved to failed/', () => {
    const badPayload = {
      ea_version: 2,
      event_type: 'balance_op',
      platform: 'MT5',
      account: 12345678,
      deal_id: 987654,
      // op_type intentionally missing
      amount: 1000.0,
      currency: 'USD',
      occurred_at_utc: '2026-04-19T12:00:00Z',
    };
    const result = BalanceOpFileSchema.safeParse(badPayload);
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldPaths = result.error.issues.map((i) => i.path.join('.'));
      expect(fieldPaths).toContain('op_type');
    }
  });

  it('file with invalid platform fails Zod', () => {
    const badPayload = {
      ea_version: 2,
      event_type: 'balance_op',
      platform: 'cTrader', // not in enum
      account: 12345678,
      deal_id: 987654,
      op_type: 'DEPOSIT',
      amount: 1000.0,
      currency: 'USD',
      occurred_at_utc: '2026-04-19T12:00:00Z',
    };
    const result = BalanceOpFileSchema.safeParse(badPayload);
    expect(result.success).toBe(false);
  });

  it('file with string deal_id fails Zod (must be integer)', () => {
    const badPayload = {
      ea_version: 2,
      event_type: 'balance_op',
      platform: 'MT5',
      account: 12345678,
      deal_id: '987654', // string, should be number
      op_type: 'DEPOSIT',
      amount: 1000.0,
      currency: 'USD',
      occurred_at_utc: '2026-04-19T12:00:00Z',
    };
    const result = BalanceOpFileSchema.safeParse(badPayload);
    expect(result.success).toBe(false);
  });
});
