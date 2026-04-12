# Ledger — Complete Database Schema

> **Engine:** SQLite 3.x (WAL mode)  
> **ORM:** Drizzle ORM (TypeScript type generation)  
> **Source of truth:** `schema.sql` (bundled as extraResource in installer)  
> **Migrations:** `drizzle/` folder, versioned via `PRAGMA user_version`  
> **All timestamps:** UTC ISO-8601 strings (e.g., `"2024-01-15T14:30:00.000Z"`)  
> **Foreign keys:** Enforced at DB level (`PRAGMA foreign_keys = ON`)

---

## Pragmas (Set on Every Connection Open)

```sql
PRAGMA journal_mode = WAL;       -- Write-Ahead Logging for concurrent reads
PRAGMA foreign_keys = ON;        -- Enforce CASCADE, RESTRICT, SET NULL
PRAGMA recursive_triggers = ON;  -- Allow triggers to call other triggers
```

---

## Table Summary

| Table | Purpose | Rows (typical) |
|---|---|---|
| `accounts` | Trading accounts (live, demo, prop) | 1–10 |
| `instruments` | Symbol pip/contract spec | 80–200 |
| `trades` | One row per position/trade idea | 100s–10,000s |
| `trade_legs` | Individual fills (entry/exit) | 2–10 per trade |
| `screenshots` | Chart images attached to trades | 0–5 per trade |
| `trade_notes` | Timestamped markdown reflections | 0–∞ per trade |
| `tags` | Labels: confluence, mistake, custom | 10–50 |
| `trade_tags` | Many-to-many: trade ↔ tag | varies |
| `setups` | Autocomplete list for setup_name | 5–20 |
| `balance_snapshots` | Equity points for curve accuracy | varies |
| `reviews` | Daily/weekly journal entries | 5–365 per year |
| `news_events` | ForexFactory economic calendar | 1,000s |
| `trade_news_events` | Trade ↔ news event proximity links | varies |
| `audit_log` | Full change history for all trades | 5–50 per trade |
| `import_runs` | Statement import audit records | 1 per import |
| `bridge_files` | Live bridge file processing log | 1 per file |
| `settings` | App key/value configuration | < 20 |
| `trades_fts` | FTS5 virtual table for full-text search | mirrors trades |

---

## Table Definitions

### `accounts`

Stores trading account configurations. One account = one equity curve.

```sql
CREATE TABLE accounts (
  id                       TEXT PRIMARY KEY,           -- nanoid()
  name                     TEXT NOT NULL UNIQUE,       -- "My FTMO Account"
  broker                   TEXT,                       -- "FTMO", "IC Markets"
  account_currency         TEXT NOT NULL DEFAULT 'USD',
  initial_balance          REAL NOT NULL DEFAULT 0,    -- starting balance for drawdown calc
  account_type             TEXT NOT NULL DEFAULT 'LIVE'
                           CHECK(account_type IN ('LIVE','DEMO','PROP')),
  display_color            TEXT NOT NULL DEFAULT '#3b82f6',  -- hex, used in charts

  -- Prop firm rule fields (only used when account_type = 'PROP')
  prop_daily_loss_limit    REAL,     -- in account currency
  prop_daily_loss_pct      REAL,     -- OR as % of initial_balance
  prop_max_drawdown        REAL,     -- in account currency
  prop_max_drawdown_pct    REAL,     -- OR as % of initial_balance
  prop_drawdown_type       TEXT CHECK(prop_drawdown_type IN ('STATIC','TRAILING')),
  prop_profit_target       REAL,
  prop_profit_target_pct   REAL,
  prop_phase               TEXT CHECK(prop_phase IN ('PHASE_1','PHASE_2','FUNDED','VERIFIED')),

  is_active                INTEGER NOT NULL DEFAULT 1,
  opened_at_utc            TEXT,
  created_at_utc           TEXT NOT NULL,
  updated_at_utc           TEXT NOT NULL
);

CREATE INDEX idx_accounts_active ON accounts(is_active);
```

