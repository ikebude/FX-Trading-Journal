# FXLedger — End-to-End Architecture

> **Audience:** Developers building or maintaining FXLedger.  
> **Status:** v1.0.5 — Foundation complete (T1.1–T1.10). See [CHANGELOG.md](../CHANGELOG.md) for release notes.
> **Relationship to PROJECT_BRIEF:** This document explains *how* the system is built. PROJECT_BRIEF.md defines *what* it does. Both must be read. When they conflict, PROJECT_BRIEF wins.

---

## 1. System Overview

FXLedger is a **three-process Electron application**.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Windows OS                                                         │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Electron                                                   │   │
│  │                                                             │   │
│  │  ┌──────────────┐    IPC (contextBridge)  ┌─────────────┐  │   │
│  │  │  Main Process │◄───────────────────────►│  Renderer   │  │   │
│  │  │  (Node.js)    │                        │  (React 18) │  │   │
│  │  │               │    IPC (contextBridge)  └─────────────┘  │   │
│  │  │               │◄───────────────────────►                 │   │
│  │  │               │                        ┌─────────────┐  │   │
│  │  │               │                        │  Overlay    │  │   │
│  │  │               │                        │  Window     │  │   │
│  │  │               │                        │  (React 18) │  │   │
│  │  └───────┬───────┘                        └─────────────┘  │   │
│  │          │ Preload (preload.ts)                             │   │
│  │          │ typed contextBridge                              │   │
│  └──────────┼──────────────────────────────────────────────────┘  │
│             │                                                       │
│  ┌──────────▼──────────────────────────────────────────────────┐   │
│  │  %APPDATA%\Ledger\                                          │   │
│  │  ├── ledger.db      (SQLite WAL)                            │   │
│  │  ├── config.json                                            │   │
│  │  ├── screenshots/   (WebP, q85)                             │   │
│  │  ├── imports/       (original broker files)                 │   │
│  │  ├── bridge/inbox/  (MT4/5 EA JSON drops)                   │   │
│  │  ├── calendar/      (ForexFactory CSV snapshots)            │   │
│  │  ├── reports/       (generated PDFs)                        │   │
│  │  ├── logs/          (electron-log rolling)                  │   │
│  │  └── backups/       (ZIP snapshots)                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### The Three Processes

| Process | Entry Point | Runs In | Accesses |
|---|---|---|---|
| **Main** | `electron/main.ts` | Node.js (full OS access) | SQLite, filesystem, globalShortcut, chokidar, sharp, pdfkit, electron-log |
| **Preload** | `electron/preload.ts` | Node.js (sandboxed) | Exposes typed `window.api` to renderer via `contextBridge` |
| **Renderer** | `src/main.tsx` | Chromium (no Node) | Only what preload exposes. All data via `window.api.*` IPC calls |

The renderer never touches the database, filesystem, or Node APIs directly. Everything goes through IPC.

---

## 2. Process Communication (IPC Contract)

### How It Works

```
Renderer                    Preload                     Main
   │                           │                           │
   │  window.api.trades        │                           │
   │  .getAll(filters)  ──────►│ ipcRenderer.invoke(       │
   │                           │   'trades:getAll',        │
   │                           │   filters            ──── │►  ipcMain.handle(
   │                           │ )                         │     'trades:getAll'
   │                           │                           │   )
   │                           │◄── serialized JSON ────── │
   │◄────── typed result ───── │                           │
```

### IPC Channel Namespaces

All channels use a `namespace:action` pattern. Declared in `electron/preload.ts`, handled in `electron/ipc/`.

