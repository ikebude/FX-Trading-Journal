/**
 * T3.9 — trade_legs slippage/spread schema.sql<->schema.ts parity guard.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import * as schema from '../src/lib/db/schema';
import { tradeLegs, trades, accounts, instruments } from '../src/lib/db/schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL = readFileSync(join(__dirname, '..', 'schema.sql'), 'utf-8');
const uuid = () => randomUUID();
const nowIso = () => new Date().toISOString();

let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  raw.exec(SCHEMA_SQL.replace(/PRAGMA journal_mode\s*=\s*WAL\s*;/i, ''));
  db = drizzle(raw, { schema });

  const accountId = uuid();
  db.insert(instruments).values({ symbol: 'EURUSD', pipSize: 0.0001 }).run();
  db.insert(accounts)
    .values({
      id: accountId,
      name: 'A',
      accountCurrency: 'USD',
      initialBalance: 1000,
      accountType: 'DEMO',
      createdAtUtc: nowIso(),
      updatedAtUtc: nowIso(),
    })
    .run();
  db.insert(trades)
    .values({
      id: 't1',
      accountId,
      symbol: 'EURUSD',
      direction: 'LONG',
      status: 'OPEN',
      createdAtUtc: nowIso(),
      updatedAtUtc: nowIso(),
    })
    .run();
});

describe('T3.9 trade_legs execution-quality columns', () => {
  it('round-trips slippage_pips + spread_at_entry_pips on a fresh schema.sql DB', () => {
    db.insert(tradeLegs)
      .values({
        id: 'l1',
        tradeId: 't1',
        legType: 'ENTRY',
        timestampUtc: nowIso(),
        price: 1.09,
        volumeLots: 1,
        slippagePips: -0.7,
        spreadAtEntryPips: 1.1,
        createdAtUtc: nowIso(),
      })
      .run();

    const row = db.select().from(tradeLegs).where(eq(tradeLegs.id, 'l1')).get();
    expect(row!.slippagePips).toBeCloseTo(-0.7, 10);
    expect(row!.spreadAtEntryPips).toBeCloseTo(1.1, 10);
  });

  it('leaves both null when not provided', () => {
    db.insert(tradeLegs)
      .values({
        id: 'l2',
        tradeId: 't1',
        legType: 'EXIT',
        timestampUtc: nowIso(),
        price: 1.1,
        volumeLots: 1,
        createdAtUtc: nowIso(),
      })
      .run();
    const row = db.select().from(tradeLegs).where(eq(tradeLegs.id, 'l2')).get();
    expect(row!.slippagePips).toBeNull();
    expect(row!.spreadAtEntryPips).toBeNull();
  });
});