---

### `instruments`

Per-symbol specification required for correct pip and P&L math.

```sql
CREATE TABLE instruments (
  symbol           TEXT PRIMARY KEY,              -- "EURUSD", "XAUUSD", "US30"
  display_name     TEXT,                          -- "Euro / US Dollar"
  asset_class      TEXT NOT NULL DEFAULT 'FOREX'
                   CHECK(asset_class IN ('FOREX','METAL','INDEX','CRYPTO','OTHER')),
  base_currency    TEXT,                          -- "EUR"
  quote_currency   TEXT,                          -- "USD"
  pip_size         REAL NOT NULL,                 -- 0.0001 for EURUSD, 0.01 for USDJPY
  contract_size    REAL NOT NULL DEFAULT 100000,  -- 100000 for standard FX, 1 for CFDs
  digits           INTEGER NOT NULL DEFAULT 5,    -- decimal places in broker quotes
  is_active        INTEGER NOT NULL DEFAULT 1
);
```

**Important pip_size values:**

| Symbol | pip_size | contract_size |
|---|---|---|
| All major/minor FX (non-JPY) | 0.0001 | 100000 |
| JPY pairs (USDJPY, GBPJPY, etc.) | 0.01 | 100000 |
| XAUUSD (Gold) | 0.1 | 100 |
| XAGUSD (Silver) | 0.001 | 5000 |
| US indices (US30, NAS100) | 1.0 | 1 |

---

### `trades`

The central table. One row per "trade idea" (a position opened and closed).

```sql
CREATE TABLE trades (
  id                       TEXT PRIMARY KEY,    -- nanoid()
  account_id               TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  symbol                   TEXT NOT NULL REFERENCES instruments(symbol),
  direction                TEXT NOT NULL CHECK(direction IN ('LONG','SHORT')),
  status                   TEXT NOT NULL DEFAULT 'OPEN'
                           CHECK(status IN ('OPEN','PARTIAL','CLOSED','CANCELLED')),

  -- Planning
  initial_stop_price       REAL,               -- price level, not pip distance
  initial_target_price     REAL,
  planned_rr               REAL,               -- planned reward:risk ratio
  planned_risk_amount      REAL,               -- $ amount risked
  planned_risk_pct         REAL,               -- % of account balance risked

  -- Qualitative context (trader's pre/post-trade annotations)
  setup_name               TEXT,               -- "London Breakout", "OB Retest"
  session                  TEXT,               -- LONDON, NEW_YORK, ASIA, OVERLAP, OFF_HOURS
  market_condition         TEXT CHECK(market_condition IN ('TRENDING','RANGING','NEWS_VOLATILITY')),
  entry_model              TEXT CHECK(entry_model IN ('LIMIT','MARKET','STOP_ENTRY','ON_RETEST')),
  confidence               INTEGER CHECK(confidence BETWEEN 1 AND 5),
  pre_trade_emotion        TEXT CHECK(pre_trade_emotion IN ('CALM','NEUTRAL','ANXIOUS','EXCITED','FRUSTRATED','TIRED')),
  post_trade_emotion       TEXT CHECK(post_trade_emotion IN ('SATISFIED','RELIEVED','DISAPPOINTED','FRUSTRATED','INDIFFERENT')),

  -- Timing (derived from leg timestamps, recomputed on every leg change)
  opened_at_utc            TEXT,               -- earliest ENTRY leg timestamp
  closed_at_utc            TEXT,               -- latest EXIT leg timestamp (CLOSED only)

  -- Computed money fields — recomputed by lib/pnl.ts, never edited directly
  net_pnl                  REAL,               -- in account currency
  net_pips                 REAL,               -- net pips moved
  r_multiple               REAL,               -- net_pips / initial_risk_pips
  total_commission         REAL NOT NULL DEFAULT 0,
  total_swap               REAL NOT NULL DEFAULT 0,
  weighted_avg_entry       REAL,               -- VWAP of entry legs
  weighted_avg_exit        REAL,               -- VWAP of exit legs
  total_entry_volume       REAL NOT NULL DEFAULT 0,  -- lots
  total_exit_volume        REAL NOT NULL DEFAULT 0,  -- lots

  -- Source tracking & deduplication
  external_ticket          TEXT,               -- MT4 ticket number
  external_position_id     TEXT,               -- MT5 position ID
  source                   TEXT NOT NULL DEFAULT 'MANUAL'
                           CHECK(source IN ('MANUAL','MT4_HTML','MT5_HTML','CSV','LIVE_BRIDGE','HOTKEY')),

  -- Soft delete & sample data flag
  deleted_at_utc           TEXT,               -- NULL = live, non-NULL = in Trash
  is_sample                INTEGER NOT NULL DEFAULT 0,  -- 1 = seed/demo data

  created_at_utc           TEXT NOT NULL,
  updated_at_utc           TEXT NOT NULL
);
```

