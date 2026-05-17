/**
 * T6.1 — voice_memos schema.sql<->schema.ts parity guard.
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
import { voiceMemos, trades, accounts, instruments } from '../src/lib/db/schema';

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

describe('T6.1 voice_memos', () => {
  it('round-trips a memo with a null transcript (model-missing case)', () => {
    db.insert(voiceMemos)
      .values({
        id: 'v1',
        tradeId: 't1',
        audioPath: 'voice/t1/v1.webm',
        transcript: null,
        durationSec: 42.5,
        createdAtUtc: nowIso(),
      })
      .run();
    const row = db.select().from(voiceMemos).where(eq(voiceMemos.id, 'v1')).get();
    expect(row!.audioPath).toBe('voice/t1/v1.webm');
    expect(row!.transcript).toBeNull();
    expect(row!.durationSec).toBeCloseTo(42.5, 6);
  });

  it('cascades on trade delete', () => {
    db.insert(voiceMemos)
      .values({ id: 'v2', tradeId: 't1', audioPath: 'a', createdAtUtc: nowIso() })
      .run();
    db.delete(trades).where(eq(trades.id, 't1')).run();
    expect(db.select().from(voiceMemos).all()).toHaveLength(0);
  });
});
