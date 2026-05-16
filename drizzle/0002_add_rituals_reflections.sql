-- T3.6: Pre-trade ritual checklist + post-trade reflection tracking

CREATE TABLE rituals (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id),
  name TEXT NOT NULL,
  setup_name TEXT,
  items TEXT NOT NULL, -- JSON array of {id, text, optional}
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at_utc TEXT NOT NULL,
  updated_at_utc TEXT NOT NULL
);

CREATE TABLE trade_reflections (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id),
  reflection TEXT,
  reflected_at_utc TEXT NOT NULL
);

CREATE INDEX idx_rituals_account ON rituals(account_id);
CREATE INDEX idx_rituals_setup ON rituals(setup_name);
CREATE INDEX idx_trade_reflections_trade ON trade_reflections(trade_id);
CREATE INDEX idx_trade_reflections_reflected ON trade_reflections(reflected_at_utc);