**Indexes:**

```sql
-- Basic column indexes
CREATE INDEX idx_trades_account        ON trades(account_id);
CREATE INDEX idx_trades_account_status ON trades(account_id, status);
CREATE INDEX idx_trades_symbol         ON trades(symbol);
CREATE INDEX idx_trades_opened         ON trades(opened_at_utc);
CREATE INDEX idx_trades_closed         ON trades(closed_at_utc);
CREATE INDEX idx_trades_deleted        ON trades(deleted_at_utc);
CREATE INDEX idx_trades_sample         ON trades(is_sample);
CREATE INDEX idx_trades_setup          ON trades(setup_name);

-- Partial composite indexes for the blotter (non-deleted rows only)
CREATE INDEX idx_trades_account_opened ON trades(account_id, opened_at_utc DESC)
  WHERE deleted_at_utc IS NULL;
CREATE INDEX idx_trades_account_closed ON trades(account_id, status, closed_at_utc DESC)
  WHERE deleted_at_utc IS NULL;

-- Soft-delete-aware deduplication (allows re-import after delete)
CREATE UNIQUE INDEX uq_trades_ticket ON trades(account_id, external_ticket)
  WHERE deleted_at_utc IS NULL AND external_ticket IS NOT NULL;
CREATE UNIQUE INDEX uq_trades_position ON trades(account_id, external_position_id)
  WHERE deleted_at_utc IS NULL AND external_position_id IS NOT NULL;
```

---

### `trade_legs`

Individual fills (entry or exit). Multiple legs per trade enable scaling in/out.

```sql
CREATE TABLE trade_legs (
  id               TEXT PRIMARY KEY,
  trade_id         TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  leg_type         TEXT NOT NULL CHECK(leg_type IN ('ENTRY','EXIT')),
  timestamp_utc    TEXT NOT NULL,
  price            REAL NOT NULL,
  volume_lots      REAL NOT NULL,
  commission       REAL NOT NULL DEFAULT 0,
  swap             REAL NOT NULL DEFAULT 0,
  broker_profit    REAL,               -- MT5 deal-level P&L from broker (EXIT legs only)
  external_deal_id TEXT,               -- MT5 deal ID for deduplication
  notes            TEXT,
  created_at_utc   TEXT NOT NULL
);

CREATE INDEX idx_legs_trade ON trade_legs(trade_id);
CREATE INDEX idx_legs_time  ON trade_legs(timestamp_utc);
```

---

### `screenshots`

Chart images stored as WebP files. Paths are relative to `data_dir`.

