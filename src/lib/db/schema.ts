/**
 * Ledger — Drizzle schema
 *
 * Type-safe mirror of schema.sql. Every table queried from TypeScript
 * goes through these definitions; no raw SQL strings outside lib/db/.
 */

import { sql } from 'drizzle-orm';
import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';

// ─────────────────────────────────────────────────────────────
// Accounts
// ─────────────────────────────────────────────────────────────

export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    broker: text('broker'),
    accountCurrency: text('account_currency').notNull().default('USD'),
    initialBalance: real('initial_balance').notNull().default(0),
    accountType: text('account_type', { enum: ['LIVE', 'DEMO', 'PROP'] })
      .notNull()
      .default('LIVE'),
    displayColor: text('display_color').notNull().default('#3b82f6'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    openedAtUtc: text('opened_at_utc'),

    // Prop firm rules (only meaningful when accountType = 'PROP')
    propDailyLossLimit: real('prop_daily_loss_limit'),
    propDailyLossPct: real('prop_daily_loss_pct'),
    propMaxDrawdown: real('prop_max_drawdown'),
    propMaxDrawdownPct: real('prop_max_drawdown_pct'),
    propDrawdownType: text('prop_drawdown_type', { enum: ['STATIC', 'TRAILING'] }),
    propProfitTarget: real('prop_profit_target'),
    propProfitTargetPct: real('prop_profit_target_pct'),
    propPhase: text('prop_phase', { enum: ['PHASE_1', 'PHASE_2', 'FUNDED', 'VERIFIED'] }),

    // Broker metadata (v1.1 — T1.3). All nullable for forward-compat with v1.0.x.
    // Used for: prop-firm preset matching, server-time drift detection,
    // MT4/MT5 account lookup from the bridge.
    server: text('server'),
    platform: text('platform', {
      enum: ['MT4', 'MT5', 'cTrader', 'MatchTrader', 'DXtrade', 'IBKR', 'OANDA', 'CRYPTO', 'OTHER'],
    }),
    leverage: integer('leverage'),
    timezone: text('timezone'),
    login: text('login'),
    brokerType: text('broker_type', {
      enum: ['RETAIL', 'PROP', 'ECN', 'MARKET_MAKER', 'CRYPTO_EXCHANGE'],
    }),

    createdAtUtc: text('created_at_utc').notNull(),
    updatedAtUtc: text('updated_at_utc').notNull(),
  },
  (t) => ({
    activeIdx: index('idx_accounts_active').on(t.isActive),
    // Partial unique on (platform, server, login) enforced via raw SQL in
    // the migration — drizzle's uniqueIndex builder cannot emit a WHERE clause.
    // See migration: idx_accounts_login.
  }),
);

// ─────────────────────────────────────────────────────────────
// Instruments
// ─────────────────────────────────────────────────────────────

export const instruments = sqliteTable('instruments', {
  symbol: text('symbol').primaryKey(),
  displayName: text('display_name'),
  assetClass: text('asset_class', {
    enum: ['FOREX', 'METAL', 'INDEX', 'CRYPTO', 'OTHER'],
  })
    .notNull()
    .default('FOREX'),
  baseCurrency: text('base_currency'),
  quoteCurrency: text('quote_currency'),
  pipSize: real('pip_size').notNull(),
  contractSize: real('contract_size').notNull().default(100000),
  digits: integer('digits').notNull().default(5),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});

// ─────────────────────────────────────────────────────────────
// Trades
// ─────────────────────────────────────────────────────────────

