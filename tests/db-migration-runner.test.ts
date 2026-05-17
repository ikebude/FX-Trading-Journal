/**
 * Fresh-install migration-runner guard.
 *
 * Regression test for the bug where a brand-new DB ran applyMigration001
 * (full schema.sql) and THEN the incremental 002–013 migrations, which
 * re-ALTERed columns schema.sql already created → "duplicate column name"
 * → first-launch crash. The other DB tests exec schema.sql directly and
 * bypass the runner, so this path was previously untested.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeDatabase, getDb, closeDatabase } from '../src/lib/db/client';
import { trades, accounts, instruments, voiceMemos } from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, '..', 'schema.sql');

afterAll(() => closeDatabase());

describe('initializeDatabase — fresh install', () => {
  it('initialises an in-memory DB without a duplicate-column crash', async () => {
    await expect(
      initializeDatabase(':memory:', SCHEMA_PATH),
    ).resolves.toBeUndefined();
  });

  it('jumps a fresh DB straight to the latest schema version', () => {
    const raw = (getDb() as unknown as { session: { client: { pragma: (s: string, o: { simple: boolean }) => number } } }).session
      .client;
    expect(raw.pragma('user_version', { simple: true })).toBe(13);
  });

  it('seeds instruments on fresh install (applyMigration001)', () => {
    // EURUSD is part of the seeded reference data — proves migration 001
    // ran its seed step on the fresh DB.
    const seeded = getDb()
      .select()
      .from(instruments)
      .where(eq(instruments.symbol, 'EURUSD'))
      .get();
    expect(seeded).toBeDefined();
    expect(seeded!.pipSize).toBeGreaterThan(0);
  });

  it('accepts a trade carrying v1.1 columns + reads back voice_memos', () => {
    const db = getDb();
    db.insert(accounts)
      .values({
        id: 'a1',
        name: 'A',
        accountCurrency: 'USD',
        initialBalance: 1000,
        accountType: 'DEMO',
        createdAtUtc: new Date().toISOString(),
        updatedAtUtc: new Date().toISOString(),
      })
      .run();
    db.insert(trades)
      .values({
        id: 't1',
        accountId: 'a1',
        symbol: 'EURUSD',
        direction: 'LONG',
        status: 'OPEN',
        anxietyLevel: 5, // migration-008 column
        isPinned: true, // migration-011 column
        createdAtUtc: new Date().toISOString(),
        updatedAtUtc: new Date().toISOString(),
      })
      .run();
    const row = db.select().from(trades).where(eq(trades.id, 't1')).get();
    expect(row!.anxietyLevel).toBe(5);
    expect(row!.isPinned).toBe(true);
    // voice_memos (migration 012) exists and is queryable.
    expect(db.select().from(voiceMemos).all()).toEqual([]);
  });
});