```sql
CREATE TABLE screenshots (
  id              TEXT PRIMARY KEY,
  trade_id        TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL DEFAULT 'ENTRY'
                  CHECK(kind IN ('ENTRY','EXIT','ANNOTATED','OTHER')),
  file_path       TEXT NOT NULL,    -- relative path: "screenshots/<trade_id>/<uuid>.webp"
  caption         TEXT,             -- max 500 chars
  width_px        INTEGER,
  height_px       INTEGER,
  byte_size       INTEGER,
  created_at_utc  TEXT NOT NULL
);

CREATE INDEX idx_screenshots_trade ON screenshots(trade_id);
```

---

### `trade_notes`

Timestamped markdown notes. Notes are never silently overwritten — append-only from the UI.

```sql
CREATE TABLE trade_notes (
  id              TEXT PRIMARY KEY,
  trade_id        TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  body_md         TEXT NOT NULL,    -- Markdown text
  created_at_utc  TEXT NOT NULL,
  updated_at_utc  TEXT NOT NULL,
  deleted_at_utc  TEXT              -- Soft-deletable
);

CREATE INDEX idx_notes_trade ON trade_notes(trade_id);
CREATE INDEX idx_notes_time  ON trade_notes(created_at_utc);
```

---

### `tags` and `trade_tags`

Flexible labeling system with 3 categories.

```sql
CREATE TABLE tags (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL CHECK(category IN ('CONFLUENCE','MISTAKE','CUSTOM')),
  color       TEXT,               -- hex color for badge
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
```

---

### `setups`

Autocomplete values for the `setup_name` field.

```sql
CREATE TABLE setups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT UNIQUE NOT NULL,       -- "London Breakout", "Order Block Retest"
  description TEXT,
  is_default  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1
);
```

---

### `balance_snapshots`

Periodic equity readings used to anchor the equity curve when trades don't cover the full account history.

```sql
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
```

---

### `reviews`

Guided daily and weekly journal entries.

```sql
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
```

---

### `news_events`

ForexFactory economic calendar events, imported via CSV.

```sql
CREATE TABLE news_events (
  id              TEXT PRIMARY KEY,
  timestamp_utc   TEXT NOT NULL,
  currency        TEXT NOT NULL,          -- "USD", "EUR", "GBP"
  impact          TEXT NOT NULL CHECK(impact IN ('LOW','MEDIUM','HIGH','HOLIDAY')),
  title           TEXT NOT NULL,          -- "Non-Farm Payrolls"
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
```

---

### `trade_news_events`

Links trades to news events within ±30 minutes of trade entry.

```sql
CREATE TABLE trade_news_events (
  trade_id        TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  news_event_id   TEXT NOT NULL REFERENCES news_events(id) ON DELETE CASCADE,
  minutes_offset  INTEGER NOT NULL,   -- signed: -30 = event was 30 min before entry
  PRIMARY KEY (trade_id, news_event_id)
);

CREATE INDEX idx_tne_trade ON trade_news_events(trade_id);
```

---

### `audit_log`

Immutable change log for every trade mutation.

```sql
CREATE TABLE audit_log (
  id              TEXT PRIMARY KEY,
  entity_type     TEXT NOT NULL CHECK(entity_type IN
                  ('TRADE','LEG','SCREENSHOT','NOTE','TAG_LINK','TRADE_TAGS','REVIEW','ACCOUNT')),
  entity_id       TEXT NOT NULL,
  trade_id        TEXT REFERENCES trades(id) ON DELETE CASCADE,  -- denormalized for fast lookup
  action          TEXT NOT NULL CHECK(action IN
                  ('CREATE','UPDATE','DELETE','RESTORE','MERGE','BULK_UPDATE')),
  changed_fields  TEXT,               -- JSON: { "field": [old_value, new_value] }
  actor           TEXT NOT NULL DEFAULT 'user',
  timestamp_utc   TEXT NOT NULL
);

CREATE INDEX idx_audit_trade  ON audit_log(trade_id);
CREATE INDEX idx_audit_time   ON audit_log(timestamp_utc);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
```

---

### `import_runs`

Audit record for each statement import operation.