| Namespace | Handler File | Channels |
|---|---|---|
| `settings` | `ipc/settings.ts` | `settings:get`, `settings:update`, `settings:moveDataFolder` |
| `accounts` | `ipc/trades.ts` | `accounts:list`, `accounts:create`, `accounts:update`, `accounts:delete` |
| `trades` | `ipc/trades.ts` | `trades:list`, `trades:get`, `trades:create`, `trades:update`, `trades:softDelete`, `trades:restore`, `trades:bulkTag`, `trades:bulkSetSetup`, `trades:bulkDelete`, `trades:search`, `trades:aggregate` |
| `legs` | `ipc/legs.ts` | `legs:list`, `legs:create`, `legs:update`, `legs:delete` |
| `notes` | `ipc/trades.ts` | `notes:list`, `notes:create`, `notes:delete` |
| `screenshots` | `ipc/files.ts` | `screenshots:save`, `screenshots:delete`, `screenshots:getDataUrl` |
| `tags` | `ipc/trades.ts` | `tags:list`, `tags:create`, `tags:update`, `tags:delete` |
| `setups` | `ipc/trades.ts` | `setups:list`, `setups:create`, `setups:update`, `setups:delete` |
| `imports` | `ipc/imports.ts` | `imports:parse`, `imports:preview`, `imports:commit` |
| `bridge` | `ipc/bridge.ts` | `bridge:getStatus`, `bridge:setWatchDir`, `bridge:stop` |
| `capture` | `ipc/capture.ts` | `capture:trigger`, `capture:saveOverlayTrade` |
| `reports` | `ipc/reports.ts` | `reports:generateTrade`, `reports:generateRange` |
| `calendar` | `ipc/calendar.ts` | `calendar:import`, `calendar:list`, `calendar:tagTrades` |
| `audit` | `ipc/audit.ts` | `audit:getHistory` |
| `backup` | `ipc/files.ts` | `backup:create`, `backup:restore`, `backup:listBackups` |

### Return Shape Convention

All IPC handlers return plain serializable objects. Dates are UTC ISO-8601 strings. No class instances, no `Date` objects, no `Buffer` (use base64 strings for binary data).

```typescript
// ✅ Correct
return { id: '...', opened_at_utc: '2026-04-09T09:30:00.000Z', net_pnl: 142.50 }

// ❌ Wrong
return { id: '...', opened_at: new Date(), net_pnl: 142.50 }
```

---

## 3. Database Architecture

### 18-Table Schema Overview

Source of truth: `schema.sql`. Drizzle mirror: `src/lib/db/schema.ts`.

```
accounts ──────────────────────────────────────────────────────────┐
    │                                                               │
    ├──► trades ──────────────────────────────────────────────┐    │
    │        │                                                │    │
    │        ├──► trade_legs (ENTRY/EXIT legs)                │    │
    │        ├──► screenshots (WebP, categorized)             │    │
    │        ├──► trade_notes (timestamped timeline)          │    │
    │        ├──► trade_tags ──► tags (CONFLUENCE/MISTAKE)    │    │
    │        └──► trade_news_events ──► news_events           │    │
    │                                                         │    │
    ├──► balance_snapshots                                    │    │
    ├──► reviews (daily/weekly)                               │    │
    └──► import_runs                                          │    │
                                                              │    │
instruments (pip_size, contract_size) ◄───────────────────────┘    │
setups ◄──────────────────────────────────────────────────────────┘
audit_log (every mutation)
settings (key/value)
bridge_files (EA watcher state)
trades_fts (FTS5 virtual, indexes notes + setup + tags)
```

### Key Design Decisions

**1. Soft delete on all user-facing tables.** Every `trades`, `trade_legs`, `screenshots`, `trade_notes` row has a `deleted_at_utc` column. The Trash view queries `WHERE deleted_at_utc IS NOT NULL`. All normal queries filter `WHERE deleted_at_utc IS NULL`.

**2. `pip_size` is the only source of pip truth.** The `instruments` table stores the correct `pip_size` for every symbol. The P&L engine always reads from this column. It never assumes 0.0001.

**3. Parent-child trade model.** One `trades` row per position idea. Multiple `trade_legs` rows (scale-in entries + partial exits). The P&L engine computes weighted averages across all legs.

**4. Audit log.** Every INSERT/UPDATE/DELETE on `trades`, `trade_legs`, `tags`, `trade_tags`, `screenshots` creates an `audit_log` row with a JSON diff of before/after values.

**5. External IDs for dedupe.** `trades.external_ticket` (MT4) and `trades.external_position_id` (MT5) are unique per account. Importers query these before inserting to skip duplicates.

