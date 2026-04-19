# Changelog

All notable changes to **FXLedger** (renamed from "Ledger" in v1.1) are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.5] — 2026-04-19

### Added
- **Balance reconciliation engine (T1.5).** Detects mismatch between actual account equity (from the `balance_operations` ledger, which records real broker deposits/withdrawals/credits/charges) and computed equity (from trade P&L). Persistent banner alerts users when drift > 0.01%. One-click correction workflow creates a CORRECTION balance op to zero out drift. Fully tested: 23 reconciliation scenarios (balance op summation, equity computation, drift detection thresholds, soft-delete handling, closed-trade filtering). Hard rule #14 (audit logging) applies to all corrections.
- **Drift banner + correction modal UI.** DriftBanner component in session header shows drift amount and % when detected. DriftModal provides detailed breakdown (actual vs computed) and button to create correction in one click.

### Changed
- **Account metadata extended (T1.3).** Accounts table now includes `server` (TEXT), `platform` (ENUM: 'mt4'|'mt5'), `leverage` (INT), `timezone` (TEXT, IANA format), `login` (TEXT), `broker_type` (ENUM: 'market_maker'|'ecn'|'stp'). Login combined with server and platform form a partial unique index for duplicate-entry detection during bridge import.
- **Expert Advisor v2.00 (T1.4).** MT4 and MT5 EAs now emit balance operations (`bal_<ticket>.json`) alongside trade events. Bridge-watcher classifies events as `balance_op` or `trade` and routes accordingly. 30-day backward compatibility window for v1 trade events expires 2026-05-19.
- **FXLedger branding (T1.2).** Renamed "Ledger" → "FXLedger" at all user-facing surfaces: window title, tray tooltip, installer UI, sidebar logo, update banner, help components, EA install guide, settings about card, documentation. Internal identifiers (`%APPDATA%\Ledger\`, `com.ledger.journal`, `window.ledger`, MQL filenames) preserved for seamless upgrade from v1.0 → v1.1.

### Fixed
- Schema migrations: new tables and columns correctly applied on first launch with no data loss. Runtime migration003 runs only once (checked via `user_version`), idempotent by design.
- Drift calculation ensures only *closed* trades (where `closed_at_utc IS NOT NULL`) contribute to computed equity; open trades are excluded until they close.

### Technical
- **Tests:** 232/232 passing (9 suites, +23 new reconciliation scenarios).
- **TypeScript:** Clean, no errors.
- **Database:** 18 tables, WAL mode, FK ON, FTS5. Migrations via `user_version` counter (v1.0.3→1.0.5 updates from v=2 to v=3). Soft-delete only from UI; hard-delete only from Trash.
- **Hard rules verified:** UTC ISO-8601 timestamps, Drizzle-only writes, audit logging for mutations, no hardcoded timezone offsets, no network calls (except optional auto-update, off by default).

---

## [1.0.6] — 2026-04-19

### Added
- **Trade-form P0 (T1.7).** Symbol combobox with type-ahead autocomplete backed by instruments table. Setup combobox with autocomplete from setups table. TP (take-profit) field for trade planning in both Mode A (FullForm) and Mode B (QuickForm). Reusable Combobox component with filtering and keyboard navigation via Radix UI Popover. Scenarios: S126 (symbol selection), S127 (setup selection), S128 (TP field).

### Technical
- **Tests:** 232/232 passing (9 suites).
- **TypeScript:** Clean, no errors.
- **Combobox component:** Type-ahead search with filtering, used in symbol selection and setup autocomplete.

---

## [Unreleased] — v1.1.0 production release (target: 2026-05-30)

**Status:** In development. Full 42-calendar-day sprint with 6 weekly gates. See [Implementation Plan](docs/superpowers/plans/2026-04-19-v1.1-implementation.md) for task breakdown and [Real-World Scenarios](docs/superpowers/specs/2026-04-18-v1.1-real-world-scenarios.md) for all 121 features (29 P0 + 92 P1).

### Week 1: Foundation (T1.1–T1.10)
- **T1.1:** FXLedger name availability + trademark check ✓ (COMPLETED)
- **T1.2:** Product rename (FXLedger everywhere) ✓ (COMPLETED in v1.0.5–v1.0.6)
- **T1.3:** Schema: `balance_operations` table + account metadata ✓ (COMPLETED)
- **T1.4:** EA bridge v2: capture all deal types (BALANCE/CREDIT/CHARGE/CORRECTION/BONUS) ✓ (COMPLETED)
- **T1.5:** Balance reconciliation engine + drift banner ✓ (COMPLETED in v1.0.5)
- **T1.6:** Account creation + edit UI (pending, ~1.5d)
- **T1.7:** Trade-form P0: symbol/setup combobox + TP field ✓ (COMPLETED in v1.0.6)
- **T1.8:** Security P0 sweep (zip-slip, CSP, permission handler, EXIF strip) (pending, ~2d)
- **T1.9:** Incremental dashboard compute infrastructure (pending, ~2d)
- **T1.10:** ForexFactory news calendar auto-sync (pending, ~1d)
- **Gate W1:** Foundation stable, rename clean, balance-ops recording, schema migrations complete.

### Week 2: Libraries & Taxonomies (T2.1–T2.10, pending)
- **T2.1:** Setup library CRUD + versioning (S68, S69) ~2.5d
- **T2.2:** Methodology tag taxonomies (SMC/ICT/Wyckoff/Elliott) (S171–S178) ~2d
- **T2.3:** Mistake + confluence library (S74, S76) ~1d
- **T2.4:** Prop firm preset library (FTMO/MFF/Topstep/E8/FundedNext/The5ers) (S11) ~2d
- **T2.5:** Daily loss circuit breaker + enforcement hooks (S12–S19) ~2d
- **T2.6:** ForexFactory news blackout + entry block (S14, S48, S49) ~1.5d
- **T2.7:** Risk-enforcement rules (1% rule, open-risk aggregation) (S24, S25) ~1.5d
- **T2.8:** Deposit/withdrawal log UI (S04) ~1d
- **T2.9:** Theme toggle + accessibility (light/dark/system, reduced-motion, color-blind) (S131, S136, S137) ~1.5d
- **T2.10:** Modified Dietz equity curve with deposit overlays (S05–S09) ~1.5d
- **Gate W2:** Libraries operational, prop rules enforcing, calendar blackout working.

### Week 3: Analytics Depth + Discipline (T3.1–T3.10, pending)
- **T3.1:** Sharpe / Sortino / Calmar / Recovery factor (S77–S80, S84) ~2d
- **T3.2:** MAE / MFE capture + scatter widget (S81) ~3d
- **T3.3:** Session × DoW cross product, time-of-day curve, duration-vs-outcome (S85, S88, S89) ~2d
- **T3.4:** Setup-performance per version + edge-degradation alert (S70, S72) ~1.5d
- **T3.5:** Revenge-trade / tilt / overtrading detector (S56–S58) ~1.5d
- **T3.6:** Pre-trade ritual + post-trade reflection queue (S60, S61) ~2d
- **T3.7:** Anxiety slider + mood check-in + cool-down timer (S62, S219, S220) ~1.5d
- **T3.8:** Post-mortem mode (blown-account autopsy, drawdown root cause) (S241–S244) ~2.5d
- **T3.9:** Slippage tracker + spread-at-entry (S36, S37, S44) ~1.5d
- **T3.10:** Commission model config per account (S42) ~1d
- **Gate W3:** Analytics complete, discipline prompts live, post-mortem works on sample blown account.

### Week 4: Imports, UX Polish, Release (T4.1–T4.15, pending)
- **T4.1:** cTrader CSV importer (S186) ~1.5d
- **T4.2:** MatchTrader / DXtrade importer (S190) ~1.5d
- **T4.3:** IBKR Flex Query importer (S189) ~2d
- **T4.4:** Monthly trader PDF report + prop submission bundle (S206, S210) ~2d
- **T4.5:** Tax-prep CSV + broker statement archive (S103, S211) ~1d
- **T4.6:** Command palette (Cmd-K) + keyboard shortcut overlay (S132, S133) ~2d
- **T4.7:** Bulk blotter ops (tag / delete / export) (S142) ~1d
- **T4.8:** First-run sample data + release notes viewer (S146, S160) ~1.5d
- **T4.9:** Bridge heartbeat + server-time drift alert (S45, S46) ~0.5d
- **T4.10:** Update rollback + crash reporter (S122, S124) ~2d
- **T4.11:** SHA-256 verify on auto-update (S114) ~0.5d
- **T4.12:** Kelly criterion + optimal stop/target analysis (S30, S82, S83) ~1.5d
- **T4.13–T4.15:** E2E acceptance suite + manual playbook + release (~2.5d)
- **Gate W4 / Release:** v1.1.0-wk4 dogfood tag, all P0s green, acceptance playbook passing.

### Week 5: Portfolio, Advanced Imports, Multi-Account (T5.1–T5.10, pending)
- **T5.1:** Multi-account portfolio dashboard (S91–S93, S95) ~3d
- **T5.2:** Per-account risk dashboard + cross-account hedge detection (S94, S96) ~1.5d
- **T5.3:** Edgewonk / TradeZella / TraderVue migration importers (S155) ~2d
- **T5.4:** Broker monthly PDF reconciler (S197) ~2d
- **T5.5:** Payout tracker + consistency rule + weekend close-all (S15, S17, S22) ~1.5d
- **T5.6:** Scale-out / partial-close ladder planner (S29, S199) ~2d
- **T5.7:** Year-end P&L statement + credit segregation (S97, S102) ~1.5d
- **T5.8:** Notes autosave + Undo/Redo on edits (S140, S141) ~1.5d
- **T5.9:** Pinnable trades + bulk ops polish (S143) ~1d
- **T5.10:** Correlation-adjusted risk + margin usage + leverage widget (S26, S34, S35) ~2d
- **Gate W5:** Multi-account working, all importers operational, portfolio usable.

### Week 6: Intelligence, Global Support, Release Hardening (T6.1–T6.11, pending)
- **T6.1:** Voice memo → Whisper.cpp local transcript (S144, S167) ~2.5d
- **T6.2:** Trade-similarity search + natural-language blotter query (S163, S165) ~2.5d
- **T6.3:** Screenshot OCR indexing (S169) ~1.5d
- **T6.4:** End-of-day coaching prompt (rule-based insights) (S170) ~1d
- **T6.5:** Remaining security polish (encryption, Windows Hello, screenshot redaction, audit seal) (S111–S113, S115–S117) ~3d
- **T6.6:** Global / cultural support (RTL, CJK fonts, regional holidays, locales) (S236–S240) ~2.5d
- **T6.7:** Feature flags + plugin architecture scaffold (S128 audit AR1) ~1d
- **T6.8–T6.10:** E2E acceptance v1.1 (25 new tests) + manual playbook v1.1 + performance pass (~3d)
- **T6.11:** **Release v1.1.0** (final tag, GitHub release, CHANGELOG, installer verify, smoke test) ~1d
- **Gate W6 / Release:** v1.1.0 tag pushed, release pipeline green, both update channels published, migration from v1.0.3 tested end-to-end, CHANGELOG reviewed, installer verified on clean Windows VM.

### Success Criteria (v1.1.0)
1. ✅ All 29 P0 scenarios implemented, tested, reviewed
2. ✅ All 92 P1 scenarios implemented, tested, reviewed
3. ✅ Full test suite green: `npm test && npm run typecheck && npm run lint && npm run build && npm run test:e2e`
4. ✅ Manual acceptance playbook for 6 manual + 5 new v1.1 criteria passes
5. ✅ Balance reconciliation holds for 1000 synthetic deal events with zero drift
6. ✅ Every IPC handler has Zod-validated input schema
7. ✅ Security sweep (zip-slip, CSP, permission handler, EXIF) clean
8. ✅ Performance: cold start < 2s (i5 4yr-old), dashboard TTI < 500ms with 10k trades
9. ✅ FXLedger branding at every user-facing surface
10. ✅ CHANGELOG specific per scenario ID
11. ✅ Migration from v1.0.3 tested: silent pre-upgrade backup, atomic Drizzle migration, rollback on failure

---

### Changed (v1.1 renaming)
- **Product rename:** "Ledger" → "FXLedger" at every user-visible surface
  (installer, window title, tray tooltip, sidebar logo, update banner, guided
  tour, EA install guide, glossary, Settings "About" card, docs). See T1.2 in
  `docs/superpowers/plans/2026-04-19-v1.1-implementation.md`. The data folder
  (`%APPDATA%\Ledger\`), the EA files (`LedgerBridge.mq4` / `.mq5`), the
  electron-builder `appId` (`com.ledger.journal`), the `window.ledger` preload
  bridge, and internal TypeScript/Drizzle identifiers are intentionally
  preserved to keep v1.0 installs upgrading cleanly.
- Historical entries below this note continue to reference the original
  "Ledger" name and are left untouched for fidelity.

---

## [1.0.3] — 2026-04-18

### Fixed
- **Critical: Dashboard never loaded on v1.0.2.** The default `30D` preset (and
  every other relative preset — `7D`, `90D`, `YTD`) produced `dateFrom`/`dateTo`
  values in `YYYY-MM-DD` format, but `TradeFiltersSchema.utcString` requires the
  full ISO-8601 `YYYY-MM-DDTHH:MM:SS...` format. Zod rejected the filter object,
  the handler caught the error, and the UI showed "Failed to load dashboard
  data." on every install. Fix: presets now emit full ISO datetime strings with
  start-of-day / end-of-day UTC boundaries (mirrors how `BlotterFilters` has
  always done it). Extracted `getDashboardDateRange` into
  `src/lib/dashboard-presets.ts` with 9 regression tests in
  `tests/dashboard-date-range.test.ts`.

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