```sql
CREATE TABLE import_runs (
  id              TEXT PRIMARY KEY,
  source          TEXT NOT NULL,          -- 'MT4_HTML', 'MT5_HTML', 'CSV'
  source_filename TEXT NOT NULL,
  stored_path     TEXT NOT NULL,          -- relative path to copy in /imports/
  account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  rows_total      INTEGER NOT NULL,
  rows_imported   INTEGER NOT NULL,
  rows_duplicate  INTEGER NOT NULL,
  rows_merged     INTEGER NOT NULL DEFAULT 0,
  rows_failed     INTEGER NOT NULL,
  failed_report   TEXT,                   -- JSON array of { rowIndex, reason, rawRow }
  created_at_utc  TEXT NOT NULL
);

CREATE INDEX idx_import_runs_account ON import_runs(account_id, created_at_utc);
```

---

### `bridge_files`

Tracks every JSON file processed by the live bridge watcher.

```sql
CREATE TABLE bridge_files (
  filename         TEXT PRIMARY KEY,
  status           TEXT NOT NULL CHECK(status IN ('PROCESSED','FAILED','SKIPPED')),
  account_id       TEXT REFERENCES accounts(id),
  trade_id         TEXT REFERENCES trades(id),
  error_message    TEXT,
  processed_at_utc TEXT NOT NULL
);
```

---

### `settings`

Generic key-value store for app-level settings (overflows from `config.json`).

```sql
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

**Known keys:**

| key | type | default | description |
|---|---|---|---|
| `auto_backup` | boolean string | `"true"` | Run auto-backup on close |
| `backup_retention_days` | integer string | `"30"` | Days to keep backups |
| `bridge_subfolder` | path string | `"Ledger"` | MT4/5 EA subfolder name |
| `theme` | `"dark"\|"light"\|"system"` | `"dark"` | UI color theme |

---

### `trades_fts` (Full-Text Search Virtual Table)

FTS5 virtual table that mirrors key text fields from `trades` for Ctrl+K search.

```sql
CREATE VIRTUAL TABLE trades_fts USING fts5(
  trade_id,
  symbol,
  setup_name,
  comment,
  content='trades',
  content_rowid='rowid'
);
```

Queries use the `MATCH` operator:

```sql
SELECT trade_id FROM trades_fts
WHERE trades_fts MATCH 'EURUSD London*'
ORDER BY rank LIMIT 100;
```

---

## Entity Relationship Diagram

```
accounts ──┬── trades ──┬── trade_legs
           │            ├── screenshots
           │            ├── trade_notes
           │            ├── trade_tags ── tags
           │            ├── trade_news_events ── news_events
           │            └── audit_log
           ├── balance_snapshots
           ├── reviews
           └── import_runs

instruments ── trades (symbol FK)

bridge_files (standalone log)
settings (standalone KV)
trades_fts (FTS5 mirror)
```

---

## Seeded Data (First Launch)

On first launch, `initializeDatabase()` seeds:

1. **80 standard instruments** — all major/minor/exotic FX pairs, XAUUSD, XAGUSD, major indices (US30, NAS100, UK100, DE40, JP225), and top crypto pairs
2. **12 default tags** — common confluence tags (Higher Low, Break of Structure, Liquidity Sweep...) and mistake tags (FOMO, Revenge Trade, Oversized, Early Exit...)
3. **8 default setups** — London Breakout, New York Reversal, Order Block Retest, Fair Value Gap, Breaker Block, ChoCH, Asia Range, Kill Zone

---

## Migration Strategy

Migrations are tracked via `PRAGMA user_version`. The `initializeDatabase()` function:

1. Opens the DB with WAL + FK pragmas
2. Reads current `user_version`
3. If 0 (fresh DB): executes `schema.sql` in full, sets `user_version = 1`
4. If > 0: applies any pending migration scripts from `drizzle/`
5. Seeds reference data if the instruments table is empty

This means `schema.sql` is the canonical source of truth; Drizzle migrations handle incremental changes for existing installations.
