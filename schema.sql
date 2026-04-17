-- Ledger Forex Trading Journal — SQLite schema
-- Source of truth. Mirrored in src/lib/db/schema.ts via drizzle.
-- All timestamps stored as UTC ISO-8601 strings.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA recursive_triggers = ON;

-- ─────────────────────────────────────────────────────────────
-- Accounts — multi-account from launch one.
-- For account_type='PROP', the prop_* columns describe the rule set.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE accounts (
  id                       TEXT PRIMARY KEY,
  name                     TEXT NOT NULL UNIQUE,
  broker                   TEXT,
  account_currency         TEXT NOT NULL DEFAULT 'USD',
  initial_balance          REAL NOT NULL DEFAULT 0,
  account_type             TEXT NOT NULL DEFAULT 'LIVE'
                           CHECK(account_type IN ('LIVE','DEMO','PROP')),
  display_color            TEXT NOT NULL DEFAULT '#3b82f6',
  is_active                INTEGER NOT NULL DEFAULT 1,
  opened_at_utc            TEXT,

  -- Prop firm rule fields (only meaningful when account_type='PROP')
  prop_daily_loss_limit    REAL,        -- in account currency
  prop_daily_loss_pct      REAL,        -- alternative: percentage of starting balance
  prop_max_drawdown        REAL,        -- in account currency
  prop_max_drawdown_pct    REAL,        -- alternative: percentage
  prop_drawdown_type       TEXT CHECK(prop_drawdown_type IN ('STATIC','TRAILING')),
  prop_profit_target       REAL,
  prop_profit_target_pct   REAL,
  prop_phase               TEXT CHECK(prop_phase IN ('PHASE_1','PHASE_2','FUNDED','VERIFIED')),

  created_at_utc           TEXT NOT NULL,
  updated_at_utc           TEXT NOT NULL
);

CREATE INDEX idx_accounts_active ON accounts(is_active);

-- ─────────────────────────────────────────────────────────────
-- Instruments — per-symbol metadata for correct pip math.
-- JPY pairs use pip_size 0.01, XAUUSD uses 0.1, XAGUSD uses 0.001.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE instruments (
  symbol           TEXT PRIMARY KEY,
  display_name     TEXT,
  asset_class      TEXT NOT NULL DEFAULT 'FOREX'
                   CHECK(asset_class IN ('FOREX','METAL','INDEX','CRYPTO','OTHER')),
  base_currency    TEXT,
  quote_currency   TEXT,
  pip_size         REAL NOT NULL,
  contract_size    REAL NOT NULL DEFAULT 100000,
  digits           INTEGER NOT NULL DEFAULT 5,
  is_active        INTEGER NOT NULL DEFAULT 1
);