export const trades = sqliteTable(
  'trades',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    symbol: text('symbol')
      .notNull()
      .references(() => instruments.symbol),
    direction: text('direction', { enum: ['LONG', 'SHORT'] }).notNull(),
    status: text('status', { enum: ['OPEN', 'PARTIAL', 'CLOSED', 'CANCELLED'] })
      .notNull()
      .default('OPEN'),

    // Planning
    initialStopPrice: real('initial_stop_price'),
    initialTargetPrice: real('initial_target_price'),
    plannedRr: real('planned_rr'),
    plannedRiskAmount: real('planned_risk_amount'),
    plannedRiskPct: real('planned_risk_pct'),

    // Qualitative context
    methodologyId: text('methodology_id').references(() => methodologies.id),
    setupName: text('setup_name'),
    session: text('session'),
    marketCondition: text('market_condition', {
      enum: ['TRENDING', 'RANGING', 'NEWS_VOLATILITY'],
    }),
    entryModel: text('entry_model', {
      enum: ['LIMIT', 'MARKET', 'STOP_ENTRY', 'ON_RETEST'],
    }),
    confidence: integer('confidence'),
    preTradeEmotion: text('pre_trade_emotion', {
      enum: ['CALM', 'NEUTRAL', 'ANXIOUS', 'EXCITED', 'FRUSTRATED', 'TIRED'],
    }),
    postTradeEmotion: text('post_trade_emotion', {
      enum: ['SATISFIED', 'RELIEVED', 'DISAPPOINTED', 'FRUSTRATED', 'INDIFFERENT'],
    }),

    // Timing
    openedAtUtc: text('opened_at_utc'),
    closedAtUtc: text('closed_at_utc'),

    // Computed money fields (recomputed by lib/pnl.ts on every leg change)
    netPnl: real('net_pnl'),
    netPips: real('net_pips'),
    rMultiple: real('r_multiple'),
    totalCommission: real('total_commission').notNull().default(0),
    totalSwap: real('total_swap').notNull().default(0),
    weightedAvgEntry: real('weighted_avg_entry'),
    weightedAvgExit: real('weighted_avg_exit'),
    totalEntryVolume: real('total_entry_volume').notNull().default(0),
    totalExitVolume: real('total_exit_volume').notNull().default(0),

    // Source / dedupe
    externalTicket: text('external_ticket'),
    externalPositionId: text('external_position_id'),
    source: text('source', {
      enum: ['MANUAL', 'MT4_HTML', 'MT5_HTML', 'CSV', 'LIVE_BRIDGE', 'HOTKEY'],
    })
      .notNull()
      .default('MANUAL'),

    // Soft delete + sample
    deletedAtUtc: text('deleted_at_utc'),
    isSample: integer('is_sample', { mode: 'boolean' }).notNull().default(false),

    createdAtUtc: text('created_at_utc').notNull(),
    updatedAtUtc: text('updated_at_utc').notNull(),
  },
  (t) => ({
    // T4-4: Explicit single-column account index for blotter-load queries.
    accountIdx: index('idx_trades_account').on(t.accountId),
    accountStatusIdx: index('idx_trades_account_status').on(t.accountId, t.status),
    symbolIdx: index('idx_trades_symbol').on(t.symbol),
    openedIdx: index('idx_trades_opened').on(t.openedAtUtc),
    closedIdx: index('idx_trades_closed').on(t.closedAtUtc),
    deletedIdx: index('idx_trades_deleted').on(t.deletedAtUtc),
    sampleIdx: index('idx_trades_sample').on(t.isSample),
    setupIdx: index('idx_trades_setup').on(t.setupName),
    // T1-4: Deduplication unique indexes are PARTIAL (WHERE deleted_at_utc IS NULL
    // AND external_ticket/position_id IS NOT NULL) so that a soft-deleted trade
    // never blocks re-import of the same ticket. Drizzle does not support partial
    // indexes in the table builder — they are applied as raw SQL in the migration
    // runner (see schema.sql: uq_trades_ticket, uq_trades_position).
  }),
);

// ─────────────────────────────────────────────────────────────
// Trade legs
// ─────────────────────────────────────────────────────────────

export const tradeLegs = sqliteTable(
  'trade_legs',
  {
    id: text('id').primaryKey(),
    tradeId: text('trade_id')
      .notNull()
      .references(() => trades.id, { onDelete: 'cascade' }),
    legType: text('leg_type', { enum: ['ENTRY', 'EXIT'] }).notNull(),
    timestampUtc: text('timestamp_utc').notNull(),
    price: real('price').notNull(),
    volumeLots: real('volume_lots').notNull(),
    commission: real('commission').notNull().default(0),
    swap: real('swap').notNull().default(0),
    brokerProfit: real('broker_profit'),
    externalDealId: text('external_deal_id'),
    notes: text('notes'),
    createdAtUtc: text('created_at_utc').notNull(),
  },
  (t) => ({
    tradeIdx: index('idx_legs_trade').on(t.tradeId),
    timeIdx: index('idx_legs_time').on(t.timestampUtc),
  }),
);

// ─────────────────────────────────────────────────────────────
// Screenshots
// ─────────────────────────────────────────────────────────────