**6. FTS5 virtual table.** `trades_fts` is maintained by the IPC layer, not DB triggers. After every insert/update to notes, setup_name, or tags, the IPC handler calls `db.run("INSERT INTO trades_fts(...)")`. This gives us full-text search across the entire journal.

---

## 4. Trade Lifecycle State Machine

```
                    ┌─────────┐
                    │  OPEN   │  (entry legs only, no exits)
                    └────┬────┘
                         │  add partial exit leg
                    ┌────▼────┐
                    │ PARTIAL │  (some volume closed, some open)
                    └────┬────┘
                         │  close remaining volume
              ┌──────────▼──────────┐
              │       CLOSED        │  (all volume exited)
              └─────────────────────┘

   Separately:
              ┌─────────────────────┐
              │     CANCELLED       │  (pending order never filled)
              └─────────────────────┘

   Soft delete from any state:
              deleted_at_utc IS NOT NULL → appears in Trash, excluded from all analytics
```

Status is computed by the IPC layer after every leg mutation by calling `lib/pnl.ts`'s `computeTradeMetrics()`. It is stored back to `trades.status` so the blotter can filter without joining legs.

---

## 5. Four Trade Ingestion Paths

```
Path 1: Manual Entry (+ New Trade button / Ctrl+N)
  User → <TradeForm> → IPC trades:create → DB → audit_log

Path 2: Statement Import (MT4 HTML / MT5 HTML / CSV)
  User drops file → Import page → IPC imports:parse
  → lib/importers/detect.ts → mt4-html.ts | mt5-html.ts | csv.ts
  → IPC imports:preview → UI shows: new | skip | merge candidates
  → User confirms → IPC imports:commit → DB → audit_log
  → Original file saved to %APPDATA%\Ledger\imports\

Path 3: Live Bridge (MT4/MT5 EA → chokidar → IPC)
  Trade closes on MT4/5
  → LedgerBridge.mq4/mq5 writes JSON to MQL4/Files/Ledger/
  → chokidar in electron/services/bridge-watcher.ts detects new file
  → Parse + dedupe check against external_ticket/position_id
  → DB insert + audit_log
  → Toast notification in renderer
  → JSON moved to bridge/processed/<date>/

Path 4: Hotkey Overlay (Ctrl+Alt+L)
  globalShortcut fires
  → desktopCapturer.getSources() captures foreground window
  → sharp encodes to WebP, saves to screenshots/unmatched/<uuid>.webp
  → Overlay window opens (420×640, alwaysOnTop)
  → User fills fast log form (pre-filled: pair, time, session)
  → IPC capture:saveOverlayTrade → DB (status='OPEN') + screenshot linked
  → Overlay closes, main window toasts: "EURUSD LONG — logged"
```

---

## 6. P&L Calculation Pipeline

**Single source of truth: `src/lib/pnl.ts`**

```
computeTradeMetrics(trade, legs, instrument, opts?)
  │
  ├── Gather all ENTRY legs → compute weighted average entry price
  │     weightedEntry = Σ(price × volume) / Σvolume
  │
  ├── Gather all EXIT legs → compute weighted average exit price
  │     weightedExit = Σ(price × volume) / Σvolume
  │
  ├── Net pips = (weightedExit - weightedEntry) × direction_sign / pip_size
  │     where pip_size = instrument.pip_size (e.g. 0.0001 for EURUSD, 0.01 for USDJPY)
  │
  ├── Net P&L = Σ(leg.commission) + Σ(leg.swap) + broker_profit_if_available
  │     (broker-supplied profit takes precedence over reconstructed math)
  │
  ├── R-multiple = net_pips / initial_stop_pips
  │     where initial_stop_pips = |trade.entry_price - trade.stop_price| / pip_size
  │
  ├── Status = OPEN | PARTIAL | CLOSED based on exit volume vs entry volume
  │
  └── TradeMetrics { netPips, netPnl, rMultiple, status, holdingMinutes, ... }

computeAggregateMetrics(trades[], startingBalance)
  │
  ├── Equity curve (array of cumulative P&L points, sorted by close time)
  ├── Win rate, profit factor, expectancy, average R, Sharpe
  ├── Max drawdown (peak-to-trough on equity curve)
  └── AggregateMetrics { ... }
```

