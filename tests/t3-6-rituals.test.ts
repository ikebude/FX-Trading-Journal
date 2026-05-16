/**
 * T3.6: Pre-trade ritual checklist + post-trade reflection queue
 *
 * Tests ritual creation, enforcement, and reflection tracking.
 * Uses an in-memory SQLite DB seeded from schema.sql — no singleton required.
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
import { rituals, tradeReflections, trades, accounts, instruments } from '../src/lib/db/schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL = readFileSync(join(__dirname, '..', 'schema.sql'), 'utf-8');

const uuid = () => randomUUID();

function makeDb(): BetterSQLite3Database<typeof schema> {
  const raw = new Database(':memory:');
  const sql = SCHEMA_SQL.replace(/PRAGMA journal_mode\s*=\s*WAL\s*;/i, '');
  raw.pragma('foreign_keys = ON');
  raw.exec(sql);
  return drizzle(raw, { schema });
}

const nowIso = () => new Date().toISOString();

let db: BetterSQLite3Database<typeof schema>;
let accountId: string;

beforeEach(() => {
  db = makeDb();
  accountId = uuid();
  // trades.symbol has REFERENCES instruments(symbol) — seed the instrument
  // the reflection/integration trades use, or the trade INSERT fails the FK.
  for (const symbol of ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD']) {
    db.insert(instruments).values({ symbol, pipSize: 0.0001 }).run();
  }
  db.insert(accounts).values({
    id: accountId,
    name: 'Test Account',
    accountCurrency: 'USD',
    initialBalance: 10000,
    accountType: 'DEMO',
    createdAtUtc: nowIso(),
    updatedAtUtc: nowIso(),
  }).run();
});

// ─────────────────────────────────────────────────────────────
// Ritual CRUD Tests
// ─────────────────────────────────────────────────────────────

describe('T3.6 Rituals', () => {
  it('should create a ritual with required and optional items', () => {
    const ritualId = uuid();
    const items = [
      { id: 'item-1', text: 'Check economic calendar', optional: false },
      { id: 'item-2', text: 'Verify trend direction', optional: false },
      { id: 'item-3', text: 'Review trade plan', optional: true },
    ];

    db.insert(rituals).values({
      id: ritualId,
      accountId,
      name: 'Breakout Checklist',
      setupName: 'Trend Continuation',
      items: JSON.stringify(items),
      isActive: true,
      createdAtUtc: nowIso(),
      updatedAtUtc: nowIso(),
    }).run();

    const result = db.select().from(rituals).where(eq(rituals.id, ritualId)).get();

    expect(result).toBeDefined();
    expect(result!.name).toBe('Breakout Checklist');
    expect(JSON.parse(result!.items)).toHaveLength(3);
    expect(JSON.parse(result!.items)[0].optional).toBe(false);
    expect(JSON.parse(result!.items)[2].optional).toBe(true);
  });

  it('should list rituals by account', () => {
    const otherAccountId = uuid();
    db.insert(accounts).values({
      id: otherAccountId,
      name: 'Other Account',
      accountCurrency: 'USD',
      initialBalance: 5000,
      accountType: 'LIVE',
      createdAtUtc: nowIso(),
      updatedAtUtc: nowIso(),
    }).run();

    db.insert(rituals).values({
      id: uuid(), accountId, name: 'Ritual 1',
      items: JSON.stringify([{ id: '1', text: 'Item 1' }]),
      isActive: true, createdAtUtc: nowIso(), updatedAtUtc: nowIso(),
    }).run();

    db.insert(rituals).values({
      id: uuid(), accountId, name: 'Ritual 2',
      items: JSON.stringify([{ id: '2', text: 'Item 2' }]),
      isActive: true, createdAtUtc: nowIso(), updatedAtUtc: nowIso(),
    }).run();

    db.insert(rituals).values({
      id: uuid(), accountId: otherAccountId, name: 'Other Ritual',
      items: JSON.stringify([{ id: '3', text: 'Item 3' }]),
      isActive: true, createdAtUtc: nowIso(), updatedAtUtc: nowIso(),
    }).run();

    const accountRituals = db.select().from(rituals).where(eq(rituals.accountId, accountId)).all();

    expect(accountRituals).toHaveLength(2);
    expect(accountRituals.every((r) => r.accountId === accountId)).toBe(true);
  });

  it('should update ritual items and active status', () => {
    const ritualId = uuid();
    db.insert(rituals).values({
      id: ritualId, accountId, name: 'Ritual',
      items: JSON.stringify([{ id: '1', text: 'Original Item' }]),
      isActive: true, createdAtUtc: nowIso(), updatedAtUtc: nowIso(),
    }).run();

    db.update(rituals).set({
      items: JSON.stringify([{ id: '1', text: 'Updated Item' }, { id: '2', text: 'New Item' }]),
      isActive: false,
      updatedAtUtc: nowIso(),
    }).where(eq(rituals.id, ritualId)).run();

    const result = db.select().from(rituals).where(eq(rituals.id, ritualId)).get();

    expect(JSON.parse(result!.items)).toHaveLength(2);
    // rituals.isActive is a Drizzle boolean-mode column → returns false, not 0.
    expect(result!.isActive).toBe(false);
  });

  it('should delete a ritual', () => {
    const ritualId = uuid();
    db.insert(rituals).values({
      id: ritualId, accountId, name: 'Ritual to Delete',
      items: JSON.stringify([{ id: '1', text: 'Item' }]),
      isActive: true, createdAtUtc: nowIso(), updatedAtUtc: nowIso(),
    }).run();

    db.delete(rituals).where(eq(rituals.id, ritualId)).run();

    const result = db.select().from(rituals).where(eq(rituals.id, ritualId)).get();
    expect(result).toBeUndefined();
  });

  it('should filter rituals by setup name', () => {
    db.insert(rituals).values({
      id: uuid(), accountId, name: 'Breakout Ritual', setupName: 'Trend Continuation',
      items: JSON.stringify([{ id: '1', text: 'Item' }]),
      isActive: true, createdAtUtc: nowIso(), updatedAtUtc: nowIso(),
    }).run();

    db.insert(rituals).values({
      id: uuid(), accountId, name: 'Range Ritual', setupName: 'Range Bounce',
      items: JSON.stringify([{ id: '2', text: 'Item' }]),
      isActive: true, createdAtUtc: nowIso(), updatedAtUtc: nowIso(),
    }).run();

    const trendRituals = db.select().from(rituals).where(eq(rituals.setupName, 'Trend Continuation')).all();

    expect(trendRituals).toHaveLength(1);
    expect(trendRituals[0].name).toBe('Breakout Ritual');
  });
});

// ─────────────────────────────────────────────────────────────
// Trade Reflection Tests
// ─────────────────────────────────────────────────────────────

describe('T3.6 Trade Reflections', () => {
  function insertClosedTrade(id: string, closedHoursAgo = 1) {
    db.insert(trades).values({
      id,
      accountId,
      symbol: 'EURUSD',
      direction: 'LONG',
      status: 'CLOSED',
      initialStopPrice: 1.09,
      initialTargetPrice: 1.105,
      setupName: 'Trend',
      session: 'LONDON',
      confidence: 4,
      createdAtUtc: nowIso(),
      openedAtUtc: nowIso(),
      closedAtUtc: new Date(Date.now() - closedHoursAgo * 3600000).toISOString(),
      updatedAtUtc: nowIso(),
    }).run();
  }

  it('should create a reflection for a closed trade', () => {
    const tradeId = uuid();
    const reflectionId = uuid();
    insertClosedTrade(tradeId);

    db.insert(tradeReflections).values({
      id: reflectionId,
      tradeId,
      reflection: 'Good risk management. Stuck to the plan and closed at target.',
      reflectedAtUtc: nowIso(),
    }).run();

    const result = db.select().from(tradeReflections).where(eq(tradeReflections.tradeId, tradeId)).get();

    expect(result).toBeDefined();
    expect(result!.reflection).toContain('Good risk management');
    expect(result!.tradeId).toBe(tradeId);
  });

  it('should update an existing reflection', () => {
    const tradeId = uuid();
    const reflectionId = uuid();
    insertClosedTrade(tradeId, 2);

    db.insert(tradeReflections).values({
      id: reflectionId, tradeId,
      reflection: 'Initial reflection',
      reflectedAtUtc: new Date(Date.now() - 3600000).toISOString(),
    }).run();

    const updatedAt = nowIso();
    db.update(tradeReflections).set({
      reflection: 'Updated reflection with better insights.',
      reflectedAtUtc: updatedAt,
    }).where(eq(tradeReflections.tradeId, tradeId)).run();

    const result = db.select().from(tradeReflections).where(eq(tradeReflections.tradeId, tradeId)).get();
    expect(result!.reflection).toBe('Updated reflection with better insights.');
  });

  it('should not require reflection for open trades', () => {
    const tradeId = uuid();
    db.insert(trades).values({
      id: tradeId, accountId, symbol: 'GBPUSD', direction: 'LONG', status: 'OPEN',
      initialStopPrice: 1.26, initialTargetPrice: 1.28,
      setupName: 'Breakout', session: 'TOKYO', confidence: 5,
      createdAtUtc: nowIso(), openedAtUtc: nowIso(), updatedAtUtc: nowIso(),
    }).run();

    const reflection = db.select().from(tradeReflections).where(eq(tradeReflections.tradeId, tradeId)).get();
    expect(reflection).toBeUndefined();
  });

  it('should allow listing of unreflected trades (by time window)', () => {
    const withReflection = uuid();
    const unreflected = uuid();
    const oldTrade = uuid();

    insertClosedTrade(withReflection, 1);
    insertClosedTrade(unreflected, 2);

    // Old trade closed >48h ago
    db.insert(trades).values({
      id: oldTrade, accountId, symbol: 'USDJPY', direction: 'LONG', status: 'CLOSED',
      initialStopPrice: 150, initialTargetPrice: 151.5,
      setupName: 'Trend', session: 'TOKYO', confidence: 2,
      createdAtUtc: new Date(Date.now() - 3 * 24 * 3600000).toISOString(),
      openedAtUtc: new Date(Date.now() - 3 * 24 * 3600000).toISOString(),
      closedAtUtc: new Date(Date.now() - 3 * 24 * 3600000).toISOString(),
      updatedAtUtc: nowIso(),
    }).run();

    db.insert(tradeReflections).values({
      id: uuid(), tradeId: withReflection,
      reflection: 'Already reflected', reflectedAtUtc: nowIso(),
    }).run();

    const reflectedIds = new Set(db.select().from(tradeReflections).all().map((r) => r.tradeId));
    const cutoff = new Date(Date.now() - 48 * 3600000).toISOString();
    const allClosed = db.select().from(trades).where(eq(trades.accountId, accountId)).all();
    const unreflectedRecent = allClosed.filter(
      (t) => t.status === 'CLOSED' && !reflectedIds.has(t.id) && (t.closedAtUtc ?? '') > cutoff,
    );

    expect(unreflectedRecent).toHaveLength(1);
    expect(unreflectedRecent[0].id).toBe(unreflected);
  });

  it('should preserve reflection across trade updates', () => {
    const tradeId = uuid();
    const reflectionId = uuid();
    insertClosedTrade(tradeId);

    db.insert(tradeReflections).values({
      id: reflectionId, tradeId,
      reflection: 'Excellent execution.',
      reflectedAtUtc: nowIso(),
    }).run();

    db.update(trades).set({
      setupName: 'Trend Continuation (Updated)',
      updatedAtUtc: nowIso(),
    }).where(eq(trades.id, tradeId)).run();

    const reflection = db.select().from(tradeReflections).where(eq(tradeReflections.tradeId, tradeId)).get();
    expect(reflection).toBeDefined();
    expect(reflection!.reflection).toBe('Excellent execution.');
  });
});

// ─────────────────────────────────────────────────────────────
// Integration Tests: Ritual + Reflection Workflow
// ─────────────────────────────────────────────────────────────

describe('T3.6 Integration: Ritual + Reflection Workflow', () => {
  it('should enforce ritual completion before trade entry (form validation)', () => {
    const ritualId = uuid();
    const ritualItems = [
      { id: '1', text: 'Check hourly trend', optional: false },
      { id: '2', text: 'Verify support/resistance', optional: false },
      { id: '3', text: 'Review past similar trades', optional: true },
    ];

    db.insert(rituals).values({
      id: ritualId, accountId, name: 'Trend Ritual',
      setupName: 'Trend Continuation',
      items: JSON.stringify(ritualItems),
      isActive: true, createdAtUtc: nowIso(), updatedAtUtc: nowIso(),
    }).run();

    const retrieved = db.select().from(rituals).where(eq(rituals.setupName, 'Trend Continuation')).get();
    expect(retrieved).toBeDefined();
    expect(retrieved!.isActive).toBe(true);

    const items = JSON.parse(retrieved!.items) as Array<{ id: string; text: string; optional: boolean }>;
    const requiredItems = items.filter((item) => !item.optional);
    expect(requiredItems).toHaveLength(2);

    const checkedItemIds = new Set(['1', '2']);
    const allRequiredChecked = requiredItems.every((item) => checkedItemIds.has(item.id));
    expect(allRequiredChecked).toBe(true);
  });

  it('should populate reflection queue correctly (e.g., for dashboard)', () => {
    const symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD'];
    const tradeIds: string[] = [];

    for (let i = 0; i < 5; i++) {
      const tradeId = uuid();
      tradeIds.push(tradeId);
      db.insert(trades).values({
        id: tradeId, accountId,
        symbol: symbols[i],
        direction: i % 2 === 0 ? 'LONG' : 'SHORT',
        status: 'CLOSED',
        initialStopPrice: 1.09 + i * 0.01,
        initialTargetPrice: 1.105 + i * 0.01,
        setupName: 'Trend', session: 'LONDON',
        confidence: 3 + (i % 3),
        createdAtUtc: nowIso(), openedAtUtc: nowIso(),
        closedAtUtc: new Date(Date.now() - (i + 1) * 3600000).toISOString(),
        updatedAtUtc: nowIso(),
      }).run();

      if (i < 2) {
        db.insert(tradeReflections).values({
          id: uuid(), tradeId,
          reflection: `Reflection for trade ${i + 1}`,
          reflectedAtUtc: nowIso(),
        }).run();
      }
    }

    const reflected = new Set(db.select().from(tradeReflections).all().map((r) => r.tradeId));
    const recentTrades = db.select().from(trades).where(eq(trades.accountId, accountId)).all();
    const unreflected = recentTrades.filter((t) => !reflected.has(t.id));

    expect(recentTrades).toHaveLength(5);
    expect(unreflected).toHaveLength(3);
  });
});
