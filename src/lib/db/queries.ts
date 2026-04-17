/**
 * Ledger — Database query layer
 *
 * All reads and writes go through these functions.
 * No raw SQL strings in app code — Drizzle only.
 * Each mutating function appends an audit_log row.
 */

import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { getDb } from './client';
import {
  accounts,
  auditLog,
  instruments,
  reviews,
  screenshots,
  setups,
  tags,
  tradeTags,
  tradeLegs,
  tradeNotes,
  trades,
  type Account,
  type AuditLogEntry,
  type Instrument,
  type NewAccount,
  type NewTrade,
  type NewTradeLeg,
  type Review,
  type Screenshot,
  type Setup,
  type Tag,
  type Trade,
  type TradeLeg,
  type TradeNote,
} from './schema';
import type { TradeFilters } from '../schemas';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function nowUtc(): string {
  return new Date().toISOString();
}

function newId(): string {
  return nanoid();
}

export async function writeAudit(
  entityType: AuditLogEntry['entityType'],
  entityId: string,
  action: AuditLogEntry['action'],
  tradeId: string | null = null,
  changedFields?: Record<string, [unknown, unknown]>,
): Promise<void> {
  const db = getDb();
  await db.insert(auditLog).values({
    id: newId(),
    entityType,
    entityId,
    tradeId: tradeId ?? undefined,
    action,
    changedFields: changedFields ? JSON.stringify(changedFields) : null,
    actor: 'user',
    timestampUtc: nowUtc(),
  });
}

// ─────────────────────────────────────────────────────────────
// Accounts
// ─────────────────────────────────────────────────────────────

export async function listAccounts(): Promise<Account[]> {
  return getDb().select().from(accounts).orderBy(asc(accounts.createdAtUtc));
}

export async function getAccount(id: string): Promise<Account | undefined> {
  const rows = await getDb().select().from(accounts).where(eq(accounts.id, id)).limit(1);
  return rows[0];
}

export async function createAccount(data: Omit<NewAccount, 'id' | 'createdAtUtc' | 'updatedAtUtc'>): Promise<Account> {
  const db = getDb();
  const now = nowUtc();
  const id = newId();
  await db.insert(accounts).values({ ...data, id, createdAtUtc: now, updatedAtUtc: now });
  await writeAudit('ACCOUNT', id, 'CREATE');
  return (await getAccount(id))!;
}

export async function updateAccount(
  id: string,
  patch: Partial<Omit<NewAccount, 'id' | 'createdAtUtc' | 'updatedAtUtc'>>,
): Promise<Account> {
  const db = getDb();
  const before = await getAccount(id);
  if (!before) throw new Error(`Account not found: ${id}`);

  const now = nowUtc();
  await db.update(accounts).set({ ...patch, updatedAtUtc: now }).where(eq(accounts.id, id));

  const changed: Record<string, [unknown, unknown]> = {};
  for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
    if (before[key as keyof Account] !== patch[key]) {
      changed[key] = [before[key as keyof Account], patch[key]];
    }
  }
  await writeAudit('ACCOUNT', id, 'UPDATE', null, changed);
  return (await getAccount(id))!;
}

export async function deleteAccount(id: string): Promise<void> {
  const db = getDb();
  await writeAudit('ACCOUNT', id, 'DELETE');
  await db.delete(accounts).where(eq(accounts.id, id));
}

// ─────────────────────────────────────────────────────────────
// Instruments
// ─────────────────────────────────────────────────────────────

export async function listInstruments(): Promise<Instrument[]> {
  return getDb().select().from(instruments).orderBy(asc(instruments.symbol));
}

export async function getInstrument(symbol: string): Promise<Instrument | undefined> {
  const rows = await getDb()
    .select()
    .from(instruments)
    .where(eq(instruments.symbol, symbol))
    .limit(1);
  return rows[0];
}