**Key edge cases handled in pnl.ts:**
- JPY pairs: pip_size = 0.01 (not 0.0001)
- Metals: XAUUSD pip_size = 0.1, XAGUSD pip_size = 0.001
- Partial exits: only exited volume counts toward closed P&L; remaining position stays OPEN/PARTIAL
- Scale-in entries: multiple entry legs → weighted average entry
- Broker-supplied profit: if `leg.broker_profit` is present, use it instead of reconstructing
- Negative swap: overnight positions accumulate swap costs

---

## 7. Screenshot & Media Pipeline

```
User action                 Main process              Data dir
────────────                ────────────              ─────────
Hotkey capture     ──────►  desktopCapturer
                            .getSources()
                            → PNG buffer
                            → sharp.webp(q=85)
                            → save to screenshots/
                              unmatched/<uuid>.webp

Drag/drop file     ──────►  IPC screenshots:save
                            → sharp.webp(q=85)
                            → save to screenshots/
                              <YYYY-MM-DD>/<uuid>.webp
                            → DB screenshots row

Paste clipboard    ──────►  Renderer reads clipboard
                            → sends ArrayBuffer via IPC
                            → sharp.webp(q=85)
                            → same as drag/drop

View screenshot    ──────►  IPC screenshots:getDataUrl
                            → readFileSync → base64
                            → data:image/webp;base64,...
                            → renderer renders in lightbox

Trade deleted      ──────►  Soft-delete: screenshots remain on disk
                            Hard-delete (from Trash): files deleted
```

All file paths stored in the DB are **relative to `data_dir`**, e.g. `screenshots/2026-04-09/uuid.webp`. The full path is resolved by the IPC layer at read time using `path.join(config.data_dir, relPath)`.

---

## 8. Reconciliation Flow

Merges a manually-logged live trade with its broker statement counterpart.

```
Import commit step
      │
      ├── For each parsed trade from broker statement:
      │     │
      │     └── Query trades WHERE:
      │           account_id = ?
      │           AND symbol = ?
      │           AND direction = ?
      │           AND deleted_at_utc IS NULL
      │           AND external_position_id IS NULL
      │           AND |julianday(opened_at_utc) - julianday(import_time)| × 1440 < 5 min
      │           AND |entry_volume - import_volume| < 0.05 lots
      │
      ├── 0 matches → insert as new trade (source = MT5_HTML / LIVE_BRIDGE)
      ├── 1 match   → surface as "Potential merge" in import preview
      └── N matches → surface all as merge candidates, user chooses

Merge action:
      Manual trade (keep):        Broker data (overwrite):
      ─────────────────────       ──────────────────────────
      id                          entry_price (precise fill)
      setup_name                  exit_price (precise fill)
      confluence tags             commission (exact)
      mistake tags                swap (exact)
      screenshots                 external_ticket
      notes timeline              external_position_id
      confidence                  source = 'MT5_HTML'
      pre/post emotion            broker_profit
      initial_stop_price
      initial_target_price

      Result: one trade row with qualitative richness + precise broker data
      Audit log: UPDATE entry showing all changed fields
```

Pure logic in `src/lib/reconcile.ts`, tested in `tests/reconcile.test.ts`.

---

## 9. Prop Firm Guardrail Engine

```
electron/services/prop-firm.ts   (pure evaluator, no DB access)

evaluateAccount(account, balanceSnapshots, closedTrades[])
  │
  ├── daily_loss_used = Σ net_pnl WHERE closed_today < 0
  ├── daily_loss_limit = account.daily_loss_limit ($ or %)
  ├── drawdown_used = max_drawdown from equity curve
  ├── drawdown_limit = account.max_drawdown_limit
  ├── profit_toward_target = Σ net_pnl / account.profit_target
  │
  └── PropFirmStatus {
        dailyLossPercent,   // e.g. 0.62 = 62% of daily limit used
        drawdownPercent,    // e.g. 0.81 = 81% of max drawdown used
        profitPercent,      // e.g. 0.45 = 45% of target reached
        alerts: ['DAILY_LOSS_WARNING', 'APPROACHING_MAX_DRAWDOWN']
      }

Renderer: <PropFirmBanner> calls this on every dashboard/blotter mount.
Banner is YELLOW at 80% of any limit, RED at 95%, BLINKING at 100%.
```