-- ─────────────────────────────────────────────────────────────
-- Trades — position-level "trade idea".
-- Multiple ENTRY legs allowed (scaling in).
-- Multiple EXIT legs allowed (partials).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE trades (
  id                       TEXT PRIMARY KEY,
  account_id               TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  symbol                   TEXT NOT NULL REFERENCES instruments(symbol),
  direction                TEXT NOT NULL CHECK(direction IN ('LONG','SHORT')),
  status                   TEXT NOT NULL DEFAULT 'OPEN'
                           CHECK(status IN ('OPEN','PARTIAL','CLOSED','CANCELLED')),

  -- Planning (initial_stop_price stored explicitly so R-multiple is computable)
  initial_stop_price       REAL,
  initial_target_price     REAL,
  planned_rr               REAL,
  planned_risk_amount      REAL,        -- in account currency
  planned_risk_pct         REAL,        -- as % of account at time of entry

  -- Qualitative context
  setup_name               TEXT,
  session                  TEXT,
  market_condition         TEXT CHECK(market_condition IN ('TRENDING','RANGING','NEWS_VOLATILITY')),
  entry_model              TEXT CHECK(entry_model IN ('LIMIT','MARKET','STOP_ENTRY','ON_RETEST')),
  confidence               INTEGER CHECK(confidence BETWEEN 1 AND 5),
  pre_trade_emotion        TEXT CHECK(pre_trade_emotion IN ('CALM','NEUTRAL','ANXIOUS','EXCITED','FRUSTRATED','TIRED')),
  post_trade_emotion       TEXT CHECK(post_trade_emotion IN ('SATISFIED','RELIEVED','DISAPPOINTED','FRUSTRATED','INDIFFERENT')),

  -- Timing
  opened_at_utc            TEXT,        -- earliest ENTRY leg timestamp
  closed_at_utc            TEXT,        -- latest EXIT leg timestamp when fully closed

  -- Computed money fields (recomputed by lib/pnl.ts on every leg change)
  net_pnl                  REAL,
  net_pips                 REAL,
  r_multiple               REAL,
  total_commission         REAL NOT NULL DEFAULT 0,
  total_swap               REAL NOT NULL DEFAULT 0,
  weighted_avg_entry       REAL,
  weighted_avg_exit        REAL,
  total_entry_volume       REAL NOT NULL DEFAULT 0,
  total_exit_volume        REAL NOT NULL DEFAULT 0,

  -- Source / dedupe
  external_ticket          TEXT,        -- MT4 ticket
  external_position_id     TEXT,        -- MT5 position id
  source                   TEXT NOT NULL DEFAULT 'MANUAL'
                           CHECK(source IN ('MANUAL','MT4_HTML','MT5_HTML','CSV','LIVE_BRIDGE','HOTKEY')),

  -- Soft delete + sample flag
  deleted_at_utc           TEXT,
  is_sample                INTEGER NOT NULL DEFAULT 0,

  created_at_utc           TEXT NOT NULL,
  updated_at_utc           TEXT NOT NULL

  -- NOTE: Soft-delete-aware deduplication is handled by partial unique indexes
  -- below (uq_trades_ticket, uq_trades_position). Inline UNIQUE constraints
  -- would block re-importing a deleted trade — partial indexes allow it.
);

-- T4-4: Single-column account index for "all trades for account" queries (blotter load).
-- The compound idx_trades_account_status can satisfy this too (account_id is leading),
-- but an explicit single-column index removes ambiguity and aids the query planner.
CREATE INDEX idx_trades_account        ON trades(account_id);
CREATE INDEX idx_trades_account_status ON trades(account_id, status);
CREATE INDEX idx_trades_symbol         ON trades(symbol);
CREATE INDEX idx_trades_opened         ON trades(opened_at_utc);
CREATE INDEX idx_trades_closed         ON trades(closed_at_utc);
CREATE INDEX idx_trades_deleted        ON trades(deleted_at_utc);
CREATE INDEX idx_trades_sample         ON trades(is_sample);
CREATE INDEX idx_trades_setup          ON trades(setup_name);
-- P-1: Partial composite indexes for blotter query (account + date, non-deleted only).
-- These cover the most common access pattern: "show me all live trades for this account
-- sorted by entry time" without scanning deleted rows.
CREATE INDEX idx_trades_account_opened ON trades(account_id, opened_at_utc DESC)
  WHERE deleted_at_utc IS NULL;
CREATE INDEX idx_trades_account_closed ON trades(account_id, status, closed_at_utc DESC)
  WHERE deleted_at_utc IS NULL;

-- T1-4: Partial unique indexes for deduplication, soft-delete-aware.
-- A deleted trade (deleted_at_utc IS NOT NULL) is excluded from the uniqueness check,
-- allowing the same external ticket to be re-imported after deletion.
-- external_ticket/external_position_id are also excluded when NULL (manual trades).
CREATE UNIQUE INDEX uq_trades_ticket ON trades(account_id, external_ticket)
  WHERE deleted_at_utc IS NULL AND external_ticket IS NOT NULL;
CREATE UNIQUE INDEX uq_trades_position ON trades(account_id, external_position_id)
  WHERE deleted_at_utc IS NULL AND external_position_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- Trade legs — individual fills.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE trade_legs (
  id                  TEXT PRIMARY KEY,
  trade_id            TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  leg_type            TEXT NOT NULL CHECK(leg_type IN ('ENTRY','EXIT')),
  timestamp_utc       TEXT NOT NULL,
  price               REAL NOT NULL,
  volume_lots         REAL NOT NULL,
  commission          REAL NOT NULL DEFAULT 0,
  swap                REAL NOT NULL DEFAULT 0,
  broker_profit       REAL,                          -- if broker supplied per-leg P&L
  external_deal_id    TEXT,
  notes               TEXT,
  created_at_utc      TEXT NOT NULL
);

