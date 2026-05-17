# FXLedger — Full Architecture & Feature Specification

> **Version:** 1.1.0  
> **Platform:** Windows 10/11 (64-bit)  
> **Architecture:** Local-first Electron desktop application  
> **Stack locked:** No cloud. No telemetry. No subscriptions.

---

## 1. Product Identity

**Ledger** is a professional-grade forex trading journal built as a native Windows desktop application. It stores everything on the trader's own machine in a single SQLite database file. There is no server, no cloud sync, and no internet requirement after installation.

The core thesis: **a trading journal is only as good as the friction it removes**. Ledger automates import from MetaTrader 4 and MetaTrader 5, handles live bridge ingestion via Expert Advisors, and presents analytics that help traders identify edge, eliminate mistakes, and improve consistency.

---

## 2. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Electron | 34.x |
| Dev/build | electron-vite | 3.x |
| Frontend | React | 18.3.x |
| Language | TypeScript | 5.7.x |
| UI components | shadcn/ui + Radix UI primitives | latest |
| Styling | Tailwind CSS | 3.4.x |
| Routing | TanStack Router | 1.95.x |
| Server state | TanStack Query | 5.66.x |
| UI state | Zustand | 5.x |
| Tables | TanStack Table + react-virtual | 8.x / 3.x |
| Charts | Recharts | 2.x |
| Database | SQLite via better-sqlite3 | 12.x |
| ORM | Drizzle ORM | 0.39.x |
| Time | date-fns + date-fns-tz | 4.x / 3.x |
| HTML parsing | cheerio | 1.x |
| CSV parsing | papaparse | 5.x |
| File watching | chokidar | 4.x |
| Image encoding | sharp (WebP q85) | 0.33.x |
| PDF generation | pdfkit | 0.16.x |
| Logging | electron-log | 5.x |
| Packaging | electron-builder (NSIS) | 25.x |
| Testing | Vitest | 3.x |
| Validation | Zod | 3.x |
| Forms | React Hook Form | 7.x |

---

## 3. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        WINDOWS PROCESS                          │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Electron Main Process (Node.js)                          │   │
│  │                                                           │   │
│  │  ┌────────────┐  ┌───────────────┐  ┌─────────────────┐  │   │
│  │  │  SQLite DB  │  │ Bridge Watcher│  │ electron-log    │  │   │
│  │  │ better-     │  │ (chokidar)    │  │ → %APPDATA%/    │  │   │
│  │  │ sqlite3     │  │               │  │ Ledger/logs/    │  │   │
│  │  └────────────┘  └───────────────┘  └─────────────────┘  │   │
│  │                                                           │   │
│  │  IPC Handlers (ipcMain)                                   │   │
│  │  trades · legs · imports · dashboard · bridge · backup    │   │
│  │  screenshots · reports · calendar · settings · audit      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          ↑↓ IPC                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Preload (contextBridge)                                  │   │
│  │  window.ledger.* — fully typed IPC bridge                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          ↑↓ IPC                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Renderer Process (React 18, sandboxed)                   │   │
│  │                                                           │   │
│  │  Pages: Dashboard · Blotter · Importer · Reviews          │   │
│  │         Calendar · Reports · Settings · Trash · Overlay   │   │
│  │                                                           │   │
│  │  State: Zustand (UI) · TanStack Query (server data)       │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

Data on disk (%APPDATA%\Ledger\):
  ledger.db          — SQLite database (WAL mode)
  screenshots/       — WebP images (relative paths in DB)
  imports/           — Copies of imported statement files
  bridge/inbox/      — MT4/5 EA drops JSON files here
  bridge/processed/  — Moved after successful import
  bridge/failed/     — Moved on parse/import error
  calendar/          — ForexFactory CSV copies
  backups/           — Manual + auto ZIP archives
  config.json        — App configuration (data_dir, theme, hotkey)
  logs/              — electron-log output
```

---

## 4. Data Flow

### 4.1 Manual Trade Entry

```
User fills TradeForm
  → Zod schema validation (CreateTradeSchema)
  → ipcRenderer.invoke('trades:create', data)
  → IPC handler: createTrade() + createLeg() + recomputeAndSaveTrade()
  → computeTradeMetrics() [pnl.ts]
  → updateTrade() with computed fields
  → TanStack Query cache invalidated ['trades', 'dashboard']
  → Blotter row appears