---

## 10. Build & Deployment Pipeline

```
Development:
  npm run dev
  → electron-vite dev
  → Vite dev server (React renderer, HMR)
  → esbuild (main.ts, preload.ts, watch mode)
  → Electron launches, DevTools auto-open

Production build:
  npm run build
  → electron-vite build
  → Vite bundles renderer → dist/
  → esbuild bundles main+preload → dist-electron/

Windows installer:
  npm run package:win
  → electron-vite build (above)
  → electron-builder --win
  → NSIS installer: release/Ledger Setup 1.0.0.exe
  → Bundles: dist/, dist-electron/, electron/mql/ (EAs)
  → Creates: Desktop shortcut, Start Menu entry
  → Allows: Custom install directory

Installer post-actions (electron/main.ts app.whenReady):
  → ensureDataFolderLayout(%APPDATA%\Ledger\)
  → initializeDatabase(%APPDATA%\Ledger\ledger.db)
    → drizzle applies pending migrations
    → seeds instruments table if empty (28 pairs + metals)
  → registerIpcHandlers()
  → registerHotkey(config.hotkey)
  → startBridgeWatcher(config.data_dir)
  → createMainWindow()
  → if !config.first_run_complete → show FirstRunWizard
```

---

## 11. Testing Strategy

| Layer | Tool | What's Tested |
|---|---|---|
| P&L engine | Vitest | Every function in `pnl.ts` — 27 cases, all symbol types, partials, scale-ins |
| Timezone | Vitest | DST transitions, kill-zone detection per IANA zone |
| Importers | Vitest | Fuzzy header matching, MT4/MT5/CSV parsing, dedupe, bad-row tolerance |
| Reconciliation | Vitest | Match queries, merge logic, edge cases (no match, multiple matches) |
| Prop firm | Vitest | Rule evaluation, all alert thresholds |
| IPC handlers | No unit tests — covered by acceptance criteria (manual E2E) |
| React UI | No unit tests — covered by acceptance criteria |

**Test fixtures** (`tests/importers/fixtures/`): hand-written, committed HTML/CSV samples covering:
- Basic 5-trade MT5 statement
- JPY pair statement (USDJPY, GBPJPY)
- XAUUSD (metal) statement
- Partial exit statement (3 exit legs per position)
- Scale-in entry statement (2 entry legs)
- Statement with pending orders (should filter to CANCELLED, not pollute analytics)
- MT4 HTML (single-row per trade, collapsed entry+exit)

Run tests: `npm test`  
Run with watch: `npm run test:watch`  
CI: Vitest runs on every commit (GitHub Actions or equivalent)

---

## 12. Directory Map — Find What Fast