export const screenshots = sqliteTable(
  'screenshots',
  {
    id: text('id').primaryKey(),
    tradeId: text('trade_id')
      .notNull()
      .references(() => trades.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['ENTRY', 'EXIT', 'ANNOTATED', 'OTHER'] })
      .notNull()
      .default('ENTRY'),
    filePath: text('file_path').notNull(),
    caption: text('caption'),
    widthPx: integer('width_px'),
    heightPx: integer('height_px'),
    byteSize: integer('byte_size'),
    createdAtUtc: text('created_at_utc').notNull(),
  },
  (t) => ({
    tradeIdx: index('idx_screenshots_trade').on(t.tradeId),
  }),
);

// ─────────────────────────────────────────────────────────────
// Trade notes (timeline)
// ─────────────────────────────────────────────────────────────

export const tradeNotes = sqliteTable(
  'trade_notes',
  {
    id: text('id').primaryKey(),
    tradeId: text('trade_id')
      .notNull()
      .references(() => trades.id, { onDelete: 'cascade' }),
    bodyMd: text('body_md').notNull(),
    createdAtUtc: text('created_at_utc').notNull(),
    updatedAtUtc: text('updated_at_utc').notNull(),
    deletedAtUtc: text('deleted_at_utc'),
  },
  (t) => ({
    tradeIdx: index('idx_notes_trade').on(t.tradeId),
    timeIdx: index('idx_notes_time').on(t.createdAtUtc),
  }),
);

// ─────────────────────────────────────────────────────────────
// Tags
// ─────────────────────────────────────────────────────────────

export const tags = sqliteTable(
  'tags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    category: text('category', { enum: ['CONFLUENCE', 'MISTAKE', 'CUSTOM'] }).notNull(),
    color: text('color'),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => ({
    uniqueNameCategory: uniqueIndex('uq_tags_name_category').on(t.name, t.category),
  }),
);

export const tradeTags = sqliteTable(
  'trade_tags',
  {
    tradeId: text('trade_id')
      .notNull()
      .references(() => trades.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    createdAtUtc: text('created_at_utc').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tradeId, t.tagId] }),
  }),
);

// ─────────────────────────────────────────────────────────────
// Setups (autocomplete list)
// ─────────────────────────────────────────────────────────────

export const setups = sqliteTable('setups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  description: text('description'),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});

// ─────────────────────────────────────────────────────────────
// Methodologies (user-defined trading methodologies / tags)
// ─────────────────────────────────────────────────────────────
export const methodologies = sqliteTable('methodologies', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAtUtc: text('created_at_utc').notNull(),
  updatedAtUtc: text('updated_at_utc').notNull(),
});

// ─────────────────────────────────────────────────────────────
// Prop firm presets
// ─────────────────────────────────────────────────────────────
export const propFirmPresets = sqliteTable('prop_firm_presets', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  maxDrawdownPct: real('max_drawdown_pct'),
  maxDailyLossPct: real('max_daily_loss_pct'),
  maxDrawdownAmount: real('max_drawdown_amount'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAtUtc: text('created_at_utc').notNull(),
  updatedAtUtc: text('updated_at_utc').notNull(),
});

// ─────────────────────────────────────────────────────────────
// Balance snapshots
// ─────────────────────────────────────────────────────────────

export const balanceSnapshots = sqliteTable(
  'balance_snapshots',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    timestampUtc: text('timestamp_utc').notNull(),
    balance: real('balance').notNull(),
    equity: real('equity'),
    source: text('source', {
      enum: ['MANUAL', 'MT4_HTML', 'MT5_HTML', 'CSV', 'LIVE_BRIDGE'],
    })
      .notNull()
      .default('MANUAL'),
    notes: text('notes'),
  },
  (t) => ({
    accountTimeIdx: index('idx_balance_account_time').on(t.accountId, t.timestampUtc),
  }),
);

// ─────────────────────────────────────────────────────────────
// Balance operations (v1.1 — T1.3)
//
// Full ledger of non-trade cash movements. Keeps accounts reconcilable as
// ledgers rather than bare trade-P&L sums. op_type follows MT5 DEAL_TYPE
// plus manual-entry needs.
//
// Sign convention for amount:
//   Positive = credit (DEPOSIT, BONUS, INTEREST, CORRECTION+, CREDIT)
//   Negative = debit  (WITHDRAWAL, CHARGE, COMMISSION, PAYOUT, CORRECTION-)
// ─────────────────────────────────────────────────────────────