CREATE INDEX idx_legs_trade ON trade_legs(trade_id);
CREATE INDEX idx_legs_time  ON trade_legs(timestamp_utc);

-- ─────────────────────────────────────────────────────────────
-- Screenshots — multiple per trade. file_path is RELATIVE to data dir.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE screenshots (
  id              TEXT PRIMARY KEY,
  trade_id        TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL DEFAULT 'ENTRY'
                  CHECK(kind IN ('ENTRY','EXIT','ANNOTATED','OTHER')),
  file_path       TEXT NOT NULL,
  caption         TEXT,
  width_px        INTEGER,
  height_px       INTEGER,
  byte_size       INTEGER,
  created_at_utc  TEXT NOT NULL
);

CREATE INDEX idx_screenshots_trade ON screenshots(trade_id);

-- ─────────────────────────────────────────────────────────────
-- Trade notes — TIMELINE of timestamped reflections.
-- Multiple notes per trade, never silently overwritten.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE trade_notes (
  id              TEXT PRIMARY KEY,
  trade_id        TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  body_md         TEXT NOT NULL,
  created_at_utc  TEXT NOT NULL,
  updated_at_utc  TEXT NOT NULL,
  deleted_at_utc  TEXT
);

CREATE INDEX idx_notes_trade ON trade_notes(trade_id);
CREATE INDEX idx_notes_time  ON trade_notes(created_at_utc);

-- ─────────────────────────────────────────────────────────────
-- Tags — categorized (CONFLUENCE / MISTAKE / CUSTOM).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE tags (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL CHECK(category IN ('CONFLUENCE','MISTAKE','CUSTOM')),
  color       TEXT,
  is_default  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  UNIQUE(name, category)
);

CREATE TABLE trade_tags (
  trade_id        TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  tag_id          INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at_utc  TEXT NOT NULL,
  PRIMARY KEY (trade_id, tag_id)
);

-- ─────────────────────────────────────────────────────────────
-- Setups — autocomplete list for setup_name field.
-- The trade row stores setup_name as text; this table populates suggestions.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE setups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT UNIQUE NOT NULL,
  description TEXT,
  is_default  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1
);

-- ─────────────────────────────────────────────────────────────
-- Balance snapshots — periodic equity points per account.
-- Populated by statement imports (MT5 statements include them) and manual.
-- Used for accurate equity-curve and drawdown reconstruction.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE balance_snapshots (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  timestamp_utc   TEXT NOT NULL,
  balance         REAL NOT NULL,
  equity          REAL,
  source          TEXT NOT NULL DEFAULT 'MANUAL'
                  CHECK(source IN ('MANUAL','MT4_HTML','MT5_HTML','CSV','LIVE_BRIDGE')),
  notes           TEXT
);

CREATE INDEX idx_balance_account_time ON balance_snapshots(account_id, timestamp_utc);

-- ─────────────────────────────────────────────────────────────
-- Reviews — daily and weekly guided post-market reflections.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE reviews (
  id                  TEXT PRIMARY KEY,
  account_id          TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind                TEXT NOT NULL CHECK(kind IN ('DAILY','WEEKLY')),
  period_start_utc    TEXT NOT NULL,
  period_end_utc      TEXT NOT NULL,
  followed_plan       TEXT CHECK(followed_plan IN ('YES','NO','PARTIAL')),
  biggest_win         TEXT,
  biggest_mistake     TEXT,
  improvement         TEXT,
  pattern_winners     TEXT,
  pattern_losers      TEXT,
  strategy_adjust     TEXT,
  mood_score          INTEGER CHECK(mood_score BETWEEN 1 AND 5),
  discipline_score    INTEGER CHECK(discipline_score BETWEEN 1 AND 5),
  energy_score        INTEGER CHECK(energy_score BETWEEN 1 AND 5),
  created_at_utc      TEXT NOT NULL,
  updated_at_utc      TEXT NOT NULL,
  UNIQUE(account_id, kind, period_start_utc)
);

CREATE INDEX idx_reviews_account_period ON reviews(account_id, kind, period_start_utc);