```
.
├── electron/
│   ├── main.ts              ← App bootstrap, window creation, hotkey, bridge watcher
│   ├── preload.ts           ← ALL IPC channels declared here (window.api.*)
│   ├── ipc/
│   │   ├── index.ts         ← Registers all IPC handler modules
│   │   ├── trades.ts        ← Trade/account/tag/note/setup CRUD
│   │   ├── legs.ts          ← Leg CRUD + volume validation
│   │   ├── imports.ts       ← Parse, preview, commit broker statements
│   │   ├── bridge.ts        ← Live EA watcher control
│   │   ├── capture.ts       ← Hotkey overlay save handler
│   │   ├── files.ts         ← Screenshots, backups, data folder ops
│   │   ├── reports.ts       ← PDF generation
│   │   ├── calendar.ts      ← ForexFactory CSV import
│   │   ├── settings.ts      ← Config get/set
│   │   └── audit.ts         ← Audit log queries
│   ├── services/
│   │   ├── bridge-watcher.ts← chokidar, processes bridge/inbox/
│   │   ├── prop-firm.ts     ← Pure prop firm rule evaluator
│   │   ├── reconciliation.ts← Manual↔imported merge logic
│   │   └── backup.ts        ← ZIP backup/restore, auto-backup on close
│   └── mql/
│       ├── LedgerBridge.mq4 ← Ships with installer, user installs to MT4
│       └── LedgerBridge.mq5 ← Ships with installer, user installs to MT5
│
├── src/
│   ├── main.tsx             ← React entry point
│   ├── App.tsx              ← TanStack Router provider
│   ├── routes/
│   │   ├── __root.tsx       ← Layout (sidebar nav, PropFirmBanner)
│   │   ├── index.tsx        ← Dashboard (10 widgets)
│   │   ├── blotter.tsx      ← Trade blotter (TanStack Table + Virtual)
│   │   ├── trade.$id.tsx    ← Trade detail (3-pane layout)
│   │   ├── import.tsx       ← Statement import UI
│   │   ├── review.tsx       ← Daily/weekly review
│   │   ├── calendar.tsx     ← Economic calendar
│   │   └── settings.tsx     ← All settings tabs
│   ├── components/
│   │   ├── ui/              ← shadcn/ui primitives (Button, Select, etc.)
│   │   ├── trade-form/      ← <TradeForm> — reused in entry, detail, overlay
│   │   ├── blotter-table/   ← Columns, filters, multi-select bar
│   │   ├── dashboard/       ← One component per widget
│   │   ├── overlay/         ← Compact overlay UI (used in overlay window)
│   │   ├── prop-firm-banner/← Persistent alert strip
│   │   └── empty-states/    ← Zero-data illustrations + CTAs
│   └── lib/
│       ├── db/
│       │   ├── schema.ts    ← Drizzle schema (mirrors schema.sql)
│       │   ├── client.ts    ← better-sqlite3 + drizzle bootstrap
│       │   └── queries.ts   ← All read queries (no raw SQL)
│       ├── pnl.ts           ← P&L ENGINE — only place for P&L math
│       ├── tz.ts            ← Timezone + session/kill-zone detection
│       ├── reconcile.ts     ← Merge candidate matching logic
│       ├── prop-firm.ts     ← Renderer-side prop firm evaluator (mirrors service)
│       ├── search.ts        ← FTS5 query builder
│       ├── format.ts        ← Currency, pip, R-multiple formatters
│       └── importers/
│           ├── detect.ts    ← File type detection (extension + content sniff)
│           ├── headers.ts   ← Fuzzy header matcher (shared by all parsers)
│           ├── mt4-html.ts  ← MT4 detailed statement parser
│           ├── mt5-html.ts  ← MT5 detailed statement parser
│           └── csv.ts       ← Generic CSV parser (uses headers.ts)
│
├── tests/
│   ├── pnl.test.ts          ← 27 cases — run before touching pnl.ts
│   ├── tz.test.ts           ← DST + kill-zone cases
│   ├── reconcile.test.ts
│   ├── prop-firm.test.ts
│   ├── importers/
│   │   ├── headers.test.ts
│   │   ├── mt4-html.test.ts
│   │   ├── mt5-html.test.ts
│   │   ├── csv.test.ts
│   │   └── fixtures/        ← Committed HTML/CSV samples
│   └── reports/
│       └── pdf.test.ts
│
├── drizzle/                 ← Generated migration SQL (do not edit manually)
├── schema.sql               ← SQLite DDL SOURCE OF TRUTH (edit this first)
├── package.json             ← Locked deps + scripts
├── electron.vite.config.ts  ← electron-vite build config
├── tailwind.config.ts       ← Tailwind config
├── tsconfig.json            ← Renderer TypeScript config
├── tsconfig.node.json       ← Main process TypeScript config
├── PROJECT_BRIEF.md         ← Full product spec (780 lines)
├── CLAUDE.md                ← Developer guide + AI workflow rules
└── docs/
    └── ARCHITECTURE.md      ← This file
```