export const balanceOperations = sqliteTable(
  'balance_operations',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    opType: text('op_type', {
      enum: [
        'DEPOSIT',
        'WITHDRAWAL',
        'BONUS',
        'CREDIT',
        'CHARGE',
        'CORRECTION',
        'COMMISSION',
        'INTEREST',
        'PAYOUT',
        'OTHER',
      ],
    }).notNull(),
    amount: real('amount').notNull(), // signed: negative = debit (WITHDRAWAL, CHARGE), positive = credit (DEPOSIT, BONUS)
    currency: text('currency').notNull(),
    occurredAtUtc: text('occurred_at_utc').notNull(),
    recordedAtUtc: text('recorded_at_utc').notNull(),
    source: text('source', {
      enum: [
        'MANUAL',
        'BRIDGE',
        'IMPORT',
        'MT4_HTML',
        'MT5_HTML',
        'CSV',
        'BROKER_PDF',
        'RECONCILIATION',
      ],
    }).notNull(),
    externalId: text('external_id'),
    externalTicket: text('external_ticket'),
    relatedTradeId: text('related_trade_id').references(() => trades.id, {
      onDelete: 'set null',
    }),
    note: text('note'),
    tags: text('tags'),
    deletedAtUtc: text('deleted_at_utc'),
    createdAtUtc: text('created_at_utc').notNull(),
    updatedAtUtc: text('updated_at_utc').notNull(),
  },
  (t) => ({
    accountOccurredIdx: index('idx_balance_ops_account_occurred').on(
      t.accountId,
      t.occurredAtUtc,
    ),
    softDeleteIdx: index('idx_balance_ops_soft_delete').on(t.deletedAtUtc),
    typeIdx: index('idx_balance_ops_type').on(t.opType),
    // Partial unique on (account_id, source, external_id) is enforced via raw
    // SQL in the migration — drizzle's uniqueIndex builder cannot emit WHERE.
    // See migration: idx_balance_ops_external.
  }),
);

// ─────────────────────────────────────────────────────────────
// Reviews
// ─────────────────────────────────────────────────────────────

export const reviews = sqliteTable(
  'reviews',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['DAILY', 'WEEKLY'] }).notNull(),
    periodStartUtc: text('period_start_utc').notNull(),
    periodEndUtc: text('period_end_utc').notNull(),
    followedPlan: text('followed_plan', { enum: ['YES', 'NO', 'PARTIAL'] }),
    biggestWin: text('biggest_win'),
    biggestMistake: text('biggest_mistake'),
    improvement: text('improvement'),
    patternWinners: text('pattern_winners'),
    patternLosers: text('pattern_losers'),
    strategyAdjust: text('strategy_adjust'),
    moodScore: integer('mood_score'),
    disciplineScore: integer('discipline_score'),
    energyScore: integer('energy_score'),
    createdAtUtc: text('created_at_utc').notNull(),
    updatedAtUtc: text('updated_at_utc').notNull(),
  },
  (t) => ({
    uniquePeriod: uniqueIndex('uq_reviews_account_kind_period').on(
      t.accountId,
      t.kind,
      t.periodStartUtc,
    ),
  }),
);

// ─────────────────────────────────────────────────────────────
// News events
// ─────────────────────────────────────────────────────────────

export const newsEvents = sqliteTable(
  'news_events',
  {
    id: text('id').primaryKey(),
    timestampUtc: text('timestamp_utc').notNull(),
    currency: text('currency').notNull(),
    impact: text('impact', { enum: ['LOW', 'MEDIUM', 'HIGH', 'HOLIDAY'] }).notNull(),
    title: text('title').notNull(),
    forecast: text('forecast'),
    previous: text('previous'),
    actual: text('actual'),
    source: text('source').notNull().default('FOREXFACTORY_CSV'),
    importedAtUtc: text('imported_at_utc').notNull(),
  },
  (t) => ({
    timeIdx: index('idx_news_time').on(t.timestampUtc),
    currencyIdx: index('idx_news_currency').on(t.currency),
    impactIdx: index('idx_news_impact').on(t.impact),
    uniqueEvent: uniqueIndex('uq_news_event').on(t.timestampUtc, t.currency, t.title),
  }),
);