```

### 4.2 Statement Import

```
User drags MT4/5 HTML or CSV file onto ImporterPage
  → File read in renderer → ArrayBuffer sent via IPC
  → parseMt4Html() / parseMt5Html() / parseCsv()
  → Preview table shown (raw trades + failure count)
  → User clicks "Import [N] trades"
  → For each parsed trade:
      - Dedup check via uq_trades_ticket / uq_trades_position
      - INSERT trade + legs
      - recomputeAndSaveTrade()
  → import_run record written
  → Query cache invalidated
```

### 4.3 Live Bridge (MT4/5 EA)

```
Trader runs LedgerBridge EA on MetaTrader chart
  → On each closed order: EA writes <ticket>.json to MQL4/Files/Ledger/
  → User configures that path as bridge/inbox in Ledger Settings
  → chokidar watcher fires on new .json file
  → parseMT4File() / parseMT5File()
  → dedup → INSERT trade + legs → recomputeAndSaveTrade()
  → File moved to bridge/processed/<date>/
  → Toast notification sent to renderer
```

### 4.4 Reconciliation

```
Manual trade + imported statement trade for same position:
  → ReconcileEngine.findCandidates(): symbol + direction + time window (±5 min) + volume match
  → UI shows side-by-side preview with confidence score
  → User confirms merge
  → executeMerge(): keeps manual trade ID, overwrites broker data (prices, legs)
  → Qualitative fields (setup, notes, tags, emotions) preserved from manual trade
