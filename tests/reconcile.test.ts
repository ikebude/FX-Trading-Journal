import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  scoreCandidate,
  extractQualitative,
  QUALITATIVE_FIELDS,
  type ReconcileManualTrade,
  type ReconcileImportedTrade,
  computeActualBalance,
  computeComputedEquity,
  detectAccountDrift,
  createCorrectionBalanceOp,
} from '../src/lib/reconcile';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import * as schema from '../src/lib/db/schema';
import * as clientModule from '../src/lib/db/client';
import { accounts, balanceOperations, trades, tradeLegs, instruments } from '../src/lib/db/schema';

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const baseManual: ReconcileManualTrade = {
  id: 'manual-1',
  symbol: 'EURUSD',
  direction: 'LONG',
  openedAtUtc: '2024-03-20T08:00:00.000Z',
  totalEntryVolume: 0.1,
  setupName: 'London Open',
  marketCondition: 'TRENDING',
  entryModel: 'LIMIT',
  confidence: 4,
  preTradeEmotion: 'CALM',
  postTradeEmotion: 'SATISFIED',
  initialStopPrice: 1.0850,
  initialTargetPrice: 1.0920,
  plannedRr: 2.5,
  plannedRiskAmount: 50,
  plannedRiskPct: 1,
};

const baseImported: ReconcileImportedTrade = {
  externalPositionId: 'pos-123',
  symbol: 'EURUSD',
  direction: 'LONG',
  openedAtUtc: '2024-03-20T08:00:00.000Z',
  entryVolume: 0.1,
};

// ─────────────────────────────────────────────────────────────
// scoreCandidate
// ─────────────────────────────────────────────────────────────