export const tradeNewsEvents = sqliteTable(
  'trade_news_events',
  {
    tradeId: text('trade_id')
      .notNull()
      .references(() => trades.id, { onDelete: 'cascade' }),
    newsEventId: text('news_event_id')
      .notNull()
      .references(() => newsEvents.id, { onDelete: 'cascade' }),
    minutesOffset: integer('minutes_offset').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tradeId, t.newsEventId] }),
  }),
);

// ─────────────────────────────────────────────────────────────
// Audit log
// ─────────────────────────────────────────────────────────────

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    entityType: text('entity_type', {
      enum: [
        'TRADE',
        'LEG',
        'SCREENSHOT',
        'NOTE',
        'TAG_LINK',
        'TRADE_TAGS',
        'REVIEW',
        'ACCOUNT',
        'BALANCE_OP',
      ],
    }).notNull(),
    entityId: text('entity_id').notNull(),
    tradeId: text('trade_id').references(() => trades.id, { onDelete: 'set null' }),
    action: text('action', {
      enum: [
        'CREATE',
        'UPDATE',
        'DELETE',
        'RESTORE',
        'MERGE',
        'BULK_UPDATE',
        'HARD_DELETE',
        'BALANCE_OP_CREATE',
        'BALANCE_OP_UPDATE',
        'BALANCE_OP_DELETE',
        'BALANCE_OP_RESTORE',
      ],
    }).notNull(),
    changedFields: text('changed_fields'),
    actor: text('actor').notNull().default('user'),
    timestampUtc: text('timestamp_utc').notNull(),
  },
  (t) => ({
    tradeIdx: index('idx_audit_trade').on(t.tradeId),
    timeIdx: index('idx_audit_time').on(t.timestampUtc),
    entityIdx: index('idx_audit_entity').on(t.entityType, t.entityId),
  }),
);

// ─────────────────────────────────────────────────────────────
// Import runs
// ─────────────────────────────────────────────────────────────

export const importRuns = sqliteTable(
  'import_runs',
  {
    id: text('id').primaryKey(),
    source: text('source').notNull(),
    sourceFilename: text('source_filename').notNull(),
    storedPath: text('stored_path').notNull(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    rowsTotal: integer('rows_total').notNull(),
    rowsImported: integer('rows_imported').notNull(),
    rowsDuplicate: integer('rows_duplicate').notNull(),
    rowsMerged: integer('rows_merged').notNull().default(0),
    rowsFailed: integer('rows_failed').notNull(),
    failedReport: text('failed_report'),
    createdAtUtc: text('created_at_utc').notNull(),
  },
  (t) => ({
    accountTimeIdx: index('idx_import_runs_account').on(t.accountId, t.createdAtUtc),
  }),
);

// ─────────────────────────────────────────────────────────────
// Bridge files
// ─────────────────────────────────────────────────────────────

export const bridgeFiles = sqliteTable('bridge_files', {
  filename: text('filename').primaryKey(),
  status: text('status', { enum: ['PROCESSED', 'FAILED', 'SKIPPED'] }).notNull(),
  accountId: text('account_id').references(() => accounts.id),
  tradeId: text('trade_id').references(() => trades.id),
  errorMessage: text('error_message'),
  processedAtUtc: text('processed_at_utc').notNull(),
});

// ─────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// Note: trades_fts (FTS5 virtual table) is created via raw SQL in the
// migration runner — drizzle does not yet model FTS5 tables.

// ─────────────────────────────────────────────────────────────
// Inferred types — use these everywhere instead of hand-writing types
// ─────────────────────────────────────────────────────────────

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Instrument = typeof instruments.$inferSelect;
export type Trade = typeof trades.$inferSelect;
export type NewTrade = typeof trades.$inferInsert;
export type TradeLeg = typeof tradeLegs.$inferSelect;
export type NewTradeLeg = typeof tradeLegs.$inferInsert;
export type Screenshot = typeof screenshots.$inferSelect;
export type TradeNote = typeof tradeNotes.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Setup = typeof setups.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type NewsEvent = typeof newsEvents.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type ImportRun = typeof importRuns.$inferSelect;
export type BalanceOperation = typeof balanceOperations.$inferSelect;
export type NewBalanceOperation = typeof balanceOperations.$inferInsert;
export type Methodology = typeof methodologies.$inferSelect;
export type NewMethodology = typeof methodologies.$inferInsert;
export type PropFirmPreset = typeof propFirmPresets.$inferSelect;
export type NewPropFirmPreset = typeof propFirmPresets.$inferInsert;
