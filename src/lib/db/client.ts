/**
 * Ledger — SQLite database client (main process only)
 *
 * Responsibilities:
 *  1. Open / create the SQLite database file with correct pragmas
 *  2. Run pending migrations using SQLite user_version as the migration counter
 *  3. Seed the instruments table on first launch
 *  4. Export a Drizzle ORM instance for type-safe queries
 *
 * IMPORTANT: This file uses better-sqlite3 (native Node.js module).
 *            It must only be imported from the Electron main process.
 *            Never import it from a renderer or preload file.
 */

import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { readFileSync } from 'node:fs';
import log from 'electron-log/main.js';

import * as schema from './schema';

// ─────────────────────────────────────────────────────────────
// Module-level singleton — one DB connection per process lifetime
// ─────────────────────────────────────────────────────────────

let _sqlite: Database.Database | null = null;
let _db: BetterSQLite3Database<typeof schema> | null = null;

/**
 * Returns the Drizzle database instance.
 * Throws if initializeDatabase() has not been called yet.
 */
export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!_db) throw new Error('Database not initialized. Call initializeDatabase() first.');
  return _db;
}

// ─────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────

/**
 * Opens (or creates) the SQLite database, applies all pending migrations,
 * and seeds reference data on first launch.
 *
 * @param dbPath    Absolute path to the ledger.db file
 * @param schemaPath Absolute path to schema.sql (bundled as extraResource)
 */
export async function initializeDatabase(dbPath: string, schemaPath: string): Promise<void> {
  if (_db) {
    log.warn('Database already initialized — ignoring duplicate call');
    return;
  }

  log.info(`Database: opening ${dbPath}`);
  const sqlite = new Database(dbPath);

  // Performance + integrity pragmas — applied before anything else.
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('recursive_triggers = ON');
  sqlite.pragma('busy_timeout = 5000');   // 5-second lock wait, not instant fail
  sqlite.pragma('synchronous = NORMAL'); // WAL mode + NORMAL is safe and fast

  // ── Migration runner ───────────────────────────────────────────
  // user_version is a free SQLite integer we own. 0 = brand new DB.
  // Each migration bumps it by 1. Never decrement.
  const currentVersion = sqlite.pragma('user_version', { simple: true }) as number;
  log.info(`Database: schema version ${currentVersion}`);

  if (currentVersion < 1) {
    applyMigration001(sqlite, schemaPath);
  }

  // Future migrations go here:
  // if (currentVersion < 2) { applyMigration002(sqlite); }

  _sqlite = sqlite;
  _db = drizzle(sqlite, { schema });
  log.info(`Database: ready (schema v${sqlite.pragma('user_version', { simple: true })})`);
}

// ─────────────────────────────────────────────────────────────
// Migration 001 — Initial schema + seed
// ─────────────────────────────────────────────────────────────

function applyMigration001(sqlite: Database.Database, schemaPath: string): void {
  log.info('Database: applying migration 001 (initial schema)');

  const schemaSql = readFileSync(schemaPath, 'utf-8');

  // Execute within a transaction so either all DDL succeeds or none does.
  // If it fails mid-way, the DB is left at version 0 and the next launch retries.
  const migrate = sqlite.transaction(() => {
    sqlite.exec(schemaSql);
    seedInstruments(sqlite);
    sqlite.pragma('user_version = 1');
  });

  migrate();
  log.info('Database: migration 001 complete — instruments seeded');
}

// ─────────────────────────────────────────────────────────────
// Instrument seed data
// ─────────────────────────────────────────────────────────────

/**
 * Seeds the instruments table with all standard FX pairs, metals, and indices.
 * pip_size is the ONLY source for pip math in pnl.ts — values are verified
 * against broker contract specs (standard lot = 100,000 for FX).
 *
 * Called once during migration 001. Never called again (idempotent by transaction).
 */
function seedInstruments(sqlite: Database.Database): void {
  const insert = sqlite.prepare(`
    INSERT OR IGNORE INTO instruments
      (symbol, display_name, asset_class, base_currency, quote_currency,
       pip_size, contract_size, digits, is_active)
    VALUES
      (@symbol, @displayName, @assetClass, @baseCurrency, @quoteCurrency,
       @pipSize, @contractSize, @digits, 1)
  `);

  const insertMany = sqlite.transaction((rows: InstrumentRow[]) => {
    for (const row of rows) insert.run(row);
  });

  insertMany(INSTRUMENTS);
}

interface InstrumentRow {
  symbol: string;
  displayName: string;
  assetClass: string;
  baseCurrency: string | null;
  quoteCurrency: string | null;
  pipSize: number;
  contractSize: number;
  digits: number;
}