```

---

## 5. P&L Engine (src/lib/pnl.ts)

The engine is the single authoritative source for all financial math. No inline arithmetic anywhere else in the application.

### 5.1 Inputs

```typescript
computeTradeMetrics(trade: Trade, legs: TradeLeg[], instrument: Instrument): TradeMetrics
```

### 5.2 Calculations

| Metric | Formula |
|---|---|
| Weighted avg entry | Σ(price × volume) / Σ(volume) over ENTRY legs |
| Weighted avg exit | Σ(price × volume) / Σ(volume) over EXIT legs |
| Net pips | (avg_exit − avg_entry) × direction_sign / pip_size |
| Net P&L | If broker_profit available on EXIT legs: sum(broker_profit); else: net_pips × pip_size × contract_size × total_volume + commission + swap |
| Risk distance | abs(entry − initial_stop) / pip_size |
| R-multiple | net_pips / risk_distance_pips |
| Trade status | OPEN / PARTIAL (partial exit) / CLOSED (all volume exited) / CANCELLED |

### 5.3 Aggregate Metrics

```typescript
computeAggregateMetrics(trades: TradeWithMetrics[]): AggregateMetrics
```

Computes: win rate, profit factor, expectancy, average R, max drawdown (equity-curve based), drawdown duration, session performance, day-of-week performance, hour-of-day performance, setup performance.

### 5.4 Safety Guards

- `pip_size <= 0` → throws Error (prevents division-by-zero and NaN in DB)
- `riskDistance <= 0` → logs warning, returns `rMultiple: null` 
- Zero legs → returns status: OPEN, all numeric fields null
- Broker profit only on EXIT legs (MT5 deal-array format)

---

## 6. Feature Modules

### 6.1 Trade Blotter (M5)

- Virtualized table (react-virtual, handles 100k+ rows without freeze)
- Column sort: symbol, direction, status, open date, close date, pips, P&L, R
- Filters: account, date range, symbol, direction, status, setup, tags
- Inline quick-actions: open detail drawer, soft-delete, copy trade ID
- Sticky header, alternating row colors, color-coded P&L and R columns
- Keyboard navigation: ↑/↓ to move, Enter to open detail

### 6.2 Trade Detail Drawer (M6)

Slides in from right; full TradeForm is embedded for editing.

Tabs:
1. **Overview** — key metrics (P&L, pips, R, commissions)
2. **Legs** — ENTRY/EXIT fills table with edit/delete per leg
3. **Screenshots** — gallery with kind labels (Entry/Exit/Annotated/Other)
4. **Notes** — markdown timeline (each note is timestamped, never overwritten)
5. **Audit** — full change history (what changed, when, old→new values)

### 6.3 Statement Importer (M7)

Supported formats:
- **MT4 HTML** — `Statement_AccountNumber.htm` from MT4 Account History
- **MT5 HTML** — `Statement_AccountNumber.htm` from MT5 Account History  
- **CSV** — generic with fuzzy header matching (~50 column name variants)

Import pipeline:
1. File drop or browse
2. Auto-detect format (`detectFormat()` checks cheerio vs papaparse parse quality)
3. Parse to `ParsedTrade[]` (pure function, no DB access)
4. Preview: good rows / failed rows / duplicates / mergeable
5. Select account
6. Commit: bulk insert with dedup, recompute all P&L, create import_run record
7. Show import summary with failed rows detail

### 6.4 Dashboard (M9)

10 widgets:

| Widget | Description |
|---|---|
| Equity Curve | Line chart: cumulative P&L over time. Includes deposit markers. |
| Drawdown Chart | Area chart: drawdown % from peak, with max DD annotation. |
| Win Rate | Donut chart with breakdown by long/short. |
| Profit Factor | Single KPI card with trend arrow. |
| Expectancy | Expected $ per trade at current win rate and avg win/loss. |
| R Distribution | Histogram of R-multiple outcomes. |
| Setup Performance | Bar chart: avg R and win rate per setup name. |
| Session Performance | 4-bar chart: London, New York, Asia, overlap. |
| Day of Week Heatmap | 7-column calendar heatmap of avg P&L per day. |
| Hour of Day Heatmap | 24-column heatmap of avg P&L per hour. |

All widgets respect active account + date range filters.

### 6.5 Hotkey Overlay (M10)

- Triggered by **Ctrl+Alt+L** (configurable)
- Always-on-top, 420×640px floating window
- Auto-hides on blur (can be pinned)
- Contains QuickForm version of TradeForm
- Screen capture: captures foreground non-Ledger window as entry screenshot
- Lot-size calculator accessible via **Ctrl+Shift+R**

### 6.6 Live Bridge (M11)

The `LedgerBridge.mq4` / `LedgerBridge.mq5` Expert Advisors:
- Poll order history every 2 seconds (MT4) or subscribe to deal events (MT5)
- Write atomic JSON files: write to `.tmp`, rename to `.json`
- Ledger watches the inbox folder with chokidar
- Bridge toast notifications appear in bottom-right corner

### 6.7 Reviews (M12)

**Daily Review** — filled out after each trading day:
- Followed my plan? (Yes/No/Partial)
- Biggest win of the day
- Biggest mistake
- Improvement point
- Mood/discipline/energy score (1–5)
- Links to all trades of that day

**Weekly Review** — Friday summary:
- Pattern winners (what worked)
- Pattern losers (what to eliminate)
- Strategy adjustment for next week

### 6.8 Prop Firm Guardrails (M13)

For accounts with `account_type = 'PROP'`:
- Persistent banner shows: Daily P&L progress, Max drawdown proximity, Profit target progress
- Color transitions: green → amber (80% of limit) → red (exceeded)
- Real-time update via TanStack Query polling
- Guardrail fields: daily_loss_limit, daily_loss_pct, max_drawdown, max_drawdown_pct, profit_target, profit_target_pct, drawdown_type (STATIC/TRAILING), phase

### 6.9 ForexFactory Calendar (M14)

- Manual CSV import (no network call — user exports from ForexFactory)
- Parsed and stored in `news_events` table
- News events appear as colored badges on the trade timeline and blotter
- "Re-tag all trades" links news events to trades within ±30 minutes of entry
- Calendar page shows economic events with impact colors (red/orange/yellow)

### 6.10 PDF Reports (M15)

- **Per-trade PDF**: header, metrics table, legs table, trade context, notes, footer
- **Summary PDF**: cover, aggregate stats, full trade list table (paginated)
- **CSV Export**: all fields, one row per closed trade
- Reports saved to temp dir, opened with system default PDF viewer

### 6.11 Backup & Restore (M16)

- **Auto-backup**: runs on every app close → `backups/auto/ledger-auto-YYYY-MM-DD_HH-mm-ss.zip`
- **Manual backup**: user-triggered from Settings → Backup
- **Restore**: browse to any `.zip`, validate it contains `ledger.db`, staged restore with pre-restore safety copy
- ZIP contains: `ledger.db`, `screenshots/`, `config.json`
- Auto-prune: keeps last 30 auto-backups

### 6.12 Polish Features (M17)

- **Trash**: recoverable soft-delete with restore + permanent-delete
- **Audit log UI**: per-trade change history with old→new field diff
- **Full-text search**: Ctrl+K command palette searches across symbol, setup, notes, comment
- **Keyboard shortcuts panel**: ? key shows all shortcuts
- **Empty states**: illustrated empty blotter, dashboard, etc.
- **System tray**: shows today's P&L live; double-click to open; right-click for quick actions
- **Auto-launch on Windows startup**: toggleable in Settings

### 6.13 Risk & Lot Calculator (M17b)

Accessible via toolbar button or **Ctrl+Shift+R**:
- Inputs: account balance, risk %, stop loss (pips or price), instrument
- Outputs: risk amount ($), lot size (raw + rounded), position value
- "Use X.XX lots in new trade" button pre-fills the TradeForm

### 6.14 Guided Tour (M17d)

- First-run interactive tour using spotlight + tooltips
- Steps: welcome → new account → blotter → importer → dashboard → bridge guide
- Skippable at any step; restartable from Settings → Help

---

## 7. Security Model

| Concern | Implementation |
|---|---|
| Context isolation | `contextIsolation: true`, `nodeIntegration: false` |
| Sandbox | `sandbox: true` — preload only uses `contextBridge` |
| CSP | `default-src 'self'` — no network, no eval |
| Dev URL validation | `ELECTRON_RENDERER_URL` validated as `localhost` only |
| Path traversal | `resolve()` + `startsWith(dataDir + sep)` on all file operations |
| Buffer size guard | Screenshots: 50 MB max per upload |
| Backup size guard | 2 GB max for manual backup; 500 MB for auto-backup |
| IPC error leakage | All handlers throw `new Error('Failed to ...')` — no raw DB errors to renderer |
| Telemetry | Zero — no analytics, no crash reporting, no update pings |

---

## 8. File Layout

```
FX Trading Journal/
├── electron/                  # Main process (Node.js)
│   ├── main.ts                # App lifecycle, windows, tray, hotkey
│   ├── preload.ts             # contextBridge — window.ledger API
│   ├── ipc/                   # One file per domain
│   │   ├── trades.ts          # CRUD + soft-delete + search
│   │   ├── legs.ts            # Per-trade serialisation queue
│   │   ├── imports.ts         # Statement import + reconciliation
│   │   ├── dashboard.ts       # Aggregate stats with TTL cache
│   │   ├── bridge.ts          # Live MT4/5 ingestion
│   │   ├── screenshots.ts     # Screenshot save + delete (path traversal safe)
│   │   ├── reports.ts         # PDF + CSV export
│   │   ├── backup.ts          # Manual backup + restore
│   │   ├── calendar.ts        # ForexFactory CSV import + retag
│   │   ├── accounts.ts        # Account management
│   │   ├── instruments.ts     # Instrument upsert + cascade recompute
│   │   ├── settings.ts        # App config read/write
│   │   ├── capture.ts         # Screen capture for overlay
│   │   ├── reviews.ts         # Daily/weekly review CRUD
│   │   ├── tags.ts            # Tag + setup management
│   │   ├── notes.ts           # Trade notes CRUD
│   │   ├── audit.ts           # Audit log read
│   │   └── index.ts           # Registration hub
│   ├── services/
│   │   ├── backup.ts          # Auto-backup on app close
│   │   └── bridge-watcher.ts  # chokidar watcher
│   └── mql/
│       ├── LedgerBridge.mq4   # MetaTrader 4 EA
│       └── LedgerBridge.mq5   # MetaTrader 5 EA
├── src/                       # Renderer process (React)
│   ├── App.tsx                # Router setup + layout
│   ├── main.tsx               # ReactDOM entry
│   ├── index.css              # Tailwind + CSS variables
│   ├── components/
│   │   ├── ui/                # shadcn/ui primitives
│   │   ├── layout/            # Sidebar, TopBar, AccountSelector, PropFirmBanner
│   │   ├── blotter/           # BlotterTable, BlotterFilters
│   │   ├── trade-form/        # TradeForm, NewTradeDialog
│   │   ├── trade-detail/      # Drawer, LegsTable, Notes, Screenshots, Audit
│   │   ├── risk-calculator/   # RiskCalculator
│   │   ├── session-header/    # SessionClock
│   │   ├── help/              # KeyboardShortcuts overlay
│   │   └── tour/              # GuidedTour
│   ├── pages/
│   │   ├── DashboardPage.tsx
│   │   ├── BlotterPage.tsx
│   │   ├── ImporterPage.tsx
│   │   ├── ReviewsPage.tsx
│   │   ├── CalendarPage.tsx
│   │   ├── ReportsPage.tsx
│   │   ├── SettingsPage.tsx
│   │   ├── TrashPage.tsx
│   │   └── OverlayPage.tsx
│   ├── lib/
│   │   ├── pnl.ts             # P&L engine — single source of truth
│   │   ├── tz.ts              # Timezone + session detection
│   │   ├── schemas.ts         # Zod validation schemas
│   │   ├── format.ts          # Number/date formatters
│   │   ├── reconcile.ts       # Reconciliation scoring engine
│   │   ├── prop-firm.ts       # Prop firm rules evaluation
│   │   ├── risk-calc.ts       # Lot-size calculator
│   │   ├── cn.ts              # clsx + tailwind-merge helper
│   │   ├── db/
│   │   │   ├── schema.ts      # Drizzle ORM schema (mirrors schema.sql)
│   │   │   ├── queries.ts     # All DB read/write functions
│   │   │   └── client.ts      # better-sqlite3 + drizzle bootstrap
│   │   └── importers/
│   │       ├── mt4-html.ts    # MT4 HTML parser
│   │       ├── mt5-html.ts    # MT5 HTML parser
│   │       ├── csv.ts         # Generic CSV parser
│   │       ├── detect.ts      # Format auto-detection
│   │       └── headers.ts     # Fuzzy header matcher
│   ├── stores/
│   │   └── app-store.ts       # Zustand UI state
│   └── hooks/
│       └── useGlobalKeys.ts   # Global keyboard shortcuts
├── tests/
│   ├── pnl.test.ts            # 34 test cases
│   └── risk-calc.test.ts      # 14 test cases
├── drizzle/                   # Generated migrations
├── scripts/
│   └── gen-icons.js           # Generates build/icon.{ico,png} + tray.png
├── schema.sql                 # Canonical SQLite DDL (extraResource)
├── index.html                 # Renderer HTML entry
├── package.json
├── electron.vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── drizzle.config.ts
```

---

## 9. Build & Release Pipeline

```bash
# 1. Install dependencies
npm install

