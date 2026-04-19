/**
 * T1.3 — Schema round-trip tests for balance_operations + accounts extension.
 *
 * Runs schema.sql against an in-memory SQLite DB, then exercises the new
 * surfaces via Drizzle:
 *   1. balance_operations table exists after migration.
 *   2. DEPOSIT / WITHDRAWAL / BONUS rows insert and round-trip.
 *   3. Partial unique (account_id, source, external_id) blocks duplicates,
 *      but allows re-insert after soft-delete (deleted_at_utc IS NOT NULL).
 *   4. Extended accounts columns are nullable and round-trip.
 *   5. Partial unique (platform, server, login) enforces one broker login
 *      per FXLedger account, while tolerating NULL.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, eq, isNull } from 'drizzle-orm';

import * as schema from '../src/lib/db/schema';
import { accounts, balanceOperations, instruments } from '../src/lib/db/schema';

// ─────────────────────────────────────────────────────────────
// Harness: fresh in-memory DB seeded from schema.sql
// ─────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL_PATH = join(__dirname, '..', 'schema.sql');
const SCHEMA_SQL = readFileSync(SCHEMA_SQL_PATH, 'utf-8');

interface TestDb {
  raw: Database.Database;
  db: BetterSQLite3Database<typeof schema>;
}

function makeDb(): TestDb {
  const raw = new Database(':memory:');
  // in-memory databases cannot use WAL; override the pragma before schema runs.
  const sql = SCHEMA_SQL.replace(/PRAGMA journal_mode\s*=\s*WAL\s*;/i, '');
  raw.pragma('foreign_keys = ON');
  raw.exec(sql);
  const db = drizzle(raw, { schema });
  return { raw, db };
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeAccount(
  raw: Database.Database,
  overrides: Partial<{
    id: string;
    name: string;
    platform: string | null;
    server: string | null;
    login: string | null;
  }> = {},
): string {
  const id = overrides.id ?? `acc-${Math.random().toString(36).slice(2, 10)}`;
  const stmt = raw.prepare(`
    INSERT INTO accounts
      (id, name, account_currency, initial_balance, account_type,
       display_color, is_active, platform, server, login,
       created_at_utc, updated_at_utc)
    VALUES
      (@id, @name, 'USD', 0, 'LIVE', '#3b82f6', 1,
       @platform, @server, @login, @now, @now)
  `);
  stmt.run({
    id,
    name: overrides.name ?? `Test ${id}`,
    platform: overrides.platform ?? null,
    server: overrides.server ?? null,
    login: overrides.login ?? null,
    now: nowIso(),
  });
  return id;
}

// ─────────────────────────────────────────────────────────────
// 1. balance_operations table exists after migration
// ─────────────────────────────────────────────────────────────

describe('balance_operations — schema', () => {
  let harness: TestDb;

  beforeEach(() => {
    harness = makeDb();
  });

  it('creates the balance_operations table', () => {
    const row = harness.raw
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'balance_operations'",
      )
      .get() as { name: string } | undefined;
    expect(row?.name).toBe('balance_operations');
  });

  it('creates expected indexes on balance_operations', () => {
    const names = harness.raw
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'balance_operations'",
      )
      .all()
      .map((r) => (r as { name: string }).name);
    expect(names).toContain('idx_balance_ops_account_occurred');
    expect(names).toContain('idx_balance_ops_soft_delete');
    expect(names).toContain('idx_balance_ops_type');
    expect(names).toContain('idx_balance_ops_external');
  });
});

// ─────────────────────────────────────────────────────────────
// 2. Insert DEPOSIT / WITHDRAWAL / BONUS via Drizzle, round-trip
// ─────────────────────────────────────────────────────────────

describe('balance_operations — insert + round-trip', () => {
  let harness: TestDb;
  let accountId: string;

  beforeEach(() => {
    harness = makeDb();
    accountId = makeAccount(harness.raw);
  });

  it('round-trips DEPOSIT, WITHDRAWAL, and BONUS rows', async () => {
    const now = nowIso();
    await harness.db.insert(balanceOperations).values([
      {
        id: 'op-dep-1',
        accountId,
        opType: 'DEPOSIT',
        amount: 10_000,
        currency: 'USD',
        occurredAtUtc: '2026-01-05T12:00:00.000Z',
        recordedAtUtc: now,
        source: 'MANUAL',
        createdAtUtc: now,
        updatedAtUtc: now,
      },
      {
        id: 'op-wd-1',
        accountId,
        opType: 'WITHDRAWAL',
        amount: -1_500,
        currency: 'USD',
        occurredAtUtc: '2026-02-12T09:30:00.000Z',
        recordedAtUtc: now,
        source: 'BRIDGE',
        externalId: 'mt5-deal-900123',
        createdAtUtc: now,
        updatedAtUtc: now,
      },
      {
        id: 'op-bonus-1',
        accountId,
        opType: 'BONUS',
        amount: 250,
        currency: 'USD',
        occurredAtUtc: '2026-03-01T00:00:00.000Z',
        recordedAtUtc: now,
        source: 'MT5_HTML',
        externalId: 'mt5-deal-900124',
        note: 'Welcome bonus',
        createdAtUtc: now,
        updatedAtUtc: now,
      },
    ]);

    const rows = await harness.db
      .select()
      .from(balanceOperations)
      .where(eq(balanceOperations.accountId, accountId));

    expect(rows).toHaveLength(3);

    const deposit = rows.find((r) => r.id === 'op-dep-1');
    expect(deposit).toBeDefined();
    expect(deposit?.opType).toBe('DEPOSIT');
    expect(deposit?.amount).toBe(10_000);
    expect(deposit?.currency).toBe('USD');
    expect(deposit?.source).toBe('MANUAL');
    expect(deposit?.externalId).toBeNull();

    const withdrawal = rows.find((r) => r.id === 'op-wd-1');
    expect(withdrawal?.opType).toBe('WITHDRAWAL');
    expect(withdrawal?.amount).toBe(-1_500);
    expect(withdrawal?.source).toBe('BRIDGE');
    expect(withdrawal?.externalId).toBe('mt5-deal-900123');

    const bonus = rows.find((r) => r.id === 'op-bonus-1');
    expect(bonus?.opType).toBe('BONUS');
    expect(bonus?.note).toBe('Welcome bonus');
  });

  it('rejects an invalid op_type via CHECK constraint', () => {
    const now = nowIso();
    expect(() =>
      harness.raw
        .prepare(
          `INSERT INTO balance_operations
             (id, account_id, op_type, amount, currency,
              occurred_at_utc, recorded_at_utc, source,
              created_at_utc, updated_at_utc)
           VALUES (?, ?, 'NOT_A_REAL_TYPE', 0, 'USD', ?, ?, 'MANUAL', ?, ?)`,
        )
        .run('op-bad', accountId, now, now, now, now),
    ).toThrow(/CHECK constraint/i);
  });
});

// ─────────────────────────────────────────────────────────────
// 3. Partial-unique index on (account_id, source, external_id) WHERE external_id IS NOT NULL
// ─────────────────────────────────────────────────────────────

describe('balance_operations — idx_balance_ops_external (partial unique)', () => {
  let harness: TestDb;
  let accountId: string;

  beforeEach(() => {
    harness = makeDb();
    accountId = makeAccount(harness.raw);
  });

  it('blocks duplicate (account_id, source, external_id) when external_id is set', async () => {
    const now = nowIso();
    await harness.db.insert(balanceOperations).values({
      id: 'op-uniq-1',
      accountId,
      opType: 'DEPOSIT',
      amount: 500,
      currency: 'USD',
      occurredAtUtc: now,
      recordedAtUtc: now,
      source: 'BRIDGE',
      externalId: 'dup-ticket-1',
      createdAtUtc: now,
      updatedAtUtc: now,
    });

    await expect(
      harness.db.insert(balanceOperations).values({
        id: 'op-uniq-2',
        accountId,
        opType: 'DEPOSIT',
        amount: 500,
        currency: 'USD',
        occurredAtUtc: now,
        recordedAtUtc: now,
        source: 'BRIDGE',
        externalId: 'dup-ticket-1',
        createdAtUtc: now,
        updatedAtUtc: now,
      }),
    ).rejects.toThrow(/UNIQUE constraint/i);
  });

  it('allows duplicates when external_id is NULL (manual entries)', async () => {
    const now = nowIso();
    await harness.db.insert(balanceOperations).values([
      {
        id: 'op-manual-1',
        accountId,
        opType: 'DEPOSIT',
        amount: 100,
        currency: 'USD',
        occurredAtUtc: now,
        recordedAtUtc: now,
        source: 'MANUAL',
        externalId: null,
        createdAtUtc: now,
        updatedAtUtc: now,
      },
      {
        id: 'op-manual-2',
        accountId,
        opType: 'DEPOSIT',
        amount: 100,
        currency: 'USD',
        occurredAtUtc: now,
        recordedAtUtc: now,
        source: 'MANUAL',
        externalId: null,
        createdAtUtc: now,
        updatedAtUtc: now,
      },
    ]);

    const rows = await harness.db
      .select()
      .from(balanceOperations)
      .where(eq(balanceOperations.accountId, accountId));
    expect(rows).toHaveLength(2);
  });

  it('permits re-insert of the same external_id after soft-delete', async () => {
    const now = nowIso();
    await harness.db.insert(balanceOperations).values({
      id: 'op-softdel-1',
      accountId,
      opType: 'DEPOSIT',
      amount: 250,
      currency: 'USD',
      occurredAtUtc: now,
      recordedAtUtc: now,
      source: 'BRIDGE',
      externalId: 'reinsert-ticket-7',
      createdAtUtc: now,
      updatedAtUtc: now,
    });

    // Soft-delete the first row.
    await harness.db
      .update(balanceOperations)
      .set({ deletedAtUtc: nowIso(), updatedAtUtc: nowIso() })
      .where(eq(balanceOperations.id, 'op-softdel-1'));

    // Now a second row with the same external_id should succeed —
    // the partial unique index excludes soft-deleted rows.
    await harness.db.insert(balanceOperations).values({
      id: 'op-softdel-2',
      accountId,
      opType: 'DEPOSIT',
      amount: 250,
      currency: 'USD',
      occurredAtUtc: nowIso(),
      recordedAtUtc: nowIso(),
      source: 'BRIDGE',
      externalId: 'reinsert-ticket-7',
      createdAtUtc: nowIso(),
      updatedAtUtc: nowIso(),
    });

    const live = await harness.db
      .select()
      .from(balanceOperations)
      .where(
        and(
          eq(balanceOperations.externalId, 'reinsert-ticket-7'),
          isNull(balanceOperations.deletedAtUtc),
        ),
      );
    expect(live).toHaveLength(1);
    expect(live[0].id).toBe('op-softdel-2');
  });
});

// ─────────────────────────────────────────────────────────────
// 4. Extended accounts columns round-trip (all nullable)
// ─────────────────────────────────────────────────────────────

describe('accounts — broker metadata columns', () => {
  let harness: TestDb;

  beforeEach(() => {
    harness = makeDb();
  });

  it('accepts all new columns as NULL (v1.0.x forward-compat)', async () => {
    const now = nowIso();
    await harness.db.insert(accounts).values({
      id: 'acc-legacy',
      name: 'Legacy v1.0 account',
      accountCurrency: 'USD',
      initialBalance: 0,
      accountType: 'LIVE',
      displayColor: '#3b82f6',
      isActive: true,
      server: null,
      platform: null,
      leverage: null,
      timezone: null,
      login: null,
      brokerType: null,
      createdAtUtc: now,
      updatedAtUtc: now,
    });

    const [row] = await harness.db
      .select()
      .from(accounts)
      .where(eq(accounts.id, 'acc-legacy'));
    expect(row.server).toBeNull();
    expect(row.platform).toBeNull();
    expect(row.leverage).toBeNull();
    expect(row.timezone).toBeNull();
    expect(row.login).toBeNull();
    expect(row.brokerType).toBeNull();
  });

  it('round-trips populated broker metadata', async () => {
    const now = nowIso();
    await harness.db.insert(accounts).values({
      id: 'acc-full',
      name: 'ICMarkets live',
      accountCurrency: 'USD',
      initialBalance: 25_000,
      accountType: 'LIVE',
      displayColor: '#3b82f6',
      isActive: true,
      server: 'ICMarkets-Live04',
      platform: 'MT5',
      leverage: 500,
      timezone: 'Europe/Nicosia',
      login: '12345678',
      brokerType: 'ECN',
      createdAtUtc: now,
      updatedAtUtc: now,
    });

    const [row] = await harness.db
      .select()
      .from(accounts)
      .where(eq(accounts.id, 'acc-full'));
    expect(row.server).toBe('ICMarkets-Live04');
    expect(row.platform).toBe('MT5');
    expect(row.leverage).toBe(500);
    expect(row.timezone).toBe('Europe/Nicosia');
    expect(row.login).toBe('12345678');
    expect(row.brokerType).toBe('ECN');
  });

  it('rejects an invalid platform value via CHECK constraint', () => {
    const now = nowIso();
    expect(() =>
      harness.raw
        .prepare(
          `INSERT INTO accounts
             (id, name, account_currency, initial_balance, account_type,
              display_color, is_active, platform,
              created_at_utc, updated_at_utc)
           VALUES (?, ?, 'USD', 0, 'LIVE', '#3b82f6', 1, 'NOT_A_PLATFORM', ?, ?)`,
        )
        .run('acc-bad', 'bad platform', now, now),
    ).toThrow(/CHECK constraint/i);
  });
});

// ─────────────────────────────────────────────────────────────
// 5. idx_accounts_login — partial unique (platform, server, login)
// ─────────────────────────────────────────────────────────────

describe('accounts — idx_accounts_login (partial unique)', () => {
  let harness: TestDb;

  beforeEach(() => {
    harness = makeDb();
  });

  it('blocks a duplicate (platform, server, login) triple', () => {
    makeAccount(harness.raw, {
      id: 'acc-a',
      name: 'A',
      platform: 'MT5',
      server: 'ICMarkets-Live04',
      login: '12345678',
    });
    expect(() =>
      makeAccount(harness.raw, {
        id: 'acc-b',
        name: 'B',
        platform: 'MT5',
        server: 'ICMarkets-Live04',
        login: '12345678',
      }),
    ).toThrow(/UNIQUE constraint/i);
  });

  it('allows different logins on the same platform/server', () => {
    makeAccount(harness.raw, {
      id: 'acc-c',
      name: 'C',
      platform: 'MT5',
      server: 'ICMarkets-Live04',
      login: '11111111',
    });
    expect(() =>
      makeAccount(harness.raw, {
        id: 'acc-d',
        name: 'D',
        platform: 'MT5',
        server: 'ICMarkets-Live04',
        login: '22222222',
      }),
    ).not.toThrow();
  });

  it('allows multiple accounts with NULL login (partial index excludes them)', () => {
    makeAccount(harness.raw, {
      id: 'acc-nul-1',
      name: 'No login 1',
      platform: 'MT5',
      server: 'ICMarkets-Live04',
      login: null,
    });
    expect(() =>
      makeAccount(harness.raw, {
        id: 'acc-nul-2',
        name: 'No login 2',
        platform: 'MT5',
        server: 'ICMarkets-Live04',
        login: null,
      }),
    ).not.toThrow();
  });

  it('allows duplicate login when platform/server is NULL on either side', () => {
    makeAccount(harness.raw, {
      id: 'acc-plat-nul-1',
      name: 'Pl null 1',
      platform: null,
      server: 'ICMarkets-Live04',
      login: '12345678',
    });
    expect(() =>
      makeAccount(harness.raw, {
        id: 'acc-plat-nul-2',
        name: 'Pl null 2',
        platform: null,
        server: 'ICMarkets-Live04',
        login: '12345678',
      }),
    ).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
// 6. FK cascade: deleting an account removes its balance ops
// ─────────────────────────────────────────────────────────────

describe('balance_operations — FK cascade on account delete', () => {
  it('cascades delete from accounts to balance_operations', async () => {
    const harness = makeDb();
    const accountId = makeAccount(harness.raw);

    const now = nowIso();
    await harness.db.insert(balanceOperations).values({
      id: 'op-cascade-1',
      accountId,
      opType: 'DEPOSIT',
      amount: 1,
      currency: 'USD',
      occurredAtUtc: now,
      recordedAtUtc: now,
      source: 'MANUAL',
      createdAtUtc: now,
      updatedAtUtc: now,
    });

    harness.raw.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);

    const remaining = await harness.db.select().from(balanceOperations);
    expect(remaining).toHaveLength(0);

    // Silences "unused import" warning for instruments type if any.
    void instruments;
  });
});