/**
 * Standard instruments seed.
 *
 * pip_size rules:
 *  - Standard FX pairs:  0.0001 (5 digits)
 *  - JPY crosses/majors: 0.01   (3 digits)
 *  - XAUUSD (Gold):      0.1    (2 digits, contract = 100 oz)
 *  - XAGUSD (Silver):    0.001  (3 digits, contract = 5000 oz)
 *  - US30 (Dow):         1      (1 digit,  contract = 1 index unit)
 *  - NAS100 (Nasdaq):    0.25   (2 digits, contract = 1 index unit)
 *  - BTCUSD:             1      (0 digits, price moves in whole dollars)
 *
 * Add broker-specific symbols via Settings → Instruments in the UI.
 */
const INSTRUMENTS: InstrumentRow[] = [
  // ── Major pairs ───────────────────────────────────────────────────────────
  { symbol: 'EURUSD', displayName: 'EUR/USD', assetClass: 'FOREX', baseCurrency: 'EUR', quoteCurrency: 'USD', pipSize: 0.0001, contractSize: 100000, digits: 5 },
  { symbol: 'GBPUSD', displayName: 'GBP/USD', assetClass: 'FOREX', baseCurrency: 'GBP', quoteCurrency: 'USD', pipSize: 0.0001, contractSize: 100000, digits: 5 },
  { symbol: 'USDJPY', displayName: 'USD/JPY', assetClass: 'FOREX', baseCurrency: 'USD', quoteCurrency: 'JPY', pipSize: 0.01,   contractSize: 100000, digits: 3 },
  { symbol: 'USDCHF', displayName: 'USD/CHF', assetClass: 'FOREX', baseCurrency: 'USD', quoteCurrency: 'CHF', pipSize: 0.0001, contractSize: 100000, digits: 5 },
  { symbol: 'AUDUSD', displayName: 'AUD/USD', assetClass: 'FOREX', baseCurrency: 'AUD', quoteCurrency: 'USD', pipSize: 0.0001, contractSize: 100000, digits: 5 },
  { symbol: 'NZDUSD', displayName: 'NZD/USD', assetClass: 'FOREX', baseCurrency: 'NZD', quoteCurrency: 'USD', pipSize: 0.0001, contractSize: 100000, digits: 5 },
  { symbol: 'USDCAD', displayName: 'USD/CAD', assetClass: 'FOREX', baseCurrency: 'USD', quoteCurrency: 'CAD', pipSize: 0.0001, contractSize: 100000, digits: 5 },

  // ── JPY crosses ───────────────────────────────────────────────────────────
  { symbol: 'GBPJPY', displayName: 'GBP/JPY', assetClass: 'FOREX', baseCurrency: 'GBP', quoteCurrency: 'JPY', pipSize: 0.01, contractSize: 100000, digits: 3 },
  { symbol: 'EURJPY', displayName: 'EUR/JPY', assetClass: 'FOREX', baseCurrency: 'EUR', quoteCurrency: 'JPY', pipSize: 0.01, contractSize: 100000, digits: 3 },
  { symbol: 'AUDJPY', displayName: 'AUD/JPY', assetClass: 'FOREX', baseCurrency: 'AUD', quoteCurrency: 'JPY', pipSize: 0.01, contractSize: 100000, digits: 3 },
  { symbol: 'CADJPY', displayName: 'CAD/JPY', assetClass: 'FOREX', baseCurrency: 'CAD', quoteCurrency: 'JPY', pipSize: 0.01, contractSize: 100000, digits: 3 },
  { symbol: 'CHFJPY', displayName: 'CHF/JPY', assetClass: 'FOREX', baseCurrency: 'CHF', quoteCurrency: 'JPY', pipSize: 0.01, contractSize: 100000, digits: 3 },
  { symbol: 'NZDJPY', displayName: 'NZD/JPY', assetClass: 'FOREX', baseCurrency: 'NZD', quoteCurrency: 'JPY', pipSize: 0.01, contractSize: 100000, digits: 3 },

  // ── Non-JPY crosses ───────────────────────────────────────────────────────
  { symbol: 'EURGBP', displayName: 'EUR/GBP', assetClass: 'FOREX', baseCurrency: 'EUR', quoteCurrency: 'GBP', pipSize: 0.0001, contractSize: 100000, digits: 5 },
  { symbol: 'EURAUD', displayName: 'EUR/AUD', assetClass: 'FOREX', baseCurrency: 'EUR', quoteCurrency: 'AUD', pipSize: 0.0001, contractSize: 100000, digits: 5 },
  { symbol: 'EURCAD', displayName: 'EUR/CAD', assetClass: 'FOREX', baseCurrency: 'EUR', quoteCurrency: 'CAD', pipSize: 0.0001, contractSize: 100000, digits: 5 },
  { symbol: 'EURCHF', displayName: 'EUR/CHF', assetClass: 'FOREX', baseCurrency: 'EUR', quoteCurrency: 'CHF', pipSize: 0.0001, contractSize: 100000, digits: 5 },
  { symbol: 'EURNZD', displayName: 'EUR/NZD', assetClass: 'FOREX', baseCurrency: 'EUR', quoteCurrency: 'NZD', pipSize: 0.0001, contractSize: 100000, digits: 5 },
  { symbol: 'GBPAUD', displayName: 'GBP/AUD', assetClass: 'FOREX', baseCurrency: 'GBP', quoteCurrency: 'AUD', pipSize: 0.0001, contractSize: 100000, digits: 5 },
  { symbol: 'GBPCAD', displayName: 'GBP/CAD', assetClass: 'FOREX', baseCurrency: 'GBP', quoteCurrency: 'CAD', pipSize: 0.0001, contractSize: 100000, digits: 5 },
  { symbol: 'GBPCHF', displayName: 'GBP/CHF', assetClass: 'FOREX', baseCurrency: 'GBP', quoteCurrency: 'CHF', pipSize: 0.0001, contractSize: 100000, digits: 5 },
  { symbol: 'GBPNZD', displayName: 'GBP/NZD', assetClass: 'FOREX', baseCurrency: 'GBP', quoteCurrency: 'NZD', pipSize: 0.0001, contractSize: 100000, digits: 5 },
  { symbol: 'AUDCAD', displayName: 'AUD/CAD', assetClass: 'FOREX', baseCurrency: 'AUD', quoteCurrency: 'CAD', pipSize: 0.0001, contractSize: 100000, digits: 5 },
  { symbol: 'AUDCHF', displayName: 'AUD/CHF', assetClass: 'FOREX', baseCurrency: 'AUD', quoteCurrency: 'CHF', pipSize: 0.0001, contractSize: 100000, digits: 5 },
  { symbol: 'AUDNZD', displayName: 'AUD/NZD', assetClass: 'FOREX', baseCurrency: 'AUD', quoteCurrency: 'NZD', pipSize: 0.0001, contractSize: 100000, digits: 5 },

  // ── Metals ────────────────────────────────────────────────────────────────
  { symbol: 'XAUUSD', displayName: 'Gold',   assetClass: 'METAL', baseCurrency: null, quoteCurrency: 'USD', pipSize: 0.1,   contractSize: 100,   digits: 2 },
  { symbol: 'XAGUSD', displayName: 'Silver', assetClass: 'METAL', baseCurrency: null, quoteCurrency: 'USD', pipSize: 0.001, contractSize: 5000,  digits: 3 },

  // ── Indices ───────────────────────────────────────────────────────────────
  { symbol: 'US30',   displayName: 'Dow Jones 30', assetClass: 'INDEX', baseCurrency: null, quoteCurrency: 'USD', pipSize: 1,    contractSize: 1, digits: 1 },
  { symbol: 'NAS100', displayName: 'Nasdaq 100',   assetClass: 'INDEX', baseCurrency: null, quoteCurrency: 'USD', pipSize: 0.25, contractSize: 1, digits: 2 },
  { symbol: 'SPX500', displayName: 'S&P 500',      assetClass: 'INDEX', baseCurrency: null, quoteCurrency: 'USD', pipSize: 0.25, contractSize: 1, digits: 2 },
  { symbol: 'UK100',  displayName: 'FTSE 100',     assetClass: 'INDEX', baseCurrency: null, quoteCurrency: 'GBP', pipSize: 1,    contractSize: 1, digits: 1 },
  { symbol: 'GER40',  displayName: 'DAX 40',       assetClass: 'INDEX', baseCurrency: null, quoteCurrency: 'EUR', pipSize: 1,    contractSize: 1, digits: 1 },

  // ── Crypto (common pairs traded on CFD brokers) ───────────────────────────
  { symbol: 'BTCUSD', displayName: 'Bitcoin',  assetClass: 'CRYPTO', baseCurrency: 'BTC', quoteCurrency: 'USD', pipSize: 1, contractSize: 1, digits: 0 },
  { symbol: 'ETHUSD', displayName: 'Ethereum', assetClass: 'CRYPTO', baseCurrency: 'ETH', quoteCurrency: 'USD', pipSize: 1, contractSize: 1, digits: 2 },
];

// ─────────────────────────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────────────────────────

/**
 * Run a function inside a SQLite transaction.
 * better-sqlite3 transactions are synchronous — the callback must not be async.
 * If the callback throws, the transaction is automatically rolled back.
 */
export function withTransaction<T>(fn: () => T): T {
  if (!_sqlite) throw new Error('Database not initialized');
  return _sqlite.transaction(fn)();
}

/**
 * Run an async function inside a SQLite transaction using manual BEGIN/COMMIT/ROLLBACK.
 * Use this (instead of withTransaction) when the callback contains await expressions.
 * Node.js + better-sqlite3 are both single-threaded, so there is no interleaving risk.
 */
export async function withAsyncTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (!_sqlite) throw new Error('Database not initialized');
  _sqlite.prepare('BEGIN').run();
  try {
    const result = await fn();
    _sqlite.prepare('COMMIT').run();
    return result;
  } catch (err) {
    _sqlite.prepare('ROLLBACK').run();
    throw err;
  }
}

/**
 * Close the database cleanly on app quit.
 * Call from Electron's 'will-quit' event handler.
 */
export function closeDatabase(): void {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
    log.info('Database: closed');
  }
}
