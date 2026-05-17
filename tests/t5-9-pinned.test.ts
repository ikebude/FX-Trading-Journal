/**
 * T5.9 — trades.is_pinned schema.sql<->schema.ts parity guard.
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
import { trades, accounts, instruments } from '../src/lib/db/schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL = readFileSync(join(__dirname, '..', 'schema.sql'), 'utf-8');
const uuid = () => randomUUID();
const nowIso = () => new Date().toISOString();

let db: BetterSQLite3Database<typeof schema>;
let accountId: string;

beforeEach(() => {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  raw.exec(SCHEMA_SQL.replace(/PRAGMA journal_mode\s*=\s*WAL\s*;/i, ''));
  db = drizzle(raw, { schema });
  accountId = uuid();
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
});

describe('T5.9 trades.is_pinned', () => {
  it('defaults to false and round-trips true', () => {
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
    let row = db.select().from(trades).where(eq(trades.id, 't1')).get();
    expect(row!.isPinned).toBe(false);

    db.update(trades).set({ isPinned: true }).where(eq(trades.id, 't1')).run();
    row = db.select().from(trades).where(eq(trades.id, 't1')).get();
    expect(row!.isPinned).toBe(true);
  });
});