-- ─────────────────────────────────────────────────────────────
-- News events — imported from ForexFactory CSV (manually, no network call).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE news_events (
  id              TEXT PRIMARY KEY,
  timestamp_utc   TEXT NOT NULL,
  currency        TEXT NOT NULL,
  impact          TEXT NOT NULL CHECK(impact IN ('LOW','MEDIUM','HIGH','HOLIDAY')),
  title           TEXT NOT NULL,
  forecast        TEXT,
  previous        TEXT,
  actual          TEXT,
  source          TEXT NOT NULL DEFAULT 'FOREXFACTORY_CSV',
  imported_at_utc TEXT NOT NULL,
  UNIQUE(timestamp_utc, currency, title)
);

CREATE INDEX idx_news_time     ON news_events(timestamp_utc);
CREATE INDEX idx_news_currency ON news_events(currency);
CREATE INDEX idx_news_impact   ON news_events(impact);

-- ─────────────────────────────────────────────────────────────
-- Trade ↔ news event join (computed by re-tag job).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE trade_news_events (
  trade_id        TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  news_event_id   TEXT NOT NULL REFERENCES news_events(id) ON DELETE CASCADE,
  minutes_offset  INTEGER NOT NULL,                  -- signed: negative = before entry
  PRIMARY KEY (trade_id, news_event_id)
);

CREATE INDEX idx_tne_trade ON trade_news_events(trade_id);

-- ─────────────────────────────────────────────────────────────
-- Audit log — every change to every trade/leg/tag/note/screenshot.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE audit_log (
  id              TEXT PRIMARY KEY,
  entity_type     TEXT NOT NULL CHECK(entity_type IN
                  ('TRADE','LEG','SCREENSHOT','NOTE','TAG_LINK','TRADE_TAGS','REVIEW','ACCOUNT')),
  entity_id       TEXT NOT NULL,
  trade_id        TEXT REFERENCES trades(id) ON DELETE SET NULL,  -- denormalized; SET NULL preserves history after hard-delete
  action          TEXT NOT NULL CHECK(action IN
                  ('CREATE','UPDATE','DELETE','RESTORE','MERGE','BULK_UPDATE','HARD_DELETE')),
  changed_fields  TEXT,                              -- JSON: { field: [old, new] }
  actor           TEXT NOT NULL DEFAULT 'user',
  timestamp_utc   TEXT NOT NULL
);

CREATE INDEX idx_audit_trade ON audit_log(trade_id);
CREATE INDEX idx_audit_time  ON audit_log(timestamp_utc);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);

-- ─────────────────────────────────────────────────────────────
-- Import audit log.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE import_runs (
  id              TEXT PRIMARY KEY,
  source          TEXT NOT NULL,                      -- MT4_HTML / MT5_HTML / CSV
  source_filename TEXT NOT NULL,
  stored_path     TEXT NOT NULL,                      -- copy in /imports/
  account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  rows_total      INTEGER NOT NULL,
  rows_imported   INTEGER NOT NULL,
  rows_duplicate  INTEGER NOT NULL,
  rows_merged     INTEGER NOT NULL DEFAULT 0,
  rows_failed     INTEGER NOT NULL,
  failed_report   TEXT,                               -- JSON [{rowIndex, reason, rawRow}]
  created_at_utc  TEXT NOT NULL
);

CREATE INDEX idx_import_runs_account ON import_runs(account_id, created_at_utc);

-- ─────────────────────────────────────────────────────────────
-- Bridge sync state — track files seen by the live MT4/5 watcher.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE bridge_files (
  filename        TEXT PRIMARY KEY,
  status          TEXT NOT NULL CHECK(status IN ('PROCESSED','FAILED','SKIPPED')),
  account_id      TEXT REFERENCES accounts(id),
  trade_id        TEXT REFERENCES trades(id),
  error_message   TEXT,
  processed_at_utc TEXT NOT NULL
);

-- ─────────────────────────────────────────────────────────────
-- Settings (key/value).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ─────────────────────────────────────────────────────────────
-- Full-text search across notes + setup names + tag names.
-- Maintained by app-level inserts in the IPC trades layer.
-- ─────────────────────────────────────────────────────────────
CREATE VIRTUAL TABLE trades_fts USING fts5(
  trade_id UNINDEXED,
  setup_name,
  notes,
  tags,
  symbol,
  tokenize = 'porter unicode61'
);