export async function upsertInstrument(data: Instrument): Promise<void> {
  await getDb()
    .insert(instruments)
    .values(data)
    .onConflictDoUpdate({
      target: instruments.symbol,
      set: {
        displayName: data.displayName,
        assetClass: data.assetClass,
        baseCurrency: data.baseCurrency,
        quoteCurrency: data.quoteCurrency,
        pipSize: data.pipSize,
        contractSize: data.contractSize,
        digits: data.digits,
        isActive: data.isActive,
      },
    });
}

// ─────────────────────────────────────────────────────────────
// Trades — list with filters
// ─────────────────────────────────────────────────────────────

export interface TradeRow extends Trade {
  tags: { id: number; name: string; category: string; color: string | null }[];
}

export async function listTrades(filters: TradeFilters): Promise<{ rows: TradeRow[]; total: number }> {
  const db = getDb();

  const conditions = [];

  if (filters.ids?.length) {
    conditions.push(inArray(trades.id, filters.ids));
  }
  if (filters.accountId) {
    conditions.push(eq(trades.accountId, filters.accountId));
  }
  if (filters.status?.length) {
    conditions.push(inArray(trades.status, filters.status));
  }
  if (filters.direction) {
    conditions.push(eq(trades.direction, filters.direction));
  }
  if (filters.symbol) {
    conditions.push(eq(trades.symbol, filters.symbol.toUpperCase()));
  }
  if (filters.setupName) {
    conditions.push(eq(trades.setupName, filters.setupName));
  }
  if (filters.marketCondition) {
    conditions.push(eq(trades.marketCondition, filters.marketCondition));
  }
  if (filters.dateFrom) {
    conditions.push(gte(trades.openedAtUtc, filters.dateFrom));
  }
  if (filters.dateTo) {
    conditions.push(lte(trades.openedAtUtc, filters.dateTo));
  }
  if (filters.minPnl != null) {
    conditions.push(gte(trades.netPnl, filters.minPnl));
  }
  if (filters.maxPnl != null) {
    conditions.push(lte(trades.netPnl, filters.maxPnl));
  }

  if (filters.deletedOnly) {
    conditions.push(sql`${trades.deletedAtUtc} IS NOT NULL`);
  } else if (!filters.includeDeleted) {
    conditions.push(isNull(trades.deletedAtUtc));
  }
  if (!filters.includeSample) {
    conditions.push(eq(trades.isSample, false));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Count total (for pagination)
  const countRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(trades)
    .where(where);
  const total = countRows[0]?.count ?? 0;

  // Determine sort column
  const sortColMap: Record<string, typeof trades[keyof typeof trades]> = {
    opened_at_utc: trades.openedAtUtc,
    closed_at_utc: trades.closedAtUtc,
    net_pnl: trades.netPnl,
    net_pips: trades.netPips,
    r_multiple: trades.rMultiple,
    symbol: trades.symbol,
    created_at_utc: trades.createdAtUtc,
  };
  const sortCol = sortColMap[filters.sortBy] ?? trades.openedAtUtc;
  const sortFn = filters.sortDir === 'asc' ? asc : desc;

  const offset = (filters.page - 1) * filters.pageSize;
  const tradeRows = await db
    .select()
    .from(trades)
    .where(where)
    .orderBy(sortFn(sortCol as Parameters<typeof asc>[0]))
    .limit(filters.pageSize)
    .offset(offset);

  // Attach tags to each trade
  const tradeIds = tradeRows.map((t) => t.id);
  const tagsByTrade: Map<string, TradeRow['tags']> = new Map();

  if (tradeIds.length > 0) {
    const tagRows = await db
      .select({
        tradeId: tradeTags.tradeId,
        id: tags.id,
        name: tags.name,
        category: tags.category,
        color: tags.color,
      })
      .from(tradeTags)
      .innerJoin(tags, eq(tags.id, tradeTags.tagId))
      .where(inArray(tradeTags.tradeId, tradeIds));

    for (const row of tagRows) {
      if (!tagsByTrade.has(row.tradeId)) tagsByTrade.set(row.tradeId, []);
      tagsByTrade.get(row.tradeId)!.push({
        id: row.id,
        name: row.name,
        category: row.category,
        color: row.color,
      });
    }
  }

  const rows: TradeRow[] = tradeRows.map((t) => ({
    ...t,
    tags: tagsByTrade.get(t.id) ?? [],
  }));

  return { rows, total };
}

// ─────────────────────────────────────────────────────────────
// Trades — get single with legs
// ─────────────────────────────────────────────────────────────

export interface TradeDetail extends TradeRow {
  legs: TradeLeg[];
  notes: TradeNote[];
  screenshotList: Screenshot[];
}

export async function getTrade(id: string, includeDeleted = false): Promise<TradeDetail | undefined> {
  const db = getDb();
  const cond = includeDeleted
    ? eq(trades.id, id)
    : and(eq(trades.id, id), isNull(trades.deletedAtUtc));
  const rows = await db.select().from(trades).where(cond).limit(1);
  if (!rows[0]) return undefined;

  const [legs, notes, screenshotList, tagRows] = await Promise.all([
    db.select().from(tradeLegs).where(eq(tradeLegs.tradeId, id)).orderBy(asc(tradeLegs.timestampUtc)),
    db
      .select()
      .from(tradeNotes)
      .where(and(eq(tradeNotes.tradeId, id), isNull(tradeNotes.deletedAtUtc)))
      .orderBy(asc(tradeNotes.createdAtUtc)),
    db.select().from(screenshots).where(eq(screenshots.tradeId, id)).orderBy(asc(screenshots.createdAtUtc)),
    db
      .select({ id: tags.id, name: tags.name, category: tags.category, color: tags.color })
      .from(tradeTags)
      .innerJoin(tags, eq(tags.id, tradeTags.tagId))
      .where(eq(tradeTags.tradeId, id)),
  ]);

  return { ...rows[0], legs, notes, screenshotList, tags: tagRows };
}

// ─────────────────────────────────────────────────────────────
// Trades — create
// ─────────────────────────────────────────────────────────────

export async function createTrade(
  data: Omit<NewTrade, 'id' | 'createdAtUtc' | 'updatedAtUtc'>,
): Promise<Trade> {
  const db = getDb();
  const now = nowUtc();
  const id = newId();
  await db.insert(trades).values({ ...data, id, createdAtUtc: now, updatedAtUtc: now });
  await writeAudit('TRADE', id, 'CREATE', id);
  await refreshTradeFts(id);
  return (await getTrade(id)) as Trade;
}

// ─────────────────────────────────────────────────────────────
// Trades — update
// ─────────────────────────────────────────────────────────────

export async function updateTrade(
  id: string,
  patch: Partial<Omit<NewTrade, 'id' | 'createdAtUtc'>>,
): Promise<Trade> {
  const db = getDb();
  const before = await getTrade(id);
  if (!before) throw new Error(`Trade not found: ${id}`);

  const now = nowUtc();
  await db.update(trades).set({ ...patch, updatedAtUtc: now }).where(eq(trades.id, id));

  const changed: Record<string, [unknown, unknown]> = {};
  for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
    if (before[key as keyof Trade] !== patch[key]) {
      changed[key] = [before[key as keyof Trade], patch[key]];
    }
  }
  await writeAudit('TRADE', id, 'UPDATE', id, changed);
  await refreshTradeFts(id);
  return (await getTrade(id)) as Trade;
}