---

## 13. 18-Milestone Build Roadmap

| # | Milestone | Key Files | Done When |
|---|---|---|---|
| 1 | npm install + tests pass | package.json, tests/ | `npm test` outputs 27 passing |
| 2 | Electron shell launches | electron.vite.config.ts, tailwind.config.ts, src/main.tsx | `npm run dev` shows blank window |
| 3 | DB init + seed | src/lib/db/client.ts, drizzle/ | `%APPDATA%\Ledger\ledger.db` created with 18 tables + seeded instruments |
| 4 | `<TradeForm>` component | src/components/trade-form/ | Can create OPEN and CLOSED trades manually via form |
| 5 | Blotter | src/routes/blotter.tsx, src/components/blotter-table/ | 10k rows virtualised, all filters work |
| 6 | Trade detail | src/routes/trade.$id.tsx | 3-pane layout, autosave, notes timeline, screenshot pane |
| 7 | Importer UI | src/routes/import.tsx, electron/ipc/imports.ts, src/lib/importers/csv.ts | MT4/MT5/CSV import, preview, commit |
| 8 | Reconciliation | electron/services/reconciliation.ts, src/lib/reconcile.ts | Merge UI in import preview |
| 9 | Dashboard | src/routes/index.tsx, src/components/dashboard/ | All 10 widgets render with correct data |
| 10 | Hotkey overlay | src/components/overlay/, electron/ipc/capture.ts | Ctrl+Alt+L → overlay → save in <12s |
| 11 | Live bridge | electron/services/bridge-watcher.ts, electron/ipc/bridge.ts | MT5 EA trade appears in blotter within 5s |
| 12 | Review pages | src/routes/review.tsx | Daily + weekly review, saved to DB |
| 13 | Prop firm | electron/services/prop-firm.ts, src/components/prop-firm-banner/ | Banner appears at 80% daily loss |
| 14 | Calendar | src/routes/calendar.tsx, electron/ipc/calendar.ts | ForexFactory CSV import, news badges on trades |
| 15 | PDF reports | electron/ipc/reports.ts | Per-trade and date-range PDFs generated |
| 16 | Backup/restore | electron/services/backup.ts, electron/ipc/files.ts | One-click backup ZIP, restore works |
| 17 | Polish | Trash, Audit UI, search, empty states, keyboard shortcuts | All 20 acceptance criteria checklist reviewed |
| 18 | Package + verify | electron-builder, release/ | Installer builds, user can install + use from desktop icon |

See `PROJECT_BRIEF.md §9` for the 20 acceptance criteria that define "done" for Milestone 18.

---

## 14. Audit: DeepSeek Spec vs This Architecture

The DeepSeek conversation in the project's history proposed a different architecture. For clarity:

| DeepSeek Proposed | Ledger Reality | Why Different |
|---|---|---|
| Tauri + Rust backend | Electron + TypeScript | Electron has globalShortcut, desktopCapturer, electron-builder NSIS — all needed. Rust had no advantage here. |
| "AthenaFX Journal" | "Ledger" | Name was locked before DeepSeek conversation. |
| 2 tables (trade_ideas, trade_legs) | 18 tables | Audit log, balance snapshots, reviews, news events, prop firm rules, FTS5 require dedicated tables. |
| JSON files for dropdown config | SQLite tags/setups tables | User-editable in UI, searchable, consistent with the rest of the data model. |
| Ctrl+Alt+J hotkey | Ctrl+Alt+L (configurable) | Configurable with fallback chain. L for "Log". |
| No live bridge | MT4/MT5 MQL EA + chokidar | Critical requirement for real-time sync without broker API. |
| No prop firm module | Full prop firm evaluator | Prop trading is a major use case today. |
| 4-6 week estimate | 18 milestones | More realistic, milestone-based delivery with clear acceptance criteria. |

Claude's prior session spec (captured in PROJECT_BRIEF.md) is the canonical design. DeepSeek's output was a useful requirements-gathering exercise but predates the final decisions.
