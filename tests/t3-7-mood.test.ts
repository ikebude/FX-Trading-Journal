/**
 * T3.7 — Mood check-in + anxiety schema/round-trip tests.
 *
 * Uses an in-memory SQLite DB seeded from schema.sql (the DDL source of
 * truth that production fresh-installs and this harness both use). This is
 * also the schema.sql<->schema.ts parity guard for T3.7's data model.
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
import { moodCheckins, trades, accounts, instruments } from '../src/lib/db/schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL = readFileSync(join(__dirname, '..', 'schema.sql'), 'utf-8');

const uuid = () => randomUUID();
const nowIso = () => new Date().toISOString();

function makeDb(): BetterSQLite3Database<typeof schema> {
  const raw = new Database(':memory:');
  const sql = SCHEMA_SQL.replace(/PRAGMA journal_mode\s*=\s*WAL\s*;/i, '');
  raw.pragma('foreign_keys = ON');
  raw.exec(sql);
  return drizzle(raw, { schema });
}

let db: BetterSQLite3Database<typeof schema>;
let accountId: string;

beforeEach(() => {
  db = makeDb();
  accountId = uuid();
  db.insert(instruments).values({ symbol: 'EURUSD', pipSize: 0.0001 }).run();
  db.insert(accounts)
    .values({
      id: accountId,
      name: 'Test Account',
      accountCurrency: 'USD',
      initialBalance: 10000,
      accountType: 'DEMO',
      createdAtUtc: nowIso(),
      updatedAtUtc: nowIso(),
    })
    .run();
});

describe('T3.7 mood_checkins schema', () => {
  it('round-trips an account-scoped mood check-in', () => {
    const id = uuid();
    db.insert(moodCheckins)
      .values({
        id,
        accountId,
        moodScore: 4,
        note: 'Focused after a walk',
        checkedInAtUtc: nowIso(),
        createdAtUtc: nowIso(),
      })
      .run();

    const row = db.select().from(moodCheckins).where(eq(moodCheckins.id, id)).get();
    expect(row).toBeDefined();
    expect(row!.moodScore).toBe(4);
    expect(row!.note).toBe('Focused after a walk');
    expect(row!.accountId).toBe(accountId);
  });

  it('allows a global (account-less) check-in and a null note', () => {
    const id = uuid();
    db.insert(moodCheckins)
      .values({
        id,
        accountId: null,
        moodScore: 2,
        note: null,
        checkedInAtUtc: nowIso(),
        createdAtUtc: nowIso(),
      })
      .run();

    const row = db.select().from(moodCheckins).where(eq(moodCheckins.id, id)).get();
    expect(row!.accountId).toBeNull();
    expect(row!.note).toBeNull();
    expect(row!.moodScore).toBe(2);
  });
});

describe('T3.7 trades.anxiety_level (schema.sql<->schema.ts parity)', () => {
  it('accepts a trade carrying an anxiety_level on a fresh schema.sql DB', () => {
    const id = uuid();
    db.insert(trades)
      .values({
        id,
        accountId,
        symbol: 'EURUSD',
        direction: 'LONG',
        status: 'OPEN',
        anxietyLevel: 7,
        createdAtUtc: nowIso(),
        updatedAtUtc: nowIso(),
      })
      .run();

    const row = db.select().from(trades).where(eq(trades.id, id)).get();
    expect(row!.anxietyLevel).toBe(7);
  });

  it('leaves anxiety_level null when not provided', () => {
    const id = uuid();
    db.insert(trades)
      .values({
        id,
        accountId,
        symbol: 'EURUSD',
        direction: 'SHORT',
        status: 'OPEN',
        createdAtUtc: nowIso(),
        updatedAtUtc: nowIso(),
      })
      .run();

    const row = db.select().from(trades).where(eq(trades.id, id)).get();
    expect(row!.anxietyLevel).toBeNull();
  });
});