describe('scoreCandidate', () => {
  it('exact time + exact volume → score 100', () => {
    const score = scoreCandidate(baseImported, baseManual);
    expect(score).toBe(100);
  });

  it('base score (passes hard filters) starts at 50', () => {
    // No time or volume data → only base score
    const imported: ReconcileImportedTrade = {
      ...baseImported,
      openedAtUtc: null,
      entryVolume: 0,
    };
    const manual: ReconcileManualTrade = {
      ...baseManual,
      openedAtUtc: null,
      totalEntryVolume: null as unknown as number,
    };
    const score = scoreCandidate(imported, manual);
    expect(score).toBe(50);
  });

  it('1 minute apart → near-max time bonus (~24 points)', () => {
    const imported: ReconcileImportedTrade = {
      ...baseImported,
      openedAtUtc: '2024-03-20T08:01:00.000Z',
    };
    const score = scoreCandidate(imported, baseManual);
    // base(50) + time(30 - 1*6 = 24) + volume(20) = 94
    expect(score).toBe(94);
  });

  it('5 minutes apart → zero time bonus', () => {
    const imported: ReconcileImportedTrade = {
      ...baseImported,
      openedAtUtc: '2024-03-20T08:05:00.000Z',
    };
    const score = scoreCandidate(imported, baseManual);
    // base(50) + time(0) + volume(20) = 70
    expect(score).toBe(70);
  });

  it('0.05 lot difference → zero volume bonus', () => {
    const imported: ReconcileImportedTrade = {
      ...baseImported,
      entryVolume: 0.15, // 0.05 diff
    };
    const score = scoreCandidate(imported, baseManual);
    // base(50) + time(30) + volume(0) = 80
    expect(score).toBe(80);
  });

  it('0.025 lot difference → partial volume bonus (~10 points)', () => {
    const imported: ReconcileImportedTrade = {
      ...baseImported,
      entryVolume: 0.125, // 0.025 diff
    };
    const score = scoreCandidate(imported, baseManual);
    // base(50) + time(30) + volume(20 - 0.025*400 = 10) = 90
    expect(score).toBe(90);
  });

  it('score is capped at 100', () => {
    const score = scoreCandidate(baseImported, baseManual);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('score is always a whole number (rounded)', () => {
    const imported: ReconcileImportedTrade = {
      ...baseImported,
      openedAtUtc: '2024-03-20T08:00:30.000Z',
    };
    const score = scoreCandidate(imported, baseManual);
    expect(score).toBe(Math.round(score));
  });
});

// ─────────────────────────────────────────────────────────────
// extractQualitative
// ─────────────────────────────────────────────────────────────

describe('extractQualitative', () => {
  it('returns all qualitative fields from a manual trade', () => {
    const result = extractQualitative(baseManual);
    expect(result).toEqual({
      setupName: 'London Open',
      marketCondition: 'TRENDING',
      entryModel: 'LIMIT',
      confidence: 4,
      preTradeEmotion: 'CALM',
      postTradeEmotion: 'SATISFIED',
      initialStopPrice: 1.0850,
      initialTargetPrice: 1.0920,
      plannedRr: 2.5,
      plannedRiskAmount: 50,
      plannedRiskPct: 1,
    });
  });

  it('does not include id, symbol, direction, or openedAtUtc', () => {
    const result = extractQualitative(baseManual);
    expect('id' in result).toBe(false);
    expect('symbol' in result).toBe(false);
    expect('direction' in result).toBe(false);
    expect('openedAtUtc' in result).toBe(false);
  });

  it('preserves null qualitative fields', () => {
    const manual: ReconcileManualTrade = {
      ...baseManual,
      setupName: null,
      marketCondition: null,
      entryModel: null,
      confidence: null,
      preTradeEmotion: null,
      postTradeEmotion: null,
      initialStopPrice: null,
      initialTargetPrice: null,
      plannedRr: null,
      plannedRiskAmount: null,
      plannedRiskPct: null,
    };
    const result = extractQualitative(manual);
    for (const field of QUALITATIVE_FIELDS) {
      expect(result[field]).toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────
// QUALITATIVE_FIELDS constant
// ─────────────────────────────────────────────────────────────

describe('QUALITATIVE_FIELDS', () => {
  it('contains exactly 11 fields', () => {
    expect(QUALITATIVE_FIELDS).toHaveLength(11);
  });

  it('includes setupName', () => {
    expect(QUALITATIVE_FIELDS).toContain('setupName');
  });

  it('includes plannedRiskPct', () => {
    expect(QUALITATIVE_FIELDS).toContain('plannedRiskPct');
  });
});

// ─────────────────────────────────────────────────────────────
// Balance reconciliation (T1.5)
// ─────────────────────────────────────────────────────────────

// Mock getDb for balance reconciliation tests
const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL_PATH = join(__dirname, '..', 'schema.sql');
const SCHEMA_SQL = readFileSync(SCHEMA_SQL_PATH, 'utf-8');

interface TestDb {
  raw: Database.Database;
  db: BetterSQLite3Database<typeof schema>;
}

function makeTestDb(): TestDb {
  const raw = new Database(':memory:');
  const sql = SCHEMA_SQL.replace(/PRAGMA journal_mode\s*=\s*WAL\s*;/i, '');
  raw.pragma('foreign_keys = ON');
  raw.exec(sql);
  const db = drizzle(raw, { schema });
  return { raw, db };
}

function nowIso(): string {
  return new Date().toISOString();
}

describe('Balance reconciliation (T1.5)', () => {
  let testDb: TestDb;

  // Helper functions
  const nowIso = () => new Date().toISOString();

  const makeAccount = (overrides?: Partial<{ initialBalance: number }>) => {
    const id = `acc-${Math.random().toString(36).slice(2, 10)}`;
    const now = nowIso();
    testDb.raw.prepare(`
      INSERT INTO accounts
        (id, name, account_currency, initial_balance, account_type,
         display_color, is_active, created_at_utc, updated_at_utc)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      `Test ${id}`,
      'USD',
      overrides?.initialBalance ?? 10000,
      'LIVE',
      '#3b82f6',
      1,
      now,
      now,
    );
    return id;
  };

  const insertBalOp = (
    accountId: string,
    opType: string,
    amount: number,
    deletedAtUtc: string | null = null,
  ) => {
    const id = `bop-${Math.random().toString(36).slice(2, 10)}`;
    const now = nowIso();
    testDb.raw.prepare(`
      INSERT INTO balance_operations
        (id, account_id, op_type, amount, currency, occurred_at_utc,
         recorded_at_utc, source, created_at_utc, updated_at_utc, deleted_at_utc)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      accountId,
      opType,
      amount,
      'USD',
      now,
      now,
      'MANUAL',
      now,
      now,
      deletedAtUtc,
    );
  };

  const insertTrade = (
    accountId: string,
    symbol: string,
    netPnl: number,
    status: string = 'CLOSED',
  ) => {
    const id = `trade-${Math.random().toString(36).slice(2, 10)}`;
    const now = nowIso();
    
    // Ensure instrument exists
    const instrumentExists = testDb.raw.prepare(`SELECT 1 FROM instruments WHERE symbol = ?`).get(symbol);
    if (!instrumentExists) {
      testDb.raw.prepare(`
        INSERT INTO instruments (symbol, pip_size)
        VALUES (?, ?)
      `).run(symbol, 0.0001);
    }
    
    testDb.raw.prepare(`
      INSERT INTO trades
        (id, account_id, symbol, direction, status, net_pnl, net_pips,
         total_commission, total_swap, total_entry_volume, total_exit_volume,
         source, created_at_utc, updated_at_utc, opened_at_utc, closed_at_utc)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      accountId,
      symbol,
      'LONG',
      status,
      netPnl,
      10,
      0,
      0,
      1,
      1,
      'MANUAL',
      now,
      now,
      now, // opened_at_utc
      status === 'CLOSED' ? now : null, // closed_at_utc only if CLOSED
    );
    return id;
  };

  beforeEach(() => {
    testDb = makeTestDb();
    // Spy on and replace getDb with a function that returns our test DB
    vi.spyOn(clientModule, 'getDb').mockReturnValue(testDb.db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (testDb?.raw) {
      testDb.raw.close();
    }
  });

  describe('computeActualBalance', () => {
    it('sums balance operations for an account with 1 DEPOSIT', async () => {
      const accId = makeAccount();
      insertBalOp(accId, 'DEPOSIT', 10000);

      const result = await computeActualBalance(accId);
      expect(result.netBalance).toBe(10000);
      expect(result.totalDeposits).toBe(10000);
      expect(result.totalWithdrawals).toBe(0);
    });

    it('excludes soft-deleted balance operations', async () => {
      const accId = makeAccount();
      const now = nowIso();
      insertBalOp(accId, 'DEPOSIT', 10000, null);
      insertBalOp(accId, 'DEPOSIT', 5000, now); // soft-deleted

      const result = await computeActualBalance(accId);
      expect(result.netBalance).toBe(10000); // Only counts the non-deleted one
    });

    it('sums DEPOSIT + BONUS + CREDIT minus WITHDRAWAL + CHARGE', async () => {
      const accId = makeAccount();
      insertBalOp(accId, 'DEPOSIT', 10000);
      insertBalOp(accId, 'BONUS', 500);
      insertBalOp(accId, 'CREDIT', 100);
      insertBalOp(accId, 'WITHDRAWAL', -2000);
      insertBalOp(accId, 'CHARGE', -50);

      const result = await computeActualBalance(accId);
      expect(result.totalDeposits).toBe(10000);
      expect(result.totalCredits).toBe(600);
      expect(result.totalWithdrawals).toBe(2000);
      expect(result.totalCharges).toBe(50);
      // netBalance = 10000 - 2000 + 600 - 50 = 8550
      expect(result.netBalance).toBe(8550);
    });
  });

  describe('computeComputedEquity', () => {
    it('computes equity as starting balance + trade P&L', async () => {
      const accId = makeAccount({ initialBalance: 10000 });
      insertTrade(accId, 'EURUSD', 500);
      insertTrade(accId, 'GBPUSD', 300);

      const equity = await computeComputedEquity(accId, 10000);
      expect(equity).toBe(10800); // 10000 + 500 + 300
    });

    it('only counts closed trades (status = CLOSED)', async () => {
      const accId = makeAccount({ initialBalance: 10000 });
      insertTrade(accId, 'EURUSD', 500, 'CLOSED');
      insertTrade(accId, 'GBPUSD', 300, 'OPEN');

      const equity = await computeComputedEquity(accId, 10000);
      expect(equity).toBe(10500); // Only counts the closed trade
    });
  });

  describe('detectAccountDrift', () => {
    it('detects drift when actual > computed (0.5%)', async () => {
      const accId = makeAccount({ initialBalance: 10000 });
      // Balance ops: 10000 deposit = $10,000 actual
      insertBalOp(accId, 'DEPOSIT', 10000);
      // Trade P&L: +$0 = $10,000 computed
      // No trades, so computed = starting balance

      const account = await testDb.db
        .select()
        .from(accounts)
        .where(eq(accounts.id, accId));

      if (account.length === 0) throw new Error('Account not found');

      const drift = await detectAccountDrift(account[0]);
      expect(drift.actualBalance).toBe(10000);
      expect(drift.computedEquity).toBe(10000);
      expect(drift.hasDrift).toBe(false);
      expect(drift.driftPercent).toBe(0);
    });

    it('detects drift > 0.01% threshold', async () => {
      const accId = makeAccount({ initialBalance: 10000 });
      // Actual: $10,000
      insertBalOp(accId, 'DEPOSIT', 10000);
      // Computed: $9,950 (trade loss of $50)
      insertTrade(accId, 'EURUSD', -50);

      const account = await testDb.db
        .select()
        .from(accounts)
        .where(eq(accounts.id, accId));

      const drift = await detectAccountDrift(account[0]);
      expect(drift.driftAmount).toBe(50);
      expect(drift.driftPercent).toBeGreaterThan(0.01);
      expect(drift.hasDrift).toBe(true);
    });

    it('returns hasDrift = false for drift < 0.01%', async () => {
      const accId = makeAccount({ initialBalance: 10000 });
      insertBalOp(accId, 'DEPOSIT', 10000);
      // Create tiny drift: $0.0005 on $10,000 = 0.005% (< 0.01%)
      insertBalOp(accId, 'DEPOSIT', 0.0005);

      const account = await testDb.db
        .select()
        .from(accounts)
        .where(eq(accounts.id, accId));

      const drift = await detectAccountDrift(account[0]);
      expect(drift.hasDrift).toBe(false);
    });
  });

  describe('createCorrectionBalanceOp', () => {
    it('creates a CORRECTION balance op to zero out drift', async () => {
      const accId = makeAccount();

      const opId = await createCorrectionBalanceOp(accId, -100, 'Test correction');

      const ops = await testDb.db
        .select()
        .from(balanceOperations)
        .where(eq(balanceOperations.id, opId));

      expect(ops).toHaveLength(1);
      expect(ops[0].opType).toBe('CORRECTION');
      expect(ops[0].amount).toBe(100); // Negated: drift was -100, correction is +100
      expect(ops[0].source).toBe('RECONCILIATION');
    });
  });
});

