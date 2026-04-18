# Changelog

All notable changes to **Ledger** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.2] — 2026-04-18

### Added
- **In-app help — metric tooltips.** Every headline metric on the Dashboard (Net P&L,
  Win rate, Profit factor, Expectancy, Avg R, Max DD, equity curve header) and every
  sortable Blotter column header now shows a glossary tooltip on hover, defined once
  in `src/lib/glossary-entries.ts` and rendered via the reusable `<MetricTooltip>`
  component.
- **Glossary drawer.** A new Glossary button in the top bar opens a Radix Dialog
  containing searchable definitions for all metrics and trade-lifecycle terms,
  grouped by category.
- **EA install guide.** `/settings/ea-guide` walks through MT4/MT5 Expert Advisor
  installation with per-platform paths, DLL-imports enablement, and troubleshooting.
  Linked from Settings → Bridge.
- **Auto-update UX (Phase 2).** Yellow banner surfaces when a newer Ledger is on
  GitHub Releases: "Available → Download" → progress → "Ready → Restart now". A
  manual "Check for updates now" button sits in Settings → General, and shows
  "last checked X minutes ago" via `date-fns`. `autoDownload=false` and a 4-hour
  cooldown protect against runaway checks. All wiring flows through
  `electron/services/auto-update.ts` + `electron/ipc/updater.ts` + `useUpdater` hook.
- **E2E acceptance suite.** 20 Playwright-Electron tests in
  `tests/e2e/acceptance-criteria.spec.ts` covering AC-02, AC-04–AC-15, AC-18–AC-20,
  AC-22–AC-24. Shared helpers (`tests/e2e/helpers.ts`) give every test an isolated
  `APPDATA` temp dir so runs never share DB state. Fixtures include MT4/MT5 HTML
  samples, generic broker CSV, ForexFactory calendar CSV, and MT bridge events.
- **Manual acceptance-test playbook.** `docs/acceptance-test-playbook.md` —
  sign-off template for the 6 criteria that require real Windows interactions
  (clean install timing, Ctrl+Alt+L overlay, multi-machine backup, OneDrive data-
  folder move, system-tray behavior, hotkey-while-in-tray) plus the post-v1.0.3
  auto-update verification.

### Changed
- `CLAUDE.md` — replaced the stale "Remaining (Build in Order Below)" list with a
  concise 3-item deferred list plus a completion status table reflecting v1.0.2.

### Notes
- Auto-update end-to-end verification (AC-U) cannot be signed off until v1.0.3 is
  published. Not a v1.0.2 ship blocker — the playbook captures the gate.

---

## [1.0.1] — 2026-04-17

### Fixed
- **Critical: app crashed on fresh install** — preload script path was `preload.js` but
  electron-vite compiles it to `preload.cjs`. The preload never ran, so `window.ledger`
  was `undefined` in every renderer component, causing "Cannot read properties of undefined"
  on launch.
- DB init failure on first run now shows a user-readable dialog with the error message and
  data folder path instead of silently closing the window.
- Added a React `RootErrorBoundary` that shows "IPC Bridge Not Available — reinstall using
  the latest installer" when the preload bridge is missing, instead of TanStack Router's
  generic "Something went wrong!" screen.
- **Full-stack production readiness audit (Wave 1-3):**
  - `isNull()` replaces `eq(..., sql\`NULL\`)` in calendar IPC handler (NULL comparisons
    were always false, so no trades ever matched news events).
  - CSV importer now rejects rows with unrecognizable direction instead of silently
    defaulting every ambiguous row to SHORT.
  - MT5 HTML importer uses direction-aware entry/exit classification for brokers that
    omit the Type column.
  - MT4 HTML importer deduplicates partial-close rows that share a ticket number.
  - `detect.ts` false-positive removed (`position` alone no longer triggers MT5 path).
  - `backupDatabaseTo()` uses the WAL-safe `sqlite.backup()` API instead of `readFileSync`.
  - `audit_log` table migrated: `ON DELETE SET NULL` prevents cascade wipe of audit
    history when a trade is hard-deleted; `HARD_DELETE` action added to enum.
  - FTS query sanitizer prevents injection/crash from special characters in search.
  - `hardDeleteTrades()` writes `HARD_DELETE` audit entries before deleting rows.
  - `trades:create` IPC handler wrapped in `withAsyncTransaction`.
  - `invalidateDashboardCache()` called after every trade/leg mutation.
  - Import handler wraps per-trade inserts in `withAsyncTransaction` and writes
    `CREATE` audit rows.
  - `PropFirmBanner` timezone computation uses `date-fns-tz` (no more hardcoded UTC-5).
  - `TradeDetailDrawer.onSuccess` invalidates `['trades']` and `['dashboard']` queries.
  - `TradeForm` `entryLeg` field uses safe-merge defaults to prevent undefined spread.
  - `ImporterPage` account selector now initialises after accounts load, not before.
- GitHub release workflow now uploads `latest.yml` alongside the `.exe` so
  `electron-updater` in-app update checks work correctly.

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