// ─────────────────────────────────────────────────────────────
// Trades — soft delete / restore / hard delete
// ─────────────────────────────────────────────────────────────

export async function softDeleteTrades(ids: string[]): Promise<void> {
  const db = getDb();
  const now = nowUtc();
  await db.update(trades).set({ deletedAtUtc: now, updatedAtUtc: now }).where(inArray(trades.id, ids));
  for (const id of ids) await writeAudit('TRADE', id, 'DELETE', id);
}

export async function restoreTrades(ids: string[]): Promise<void> {
  const db = getDb();
  const now = nowUtc();
  await db
    .update(trades)
    .set({ deletedAtUtc: null, updatedAtUtc: now })
    .where(inArray(trades.id, ids));
  for (const id of ids) await writeAudit('TRADE', id, 'RESTORE', id);
}

export async function hardDeleteTrades(ids: string[]): Promise<void> {
  const db = getDb();
  // Write HARD_DELETE audit entries BEFORE the delete so they survive.
  // After migration 002, audit_log.trade_id is SET NULL on delete —
  // these rows remain with trade_id = NULL as a permanent forensic record.
  for (const id of ids) {
    await writeAudit('TRADE', id, 'HARD_DELETE', id);
  }
  await db.delete(trades).where(inArray(trades.id, ids));
  // Remove from FTS index
  for (const id of ids) {
    db.run(sql`DELETE FROM trades_fts WHERE trade_id = ${id}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Trades — bulk update (patch multiple trades at once)
// ─────────────────────────────────────────────────────────────

export async function bulkUpdateTrades(
  ids: string[],
  patch: Partial<Pick<Trade, 'setupName' | 'marketCondition' | 'session' | 'confidence'>>,
): Promise<void> {
  const db = getDb();
  const now = nowUtc();
  await db.update(trades).set({ ...patch, updatedAtUtc: now }).where(inArray(trades.id, ids));
  for (const id of ids) await writeAudit('TRADE', id, 'BULK_UPDATE', id);
}

// ─────────────────────────────────────────────────────────────
// Sample data
// ─────────────────────────────────────────────────────────────

export async function clearSampleData(): Promise<number> {
  const db = getDb();
  const sampleTrades = await db
    .select({ id: trades.id })
    .from(trades)
    .where(eq(trades.isSample, true));
  if (sampleTrades.length === 0) return 0;
  const ids = sampleTrades.map((r) => r.id);
  await db.delete(trades).where(eq(trades.isSample, true));
  for (const id of ids) {
    db.run(sql`DELETE FROM trades_fts WHERE trade_id = ${id}`);
  }
  return ids.length;
}

// ─────────────────────────────────────────────────────────────
// Trade legs
// ─────────────────────────────────────────────────────────────

export async function listLegs(tradeId: string): Promise<TradeLeg[]> {
  return getDb()
    .select()
    .from(tradeLegs)
    .where(eq(tradeLegs.tradeId, tradeId))
    .orderBy(asc(tradeLegs.timestampUtc));
}

export async function createLeg(
  data: Omit<NewTradeLeg, 'id' | 'createdAtUtc'>,
): Promise<TradeLeg> {
  const db = getDb();
  const now = nowUtc();
  const id = newId();
  await db.insert(tradeLegs).values({ ...data, id, createdAtUtc: now });
  await writeAudit('LEG', id, 'CREATE', data.tradeId);
  const rows = await db.select().from(tradeLegs).where(eq(tradeLegs.id, id)).limit(1);
  return rows[0];
}

export async function updateLeg(
  id: string,
  patch: Partial<Omit<NewTradeLeg, 'id' | 'tradeId' | 'createdAtUtc'>>,
): Promise<TradeLeg> {
  const db = getDb();
  const before = await db.select().from(tradeLegs).where(eq(tradeLegs.id, id)).limit(1);
  if (!before[0]) throw new Error(`Leg not found: ${id}`);

  await db.update(tradeLegs).set(patch).where(eq(tradeLegs.id, id));
  await writeAudit('LEG', id, 'UPDATE', before[0].tradeId);
  const rows = await db.select().from(tradeLegs).where(eq(tradeLegs.id, id)).limit(1);
  return rows[0];
}

export async function deleteLeg(id: string): Promise<void> {
  const db = getDb();
  const before = await db.select().from(tradeLegs).where(eq(tradeLegs.id, id)).limit(1);
  if (before[0]) await writeAudit('LEG', id, 'DELETE', before[0].tradeId);
  await db.delete(tradeLegs).where(eq(tradeLegs.id, id));
}

// ─────────────────────────────────────────────────────────────
// Trade notes
// ─────────────────────────────────────────────────────────────

export async function listNotes(tradeId: string): Promise<TradeNote[]> {
  return getDb()
    .select()
    .from(tradeNotes)
    .where(and(eq(tradeNotes.tradeId, tradeId), isNull(tradeNotes.deletedAtUtc)))
    .orderBy(asc(tradeNotes.createdAtUtc));
}

export async function createNote(tradeId: string, bodyMd: string): Promise<TradeNote> {
  const db = getDb();
  const now = nowUtc();
  const id = newId();
  await db.insert(tradeNotes).values({ id, tradeId, bodyMd, createdAtUtc: now, updatedAtUtc: now });
  await writeAudit('NOTE', id, 'CREATE', tradeId);
  await refreshTradeFts(tradeId);
  const rows = await db.select().from(tradeNotes).where(eq(tradeNotes.id, id)).limit(1);
  return rows[0];
}

export async function updateNote(id: string, bodyMd: string): Promise<TradeNote> {
  const db = getDb();
  const now = nowUtc();
  const before = await db.select().from(tradeNotes).where(eq(tradeNotes.id, id)).limit(1);
  await db.update(tradeNotes).set({ bodyMd, updatedAtUtc: now }).where(eq(tradeNotes.id, id));
  await writeAudit('NOTE', id, 'UPDATE', before[0]?.tradeId ?? null);
  if (before[0]?.tradeId) await refreshTradeFts(before[0].tradeId);
  const rows = await db.select().from(tradeNotes).where(eq(tradeNotes.id, id)).limit(1);
  return rows[0];
}

export async function deleteNote(id: string): Promise<void> {
  const db = getDb();
  const now = nowUtc();
  const before = await db.select().from(tradeNotes).where(eq(tradeNotes.id, id)).limit(1);
  await db.update(tradeNotes).set({ deletedAtUtc: now }).where(eq(tradeNotes.id, id));
  await writeAudit('NOTE', id, 'DELETE', before[0]?.tradeId ?? null);
  if (before[0]?.tradeId) await refreshTradeFts(before[0].tradeId);
}

// ─────────────────────────────────────────────────────────────
// Screenshots
// ─────────────────────────────────────────────────────────────

export async function listScreenshots(tradeId: string): Promise<Screenshot[]> {
  return getDb()
    .select()
    .from(screenshots)
    .where(eq(screenshots.tradeId, tradeId))
    .orderBy(asc(screenshots.createdAtUtc));
}

export async function createScreenshot(data: Omit<Screenshot, 'id' | 'createdAtUtc'>): Promise<Screenshot> {
  const db = getDb();
  const now = nowUtc();
  const id = newId();
  await db.insert(screenshots).values({ ...data, id, createdAtUtc: now });
  await writeAudit('SCREENSHOT', id, 'CREATE', data.tradeId);
  const rows = await db.select().from(screenshots).where(eq(screenshots.id, id)).limit(1);
  return rows[0];
}

export async function deleteScreenshot(id: string): Promise<void> {
  const db = getDb();
  const before = await db.select().from(screenshots).where(eq(screenshots.id, id)).limit(1);
  if (before[0]) await writeAudit('SCREENSHOT', id, 'DELETE', before[0].tradeId);
  await db.delete(screenshots).where(eq(screenshots.id, id));
}

// ─────────────────────────────────────────────────────────────
// Tags
// ─────────────────────────────────────────────────────────────

export async function listTags(category?: string): Promise<Tag[]> {
  const db = getDb();
  if (category) {
    return db
      .select()
      .from(tags)
      .where(and(eq(tags.category, category as Tag['category']), eq(tags.isActive, true)))
      .orderBy(asc(tags.name));
  }
  return db.select().from(tags).where(eq(tags.isActive, true)).orderBy(asc(tags.category), asc(tags.name));
}

export async function createTag(
  name: string,
  category: Tag['category'],
  color?: string,
): Promise<Tag> {
  const db = getDb();
  const result = await db
    .insert(tags)
    .values({ name, category, color: color ?? null })
    .returning();
  return result[0];
}

export async function deleteTag(id: number): Promise<void> {
  await getDb().delete(tags).where(eq(tags.id, id));
}

export async function addTagsToTrade(tradeId: string, tagIds: number[]): Promise<void> {
  const db = getDb();
  const now = nowUtc();
  for (const tagId of tagIds) {
    await db
      .insert(tradeTags)
      .values({ tradeId, tagId, createdAtUtc: now })
      .onConflictDoNothing();
  }
  await writeAudit('TRADE_TAGS', tradeId, 'UPDATE', tradeId);
  await refreshTradeFts(tradeId);
}

export async function removeTagFromTrade(tradeId: string, tagId: number): Promise<void> {
  await getDb()
    .delete(tradeTags)
    .where(and(eq(tradeTags.tradeId, tradeId), eq(tradeTags.tagId, tagId)));
  await refreshTradeFts(tradeId);
}

// ─────────────────────────────────────────────────────────────
// Setups
// ─────────────────────────────────────────────────────────────

export async function listSetups(): Promise<Setup[]> {
  return getDb()
    .select()
    .from(setups)
    .where(eq(setups.isActive, true))
    .orderBy(asc(setups.name));
}

export async function createSetup(name: string, description?: string): Promise<Setup> {
  const result = await getDb()
    .insert(setups)
    .values({ name, description: description ?? null })
    .returning();
  return result[0];
}

export async function deleteSetup(id: number): Promise<void> {
  await getDb().delete(setups).where(eq(setups.id, id));
}

// ─────────────────────────────────────────────────────────────
// Reviews
// ─────────────────────────────────────────────────────────────

export async function listReviews(kind: Review['kind'], accountId?: string): Promise<Review[]> {
  const db = getDb();
  const conditions = [eq(reviews.kind, kind)];
  if (accountId) conditions.push(eq(reviews.accountId, accountId));
  return db
    .select()
    .from(reviews)
    .where(and(...conditions))
    .orderBy(desc(reviews.periodStartUtc));
}

export async function getReview(id: string): Promise<Review | undefined> {
  const rows = await getDb().select().from(reviews).where(eq(reviews.id, id)).limit(1);
  return rows[0];
}

export async function upsertReview(
  data: Omit<Review, 'id' | 'createdAtUtc' | 'updatedAtUtc'>,
): Promise<Review> {
  const db = getDb();
  const now = nowUtc();
  const id = newId();
  await db
    .insert(reviews)
    .values({ ...data, id, createdAtUtc: now, updatedAtUtc: now })
    .onConflictDoUpdate({
      target: [reviews.accountId, reviews.kind, reviews.periodStartUtc],
      set: {
        ...data,
        updatedAtUtc: now,
      },
    });
  const rows = await db
    .select()
    .from(reviews)
    .where(
      and(
        eq(reviews.accountId, data.accountId),
        eq(reviews.kind, data.kind),
        eq(reviews.periodStartUtc, data.periodStartUtc),
      ),
    )
    .limit(1);
  return rows[0];
}

// ─────────────────────────────────────────────────────────────
// Audit log
// ─────────────────────────────────────────────────────────────

export async function getAuditForTrade(tradeId: string): Promise<AuditLogEntry[]> {
  return getDb()
    .select()
    .from(auditLog)
    .where(eq(auditLog.tradeId, tradeId))
    .orderBy(desc(auditLog.timestampUtc));
}

// ─────────────────────────────────────────────────────────────
// Full-text search (FTS5 via raw SQL — not modelled in Drizzle)
// ─────────────────────────────────────────────────────────────

/**
 * Rebuilds the trades_fts row for a single trade.
 * Called after every mutation that touches setup_name, notes, tags, or symbol.
 * Uses DELETE + INSERT because FTS5 has no UPSERT.
 */
async function refreshTradeFts(tradeId: string): Promise<void> {
  const db = getDb();

  const tradeRows = await db
    .select({ symbol: trades.symbol, setupName: trades.setupName })
    .from(trades)
    .where(eq(trades.id, tradeId))
    .limit(1);

  // If trade no longer exists, remove from FTS and return
  if (!tradeRows[0]) {
    db.run(sql`DELETE FROM trades_fts WHERE trade_id = ${tradeId}`);
    return;
  }

  const { symbol, setupName } = tradeRows[0];

  const noteRows = await db
    .select({ bodyMd: tradeNotes.bodyMd })
    .from(tradeNotes)
    .where(and(eq(tradeNotes.tradeId, tradeId), isNull(tradeNotes.deletedAtUtc)));
  const notesText = noteRows.map((n) => n.bodyMd).join(' ');

  const tagRows = await db
    .select({ name: tags.name })
    .from(tradeTags)
    .innerJoin(tags, eq(tags.id, tradeTags.tagId))
    .where(eq(tradeTags.tradeId, tradeId));
  const tagsText = tagRows.map((t) => t.name).join(' ');

  db.run(sql`DELETE FROM trades_fts WHERE trade_id = ${tradeId}`);
  db.run(
    sql`INSERT INTO trades_fts(trade_id, setup_name, notes, tags, symbol)
        VALUES (${tradeId}, ${setupName ?? ''}, ${notesText}, ${tagsText}, ${symbol})`,
  );
}

// ─────────────────────────────────────────────────────────────
// F-4: Today's stats — used by the system tray to show a live P&L label.
// Uses the supplied UTC midnight string so the caller can apply their
// display_timezone offset rather than defaulting to server UTC.
// ─────────────────────────────────────────────────────────────

export async function getTodayStats(todayUtc: string): Promise<{ pnl: number; trades: number; wins: number }> {
  const db = getDb();
  const rows = await db
    .select({ netPnl: trades.netPnl })
    .from(trades)
    .where(
      and(
        isNull(trades.deletedAtUtc),
        eq(trades.status, 'CLOSED'),
        gte(trades.closedAtUtc, todayUtc),
      ),
    );
  const pnl = rows.reduce((s, r) => s + (r.netPnl ?? 0), 0);
  const wins = rows.filter((r) => (r.netPnl ?? 0) > 0).length;
  return { pnl, trades: rows.length, wins };
}

/**
 * Sanitise a user-supplied string for use as an FTS5 MATCH expression.
 *
 * Strategy: split on whitespace into tokens, double-quote each one (with any
 * embedded double-quotes doubled per FTS5 quoting rules), then join with AND.
 * This treats every token as a literal phrase prefix search rather than
 * exposing raw FTS5 boolean syntax (OR/NOT/NEAR/*) to user input.
 */
function sanitizeFtsQuery(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `"${token.replace(/"/g, '""')}"`)
    .join(' AND ');
}

export async function searchTrades(query: string, accountId?: string): Promise<string[]> {
  // Returns trade IDs matching the FTS query.
  // Uses the trades_fts virtual table seeded via the IPC trade mutation handlers.
  const db = getDb();
  const safeQuery = sanitizeFtsQuery(query);
  if (!safeQuery) return [];
  // Drizzle doesn't model FTS5 — use sql template tag for this one case.
  const rows = await db.run(
    sql`SELECT trade_id FROM trades_fts WHERE trades_fts MATCH ${safeQuery} ORDER BY rank LIMIT 100`,
  );
  // better-sqlite3 via drizzle run() returns rows as an object
  const results = (rows as unknown as { rows: { trade_id: string }[] }).rows ?? [];
  const ids = results.map((r) => r.trade_id);

  if (!ids.length) return [];
  if (!accountId) return ids;

  // Filter to requested account
  const filtered = await db
    .select({ id: trades.id })
    .from(trades)
    .where(and(inArray(trades.id, ids), eq(trades.accountId, accountId)));
  return filtered.map((r) => r.id);
}