# 2. Run tests (must pass before any release)
npm test                    # 48 tests across pnl + risk-calc

# 3. Type check
npm run typecheck           # Zero tolerance for TS errors

# 4. Build renderer + main + preload
npm run build               # electron-vite build → dist/ + dist-electron/

# 5. Generate Windows installer
npm run package:win         # gen-icons → electron-vite build → electron-builder --win
                            # Output: release/Ledger-1.0.0-setup.exe (NSIS)
```

---

## 10. Hard Rules (Non-Negotiable)

1. No hardcoded UTC offsets — `date-fns-tz` with IANA strings only
2. All DB timestamps are UTC ISO-8601 strings
3. All P&L math lives in `src/lib/pnl.ts` only — zero inline arithmetic
4. Every code path in `pnl.ts` has a Vitest test
5. Importer failures never abort — collect bad rows, report them, continue
6. All DB writes go through Drizzle — no raw SQL strings in app code (FTS5 queries are the sole exception)
7. All file paths in DB are relative to `data_dir`
8. Data folder location read from `config.json` on every launch
9. Manual trades and imported trades are indistinguishable downstream after reconciliation
10. Soft-delete only from UI — hard-delete only from Trash view
11. No telemetry, no analytics, no network calls
12. electron-log never logs trade content, notes, or screenshots
13. `pip_size` from the instrument record is the only pip math source
14. Every trade mutation creates an `audit_log` row
15. `<TradeForm>` is reused across manual entry, hotkey overlay, and trade detail — built once

---

## 11. Database Integrity

- **WAL mode**: concurrent reads during writes, no reader blocking
- **Foreign keys ON**: cascading deletes enforced at DB level
- **Partial unique indexes**: deduplication for soft-deleted rows
- **Audit log**: every CREATE/UPDATE/DELETE/RESTORE/MERGE logged with old→new field diff
- **Drizzle migrations**: tracked in `drizzle/` folder; versioned via `user_version` pragma
- **Instrument cascade**: changing pip_size triggers recomputation of all trades for that symbol

---

## 12. Accepted Limitations (v1.0.0)

- Windows only (no macOS/Linux build configured)
- Single machine (no cloud sync, no multi-device)
- No auto-update in v1.0.0 (electron-updater wired, server URL pending)
- No mobile companion app
- ForexFactory calendar requires manual CSV export (no direct API — FF has no public API)
- Bridge watcher requires MetaTrader to be on the same machine or a mapped network drive
