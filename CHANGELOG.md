# Changelog

All notable changes to **Ledger** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-04-12

### Added
- **Core trading journal** — manual trade entry with Mode A (full) and Mode B (quick)
- **Blotter** — virtualized trade list with server-side pagination, multi-column filters, and full-text search
- **Trade detail drawer** — five tabs: Overview, Fills, Notes, Media (screenshots), History (audit log)
- **Dashboard** — 12 analytics widgets: equity curve, drawdown, R-distribution, setup performance, session performance, day-of-week heatmap, hour-of-day heatmap, win-rate by confidence, holding-time distribution, streak tracker, monthly P&L, calendar heatmap
- **Statement importer** — drag-and-drop MT4 HTML, MT5 HTML, and generic CSV; 4-step wizard with format auto-detection, preview, and reconciliation
- **Reconciliation engine** — matches manual trades with broker imports by symbol, direction, time (±5 min), and volume (±0.05 lots)
- **Hotkey overlay** — Ctrl+Alt+L opens a 420×640 always-on-top quick-capture window with screenshot attachment
- **Live MT4/MT5 bridge** — chokidar file watcher ingests JSON files from LedgerBridge Expert Advisors in real-time
- **LedgerBridge Expert Advisors** — MT4 and MT5 EAs bundled with installer, export trades on every close
- **Prop firm guardrails** — daily loss, max drawdown, and profit target progress bars with amber/red breach alerts
- **ForexFactory calendar** — import economic events CSV, view week calendar, auto-tag trades affected by high-impact news
- **Daily and weekly reviews** — qualitative trade journal with mood/discipline/energy ratings and session summaries
- **PDF reports** — per-trade detail PDF and date-range summary PDF with full statistics
- **CSV export** — filtered trade list export with all columns
- **Backup and restore** — auto-backup on close (30-day retention), manual backup to Downloads, ZIP restore
- **Trash** — soft-delete trades from blotter, restore or permanently delete from Trash view
- **Audit log** — every trade mutation recorded with before/after field values
- **System tray** — live today's P&L label, quick-access menu, minimize-to-tray on close
- **Auto-launch** — optional startup with Windows (configurable in Settings)
- **Auto-update** — opt-in update check via GitHub Releases (configurable in Settings)
- **Settings** — display timezone, hotkey, data folder location, theme, account management, instrument configuration
- **P&L engine** — `src/lib/pnl.ts` with 34 Vitest tests covering all edge cases
- **Risk calculator** — lot-size calculator with R:R, risk %, and pip value (`src/lib/risk-calc.ts`, 21 tests)
- **Full-text search** — FTS5 Porter-stemmed index across setup names, notes, tags, and symbols
- **Partial unique indexes** — soft-delete-aware deduplication on `external_ticket` and `external_position_id`
- **WAL mode SQLite** — write-ahead logging enabled, 5 s busy timeout, FK enforcement on

### Security
- `sandbox: true`, `contextIsolation: true` on all BrowserWindows
- All IPC inputs validated with Zod schemas
- Screenshot source paths resolved and validated before processing
- Buffer size guard (50 MB) on screenshot uploads
- No telemetry, no cloud dependencies, no network calls from renderer

### Fixed
- FTS5 `trades_fts` virtual table was never populated — all mutations now call `refreshTradeFts()`
- Dashboard N+1 query — replaced per-trade leg fetches with one bulk `inArray` query
- Bridge-watcher trade + leg inserts now wrapped in `withAsyncTransaction` (atomic)
- `stopBridgeWatcher()` and `closeDatabase()` now called on `app.will-quit`
- Screenshot `save-from-path` validates file extension allowlist and resolved path
- Unhandled promise rejections now logged via electron-log

---

## [Unreleased]

_(Planned for future releases)_

- Code-signing for SmartScreen trust without warning dialog
- macOS and Linux builds
- Cloud backup option (user-configured S3/Dropbox)
- MT5 strategy tester import support
- Multi-currency account support
