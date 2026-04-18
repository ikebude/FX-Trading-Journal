# Forex Trading Journal — Production Specification

**Codename:** FXLedger (renamed from "Ledger" in v1.1; see T1.2)
**Audience:** Any forex trader on Windows. Single-user, local-first, no cloud.
**Status:** Complete spec. Build everything in this document. Nothing in here is optional or deferred.

---

## 1. What this is

A native Windows desktop application that gives a forex trader a complete, private, local journal of every trade they take, the qualitative context around each one, the screenshots that prove the setup, and the analytics that reveal their edge. It runs from a desktop icon, stores everything in a single folder the user controls, and never makes a network call.

It must do every one of these things, end-to-end, with no compromises:

1. Import broker trade history from MT4 and MT5 detailed statement HTML files, and from generic CSV.
2. Import live trades automatically from MT4 and MT5 the moment they close, via a bundled MQL Expert Advisor that writes JSON to the platform's `Files/` folder, watched by the app.
3. Capture trade context the moment a position opens via a global hotkey overlay that screenshots the active window and pre-fills a fast log form.
4. Let the trader manually enter trades — both live (open, no exit yet) and historical (closed, full reconstruction with multiple legs).
5. Reconcile manually-logged live trades with the broker statement when it later arrives, via a merge UI driven by symbol/direction/time/volume matching.
6. Track multiple accounts (live, demo, prop firm) with per-account currency, starting balance, and prop firm rule sets (daily loss limit, max drawdown, profit target).
7. Track multiple entry legs (scaling-in) and multiple exit legs (partials) per trade, with weighted-average P&L and R-multiple computation that handles JPY pip conventions, metals, and indices correctly.
8. Attach unlimited screenshots per trade with categorization (entry, exit, annotated, other), captions, paste-from-clipboard, drag-and-drop, and a lightbox viewer.
9. Maintain a notes timeline per trade — multiple timestamped reflections, not a single overwritten textarea.
10. Tag every trade with confluence factors and mistake categories from a user-editable taxonomy, plus custom tag categories.
11. Search every field — notes, setup names, tags, symbols — via SQLite FTS5.
12. Show a complete analytics dashboard: equity curve with drawdown overlay, max drawdown, win rate, profit factor, expectancy, average R, R-multiple distribution, setup performance, session performance, day-of-week heatmap, hour-of-day heatmap, win rate by confidence, mistake frequency, holding-time distribution.
13. Run a structured guided daily review and weekly review workflow that walks the trader through their closed trades and prompts reflection.
14. Enforce prop firm guardrails — show a persistent banner when daily loss limit or max drawdown is approached, with configurable alert thresholds.
15. Tag trades that occurred near high-impact news events, by importing the ForexFactory weekly economic calendar CSV (a manual user-triggered local file import — no network call from the app).
16. Bulk-edit trades from the blotter (set setup, add tags, delete) on multi-row selection.
17. Soft-delete with a Trash view; never lose data to a misclick.
18. Audit-log every change to a trade so the user can see when they edited a tag or moved a stop in the journal.
19. Export to CSV, to PDF (per-trade report and date-range summary), and to a single-file ZIP backup containing the database, screenshots, imports, and logs.
20. Restore from a ZIP backup with one click.
21. Move the data folder to OneDrive/Dropbox/any path of the user's choice without losing references.
22. Open from a desktop icon and be usable in under three seconds on a typical Windows machine.
23. Provide in-app contextual help — every form field, metric, and concept has a tooltip explaining what it means in plain trader language, plus a full searchable glossary and keyboard shortcuts overlay.
24. Calculate the correct lot size for any trade via a built-in risk calculator: input account balance, risk percentage, entry price, and stop price — the app outputs the exact lot size to use.
25. Stay running in the Windows system tray when the main window is closed, keeping the global hotkey and live bridge active at all times, with an option to launch automatically on Windows startup.
26. Walk new users through an interactive guided tour after the first-run wizard, highlighting every major feature so the trader can start using the journal confidently from day one.
27. Show the current forex session and kill zone, today's running P&L, and current drawdown in a persistent header strip visible on every page without needing to open the dashboard.

If any of these is missing, the journal is not done.

---

## 2. Locked technology stack

| Layer | Choice | Why |
|---|---|---|
| Shell | **Electron 30+** | Best-supported native window for Windows, has every API we need (global hotkeys, screen capture, file dialogs, system tray, auto-updater) and is the fastest stack to build and maintain with AI assistance. |
| Frontend | **React 18 + TypeScript + Vite** | Standard, fast HMR, huge ecosystem. |
| UI components | **shadcn/ui + Tailwind CSS + Radix primitives** | Accessible, themable, native dark mode, no design-system lock-in. |
| Routing | **TanStack Router** | Type-safe, file-based, no surprises. |
| State | **Zustand** | Minimal global state for filters and UI. Server data goes through TanStack Query. |
| Server-data cache | **TanStack Query** | Caches IPC results in the renderer, handles invalidation cleanly. |
| Tables | **TanStack Table** with `@tanstack/react-virtual` | Handles 100k+ trade rows with no lag. |
| Charts | **Recharts** | Declarative, good defaults, themeable. |
| Database | **better-sqlite3** | Synchronous, fastest sqlite binding for Node, zero config. |
| ORM + migrations | **drizzle-orm + drizzle-kit** | Type-safe schema, real migrations from day one, no raw SQL strings in app code. |
| Time | **date-fns + date-fns-tz** | IANA timezone support; never hardcode UTC offsets. |
| HTML parsing | **cheerio** | jQuery-style API for parsing MT4/MT5 statement HTML. |
| CSV parsing | **papaparse** | Handles broker CSV quirks. |
| File watching | **chokidar** | Watches MT4/5 `Files/` folder for the live bridge. |
| Image encoding | **sharp** | Converts pasted/dropped screenshots to WebP q85 (5–10× smaller than PNG). |
| Markdown | **react-markdown + remark-gfm** | Renders trade notes. |
| PDF generation | **pdfkit** | Generates per-trade and summary reports. |
| Logging | **electron-log** | Rolling files in the data dir, never logs note content. |
| Packaging | **electron-builder** | NSIS installer, desktop shortcut, Start Menu entry, auto-update channel (off by default). |
| Tests | **Vitest** | Fast, ESM-native, used for all P&L math and importer parsers. |
| Process manager | **electron-vite** | Unifies main + preload + renderer dev/build. |

No substitutions. If a module needs a library not on this list, add it to this table in a PR before adding it to `package.json`.

---

## 3. Directory layout

```
ledger/
├── electron/
│   ├── main.ts                    # Electron main process
│   ├── preload.ts                 # Typed IPC bridge
│   ├── ipc/
│   │   ├── index.ts               # IPC registry
│   │   ├── trades.ts              # Trade CRUD + queries
│   │   ├── legs.ts                # Leg CRUD
│   │   ├── imports.ts             # Statement import handlers
│   │   ├── bridge.ts              # MT4/5 file watcher
│   │   ├── capture.ts             # Global hotkey + screen capture
│   │   ├── files.ts               # Screenshots, backup zip, data folder ops
│   │   ├── reports.ts             # PDF generation
│   │   ├── calendar.ts            # ForexFactory CSV import
│   │   ├── settings.ts            # Settings get/set
│   │   └── audit.ts               # Audit log
│   ├── services/
│   │   ├── prop-firm.ts           # Prop firm guardrail evaluator
│   │   ├── reconciliation.ts      # Manual ↔ imported merge logic
│   │   └── backup.ts              # ZIP backup + restore
│   └── mql/
│       ├── LedgerBridge.mq4       # MT4 Expert Advisor (ships with installer)
│       └── LedgerBridge.mq5       # MT5 Expert Advisor
├── src/                           # React renderer
│   ├── main.tsx
│   ├── App.tsx
│   ├── routes/
│   │   ├── __root.tsx
│   │   ├── index.tsx              # Dashboard
│   │   ├── blotter.tsx
│   │   ├── trade.$id.tsx          # Trade detail
│   │   ├── import.tsx
│   │   ├── review.tsx             # Daily / weekly review
│   │   ├── calendar.tsx           # Economic calendar view
│   │   └── settings.tsx
│   ├── components/
│   │   ├── ui/                    # shadcn-derived primitives
│   │   ├── trade-form/            # Reusable manual entry / detail editor
│   │   ├── blotter-table/
│   │   ├── dashboard/             # Each widget is its own component
│   │   ├── overlay/               # Hotkey capture floating window UI
│   │   ├── prop-firm-banner/
│   │   └── empty-states/
│   ├── lib/
│   │   ├── db/
│   │   │   ├── schema.ts          # Drizzle schema mirroring schema.sql
│   │   │   ├── client.ts          # better-sqlite3 + drizzle bootstrap
│   │   │   └── queries.ts         # All read queries
│   │   ├── pnl.ts                 # P&L engine — single source of truth
│   │   ├── tz.ts                  # Timezone + session detection
│   │   ├── importers/
│   │   │   ├── detect.ts
│   │   │   ├── headers.ts         # Fuzzy header matcher
│   │   │   ├── mt4-html.ts
│   │   │   ├── mt5-html.ts
│   │   │   └── csv.ts
│   │   ├── reconcile.ts           # Manual↔imported merge candidate finder
│   │   ├── prop-firm.ts           # Pure rule evaluator (mirror in main proc)
│   │   ├── search.ts              # FTS5 query builder
│   │   └── format.ts              # Currency, pip, R formatting
│   └── store/
│       ├── filters.ts             # Zustand store for blotter filters
│       └── ui.ts                  # Theme, sidebar collapsed, etc.
├── tests/
│   ├── pnl.test.ts                # 25+ cases, every code path
│   ├── tz.test.ts                 # DST transition cases
│   ├── reconcile.test.ts
│   ├── prop-firm.test.ts
│   ├── importers/
│   │   ├── headers.test.ts
│   │   ├── mt4-html.test.ts
│   │   ├── mt5-html.test.ts
│   │   ├── csv.test.ts
│   │   └── fixtures/              # Hand-built statement HTML samples
│   └── reports/
│       └── pdf.test.ts
├── drizzle/                       # Generated migrations
├── schema.sql                     # Source-of-truth DDL (this repo)
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── tailwind.config.ts
├── postcss.config.js
├── electron-builder.yml
└── README.md
```

---

## 4. Data location

All user data lives in **`%APPDATA%\Ledger\`** by default. Configurable via first-run wizard and Settings.

```
%APPDATA%\Ledger\
├── ledger.db                       # SQLite, WAL mode
├── config.json                     # data_dir, first_run_complete, theme, last_account_id
├── screenshots/
│   └── 2026-04-09/<uuid>.webp
├── imports/                        # Original copies of every imported file
│   └── 2026-04-09T14-32-11_mt5_<uuid>.html
├── bridge/                         # Inbox for MT4/5 EA dropped JSON files
│   └── inbox/
├── calendar/                       # Imported ForexFactory CSV snapshots
├── reports/                        # Generated PDFs
├── logs/                           # electron-log rolling files
└── backups/
    └── ledger-2026-04-09-1430.zip
```

The data folder location is read from `config.json` on every launch. Moving the folder is an atomic copy operation with rollback on failure.

---

## 5. Schema

The complete DDL is in `schema.sql`. Key concepts:

- **`accounts`** — multiple accounts with broker, currency, type (LIVE/DEMO/PROP), starting balance, and embedded prop firm rule fields (daily_loss_limit, max_drawdown_limit, profit_target, evaluation_phase).
- **`instruments`** — full per-symbol metadata: pip_size, contract_size, digits, asset_class, quote_currency. Seeded with 28 majors/minors + XAUUSD/XAGUSD on first run; user-editable.
- **`trades`** — position-level trade idea, with planned stop and target stored explicitly so R-multiple is always computable. Soft-deletable. Tracks `source` (MANUAL / MT4_HTML / MT5_HTML / CSV / LIVE_BRIDGE) and external IDs for dedupe.
- **`trade_legs`** — individual fills. Allows multiple ENTRY legs (scaling-in) and multiple EXIT legs (partials) from the start.
- **`screenshots`** — many-per-trade, categorized, with captions.
- **`trade_notes`** — timeline of timestamped reflections per trade. Not a single textarea overwrite.
- **`tags`** — categorized as CONFLUENCE / MISTAKE / CUSTOM, user-editable.
- **`balance_snapshots`** — per-account periodic balance/equity points for accurate equity-curve and drawdown reconstruction. Populated by statement imports and editable manually.
- **`audit_log`** — every change to every trade, tag, or leg, with timestamp and JSON diff.
- **`import_runs`** — full audit of every imported file with success/duplicate/merge/failed counts.
- **`news_events`** — imported ForexFactory calendar entries, joined to trades by timestamp + currency.
- **`reviews`** — daily and weekly review records with reflection answers and mood ratings.
- **`settings`** — key/value store.
- **`trades_fts`** — FTS5 virtual table over notes, setup_name, and tag names.

See `schema.sql` for the complete DDL.

---

## 6. Modules

Every module below is in scope. Build them all.

### 6.1 Accounts & prop firm rules

Multiple accounts from launch one. Each account has:

- Name, broker, account currency, account type (LIVE / DEMO / PROP), initial balance, opened date, active flag.
- For PROP accounts: daily loss limit ($ or %), max drawdown limit ($ or %), profit target, evaluation phase (Phase 1 / Phase 2 / Funded), trailing or static drawdown flag.
- Display color (used in blotter and dashboard for visual distinction).

The Settings → Accounts page is full CRUD. Switching accounts is a single click in the top bar of every page; the active account filters every other view.

### 6.2 Instruments

Seeded on first run with: EURUSD, GBPUSD, AUDUSD, NZDUSD, USDCAD, USDCHF, USDJPY, EURJPY, GBPJPY, AUDJPY, NZDJPY, CADJPY, CHFJPY, EURGBP, EURCHF, EURAUD, EURNZD, EURCAD, GBPAUD, GBPCAD, GBPCHF, GBPNZD, AUDCAD, AUDCHF, AUDNZD, NZDCAD, NZDCHF, CADCHF, XAUUSD, XAGUSD.

Each carries pip_size (0.0001 / 0.01 / 0.1 / 0.001), contract_size, digits, asset_class, quote_currency. Settings → Instruments allows adding indices/crypto/exotics with correct metadata.

The P&L engine **never** assumes pip_size — it always reads from the instrument record. This is the only way JPY and metals math is correct.

### 6.3 Manual trade entry

A two-mode form, accessible from the **+ New Trade** button on every page and via `Ctrl+N`.

**Mode A: Log Live Trade.** Captures an opening position. Required: account, symbol, direction, entry price, entry timestamp (defaults to now), volume. Strongly encouraged: initial stop price, initial target price, setup, confluence tags, screenshot (paste/drop), confidence, pre-trade emotion, notes. Saves with `status='OPEN'`, no exits.

**Mode B: Log Closed Trade.** Full historical entry — for backfilling notebook trades. Same fields plus exit price(s), exit timestamp(s), commission, swap. Add/remove buttons for additional entry legs (scaling-in) and exit legs (partials). On save, the P&L engine computes everything and `status` is set to CLOSED.

Both modes use the same `<TradeForm>` React component used by the Trade Detail page. Build it once, use it three places.

### 6.4 Statement importers (MT4 HTML, MT5 HTML, CSV)

The Import page has a single drop zone. Drag a file or click to pick. The importer:

1. **Detects file type** by extension first, then by content sniffing (cheerio loads HTML, papaparse handles CSV).
2. **Routes** to `mt4-html.ts`, `mt5-html.ts`, or `csv.ts`.
3. **Each parser uses a fuzzy header matcher** (`headers.ts`) — broker variants change column order and labels, never the underlying data, so we match against a synonym table rather than fixed positions.
4. **MT4 HTML**: Cheerio-loads the file, finds the largest table whose header row matches at least 5 synonym keys, parses each row as one trade with both an ENTRY and an EXIT leg (MT4 statements collapse open and close into a single row). Disambiguates the duplicated "Price" header by column position (first = open, second = close). Direction from the `type` column.
5. **MT5 HTML**: Finds the Deals or Positions section. MT5 deals are per-fill, so groups deals by `position_id`. First in/inout deal becomes the ENTRY leg; subsequent out/inout deals become EXIT legs (this naturally handles partials and scale-ins). Synthesizes one `trades` row per position with `external_position_id` set.
6. **CSV**: Same fuzzy header matcher applied to row 1, then row-by-row.
7. **Pending orders are filtered** — MT5 statements include limit/stop orders that never triggered. Detected by missing fill price or zero volume on close, imported as `status='CANCELLED'` so they don't pollute analytics.
8. **Tolerant parsing** — a single bad row never aborts the import. Failed rows are collected as `{rowIndex, reason, rawRow}` and surfaced in the preview.
9. **Dedupe** — query for existing `external_ticket` (MT4) or `external_position_id` (MT5) per account; skip duplicates and count them.
10. **Reconciliation candidates** — for each parsed trade, query for matching unmatched manual trades (see 6.6) and surface them in a separate preview bucket.
11. **Save the original file** to `imports/` with a UUID-suffixed filename and create an `import_runs` row.
12. **Show preview** before commit: *"Found N trades. K already imported (will skip). M new will be added. P potential merges. F failed."* with expandable panels for each bucket. Import button commits the chosen actions.
13. **Progress indicator for large imports:** if parsing takes more than 500ms (i.e. >~200 rows), show a progress bar with a row count ("Parsing row 847 of 1,243..."). The UI must never appear frozen. Parsing runs in the main process and sends progress events back to the renderer via `webContents.send('import:progress', { current, total })`.

The fuzzy header matcher is shared across all three parsers and tested independently. Synthetic test fixtures for MT4 and MT5 statements live in `tests/importers/fixtures/`, hand-written and committed, including: a basic 5-trade statement, a JPY pair statement, a partial-exit statement, a scale-in statement, and a statement with a pending order that should be filtered.

### 6.5 Live MT4/MT5 bridge

Real-time trade ingestion via a bundled MQL Expert Advisor. No internet, no broker API.

**Expert Advisor (`electron/mql/LedgerBridge.mq4` and `.mq5`):**
- Ships in the installer; placed by the user (or by an installer helper) into `MQL4/Experts/` or `MQL5/Experts/` and attached to any chart.
- On `OnTradeTransaction` (MT5) or `OnTrade` (MT4), serializes the closed deal to a JSON file written to `MQL4/Files/Ledger/` or `MQL5/Files/Ledger/`.
- File format: `{account, ticket, position_id, symbol, direction, volume, open_time, open_price, close_time, close_price, commission, swap, profit, sl, tp, comment}`.
- Atomic write (write to `.tmp`, rename) so the watcher never reads a partial file.

**App-side watcher (`electron/ipc/bridge.ts`):**
- The user configures the watch directory in Settings → Live Bridge (browse to their `MQL5/Files/Ledger/` folder).
- The app symlinks or polls that folder into `%APPDATA%\Ledger\bridge\inbox\`.
- chokidar watches `inbox/` for new `.json` files.
- Each file is parsed, dedupe-checked against `external_ticket`/`external_position_id` for the configured account, and inserted as a new trade with `source='LIVE_BRIDGE'`.
- After successful insert, the JSON file is moved to `bridge/processed/<date>/`.
- A toast notification fires in the app: *"New trade synced: EURUSD LONG +18 pips."*
- Failed parses go to `bridge/failed/` with an error log entry.

**Reconciliation:** Live-bridge trades go through the same merge candidate logic as imported trades, so a hotkey-logged manual trade gets merged with its broker version automatically.

The MQL files are kept short and well-commented. Senior MQL developers review them annually for compatibility with new MT4/5 build numbers.

### 6.6 Hotkey capture overlay

A global hotkey, default `Ctrl+Alt+L`, registered via Electron's `globalShortcut` API. Configurable in Settings.

When pressed:

1. The Electron main process captures the foreground window using `desktopCapturer.getSources()`. If TradingView is in a browser tab, this captures the whole browser window — that's fine, the user crops or replaces the screenshot later if needed. If TradingView desktop app is the active window, it captures just that.
2. The screenshot is encoded as WebP q85 via sharp and saved to `screenshots/unmatched/<uuid>.webp`.
3. A compact 420×640 floating window opens, always-on-top, positioned on the monitor where the cursor currently is (multi-monitor aware via `screen.getDisplayNearestPoint(screen.getCursorScreenPoint())`).
4. The overlay UI pre-fills:
   - **Pair** — auto-detected from the foreground window title via regex matching against the user's instrument list; falls back to last-used.
   - **Timestamp** — current UTC.
   - **Session** — auto-computed from the user's display timezone via `lib/tz.ts`.
   - **Account** — last-used.
   - **Screenshot thumbnail** — the just-captured image.
5. Form fields the user actually fills:
   - Direction (BUY/SELL toggle buttons)
   - Entry price + stop loss (with auto-calculated pip distance and risk %)
   - Setup (combobox)
   - Confluence tags (multi-select chips)
   - Confidence (1–5 stars)
   - Pre-trade emotion (dropdown)
   - One-line note (optional)
6. Keyboard navigation: Tab between fields, Enter to save, Esc to cancel. The user never has to touch the mouse.
7. On save, creates a `trades` row with `status='OPEN'` and one ENTRY leg, attaches the screenshot, closes the overlay. Total time from hotkey to saved: under 12 seconds with practice.
8. **Hotkey conflict fallback**: if `globalShortcut.register()` returns false, the app shows a Settings notification asking the user to pick a different combination. Default falls back through `Ctrl+Alt+L`, `Ctrl+Alt+J`, `Ctrl+Shift+L`.
9. **Capture failure fallback**: if `desktopCapturer` returns no sources, the overlay opens anyway with an empty screenshot slot and a "Paste from clipboard" button — the user takes a screenshot manually with `Win+Shift+S` and pastes.
10. **Cooldown**: the hotkey is throttled to one trigger per 3 seconds to prevent double-fires.

### 6.7 Trade blotter

A virtualized TanStack Table.

**Columns:** status icon, opened-at (display tz), symbol, direction, total volume, weighted avg entry, weighted avg exit, net pips, net P&L, R-multiple, setup, tag chips, account color stripe.

**Sidebar filters:** account (multi), date range (presets + custom), symbol (multi), direction, setup (multi), confluence tags (any/all), mistake tags (any/all), status (open/partial/closed), result (win/loss/breakeven), confidence range, R-multiple range, P&L range, holding-time range, has-screenshot toggle, has-notes toggle, source (manual/imported/bridge).

**Top bar:** free-text FTS5 search across notes/setup_name/tag names, **+ New Trade** button, account switcher, density toggle, column visibility menu, export-current-view-to-CSV.

**Multi-select with checkboxes:** selecting rows reveals a top action bar with Bulk tag, Bulk set setup, Bulk delete (soft), Bulk export to CSV.

**Soft delete only.** Deleted rows go to Settings → Trash; never hard-deleted from the blotter.

**Empty state.** Zero trades in the active account → centered card with three CTAs: *"Import a statement"*, *"Add your first trade"*, *"Load 20 sample trades"*. Sample trades have `is_sample=1` and a one-click clear button in Settings.

**Row click** opens Trade Detail. Right-click context menu: Open, Duplicate, Delete (soft), Export to CSV.

### 6.8 Trade detail

Three-pane layout, built from a reusable `<TradeForm>` component shared with manual entry.

**Top header:** symbol, direction badge, status badge, computed metrics (net pips, P&L, R-multiple, holding time, weighted avg entry, weighted avg exit), account, source badge.

**Left pane — Trade data:**
- Editable fields: setup (combobox with create-new), confluence tags (multi-select chips), mistake tags (multi-select chips), pre-trade emotion, post-trade emotion, confidence (1–5 stars), market condition, entry model, initial stop price, initial target price, planned R:R.
- **Notes timeline:** chronological list of timestamped notes. "Add note" textarea at the bottom posts a new note rather than editing the previous one. Each note renders as markdown via react-markdown + remark-gfm. Notes are individually deletable but never silently overwritten.
- **Legs table:** every entry/exit leg with editable price, volume, timestamp, commission, swap. "Add leg" button (entry or exit). Validation: total exit volume cannot exceed total entry volume.

**Right pane — Screenshots:**
- Drop zone supporting file drop, file picker, and `navigator.clipboard.read()` paste.
- Multiple screenshots per trade with `kind` (ENTRY/EXIT/ANNOTATED/OTHER).
- Convert to WebP q85 via sharp on save.
- Click thumbnail → lightbox.
- Each screenshot has an editable caption and a delete button.
- "Replace with annotated version" button on any screenshot — for forensic post-mortem reviews.

**Save behavior:** autosave on blur, debounced 500ms. No save button. Recompute metrics via `lib/pnl.ts` on every save and write back to the `trades` row. Audit log entry created on every change.

**Print-friendly view:** a "Print / PDF this trade" button generates a single-page PDF with all fields, primary screenshot, and notes — handy for sharing with mentors.

### 6.9 Reconciliation engine

When a trade is imported (statement or live bridge), the engine looks for unmatched manual trades that might be the same trade.

**Match query** (per imported trade):

```sql
SELECT * FROM trades
WHERE account_id = ?
  AND symbol = ?
  AND direction = ?
  AND deleted_at_utc IS NULL
  AND external_position_id IS NULL
  AND external_ticket IS NULL
  AND ABS(julianday(opened_at_utc) - julianday(?)) * 1440 < 5   -- within 5 minutes
  AND ABS(<entry_volume> - ?) < 0.05                             -- within 0.05 lots
```

Matches are surfaced in the import preview as a third bucket: **Potential merges**. For each match, the UI shows the manual trade and the imported trade side-by-side with three actions: **Merge**, **Keep both**, **Skip import**.

A merge keeps the qualitative fields (setup, tags, screenshots, notes timeline, emotion, confidence, initial stop, initial target) from the manual trade and overwrites the trade row with the imported broker data (precise prices, commission, swap, external IDs, leg structure). The manual trade's id is preserved so audit-log history is intact.

The reconciliation logic is pure (`src/lib/reconcile.ts`) and tested independently.

### 6.10 Bulk operations

From the blotter multi-select bar:

- **Bulk tag** — opens a tag picker, applies the chosen tags (additive, doesn't remove existing) to every selected trade.
- **Bulk set setup** — opens a setup combobox, sets `setup_name` on every selected trade (with confirmation if any already have a different setup).
- **Bulk delete** — soft-deletes with a confirmation modal showing the count.
- **Bulk export to CSV** — exports only the selected rows with all columns.

Every bulk operation creates audit log entries — one per affected trade.

### 6.11 Search (FTS5)

The `trades_fts` virtual table indexes notes (joined from `trade_notes`), setup_name, and tag names. Maintained by app-level inserts in the IPC trades layer (drizzle's after-hooks).

The blotter top bar accepts free-text search. Queries are passed through a small parser that supports:

- Plain words: `breakout` → matches notes/setup/tags containing "breakout"
- Quoted phrases: `"order block"` → exact phrase
- Tag filter: `tag:fomo` → trades tagged with "fomo"
- Symbol filter: `symbol:eurusd` → only EURUSD
- Setup filter: `setup:"order block"`
- Negation: `-tag:revenge`
- Combinations: `breakout symbol:gbpjpy -tag:revenge`

Implemented in `src/lib/search.ts` and tested.

### 6.12 Dashboard

A single page with one stats row and ten widgets, all filterable by account(s), date range, symbol(s), and setup(s) via a top control bar.

**Stats row** (computed for the selected filter scope):

| KPI | Definition |
|---|---|
| Total trades | Count of trades with status = CLOSED |
| Win rate | Wins ÷ closed trades, where a win is `net_pnl > breakeven_tolerance` |
| Average R | Mean of `r_multiple` across closed trades with non-null R |
| Profit factor | Σ winning P&L ÷ \|Σ losing P&L\| |
| Expectancy (R) | Mean of `r_multiple`, with the loser-floor at `-1R` for consistency |
| Max drawdown | Largest peak-to-trough drop on the equity curve, in account currency and as % of peak |
| Net P&L | Sum of `net_pnl` for the scope |
| Sharpe (per trade) | Mean trade return ÷ stdev trade return × √trades |

**Widgets:**

1. **Equity curve** — Recharts line chart of cumulative net P&L over time. Faint area overlay showing drawdown from each running peak.
2. **R-multiple distribution** — Recharts histogram of `r_multiple` bucketed in 0.5R bins. Reveals fat tails and the shape of the trader's edge.
3. **Setup performance** — Bar chart of average R-multiple per setup, sorted descending, with trade count labels. Click a bar to filter the blotter to that setup.
4. **Session performance** — Bar chart of net P&L by session (Sydney, Tokyo, London, NY AM, NY PM, London Close, Asian Range), with win rate in tooltip.
5. **Day-of-week heatmap** — Grid of weekdays × P&L color, computed in display timezone.
6. **Hour-of-day heatmap** — 24-hour grid of P&L color, computed in display timezone.
7. **Win rate by confidence** — Bar chart of win rate vs. self-reported confidence (1–5 stars). Reveals whether the trader's gut is calibrated.
8. **Mistake frequency** — Horizontal bar chart of mistake tag occurrences, sorted descending. Click a bar to filter the blotter.
9. **Holding-time distribution** — Histogram of holding times in minutes, log-scale x-axis.
10. **Calendar heatmap** — Month-by-month grid colored by daily P&L, like a GitHub contribution graph.
11. **Win/loss streak** — Current streak displayed as a badge ("🔥 5W streak" or "💀 3L streak") with a mini-chart showing the last 20 trade results as colored dots. Longest win streak and longest loss streak for the filtered period shown below.
12. **Monthly P&L comparison** — Bar chart showing net P&L per calendar month for the last 12 months. Each bar is color-coded (green/red). Clicking a bar filters the blotter to that month. Reveals consistency and seasonal patterns.

All widget computation lives in `src/lib/pnl.ts`'s `computeAggregateMetrics(trades)` function, which is tested independently with synthetic trade arrays. No widget computes its own math.

### 6.13 Daily review and weekly review

A guided post-market workflow at `/review`.

**Daily review** (selected via date picker; defaults to today):

1. **Recap table** — every trade closed on that date in the active account, with key metrics.
2. **Auto-stats** — number of trades, net P&L, win rate, R-sum, hit-rate by setup.
3. **Reflection prompts** (saved to the `reviews` table):
   - "Did you follow your trading plan today?" (Yes/No/Partially)
   - "What was your biggest win and why?" (textarea, markdown)
   - "What was your biggest mistake?" (textarea)
   - "One thing to improve tomorrow" (textarea)
   - "Mood at end of session" (1–5 emoji scale)
4. **Save Review** stores everything as a single `reviews` row with `kind='DAILY'`, linked by date and account.

**Weekly review** (defaults to current ISO week):

1. **Recap stats** — week's trades, weekly P&L, R-sum, best setup, worst setup, mistake frequencies.
2. **Equity curve** for the week.
3. **Reflection prompts**:
   - "What pattern do you notice in your winning trades?" (textarea)
   - "What pattern do you notice in your losing trades?" (textarea)
   - "Which mistake tag came up most often, and what's your plan for it next week?"
   - "Adjustments to your strategy?" (textarea)
   - "Mood / discipline / energy" (three 1–5 scales)
4. **Save Review** stores as `kind='WEEKLY'`.

Past reviews are listed in a sidebar; clicking one re-opens it.

### 6.14 Prop firm guardrails

For accounts with `account_type='PROP'`, the app continuously evaluates the configured rules and surfaces warnings.

**Rules supported:**

- **Daily loss limit** — sum of today's net P&L (account tz). When current daily P&L reaches `-0.5 × limit`, show a yellow banner. At `-0.8 × limit`, red banner. At limit, persistent red modal blocking new trade entry.
- **Max drawdown** — running drawdown from peak balance. Same three thresholds.
- **Profit target** — when reached, a celebratory banner: "Profit target hit. Consider stopping."
- **Static vs trailing drawdown** — for prop firms with trailing drawdown (e.g., FTMO classic vs Swing), the calculation tracks high-water mark.

**The banner** is a fixed top bar visible on every page when the active account is a PROP account and any rule is in warning state. It shows: current daily P&L, daily loss limit, current drawdown, max drawdown limit, current equity, profit target.

**Pre-trade check:** when the user clicks Save on a new live trade, if the configured stop loss would push the account past the daily loss limit, the app shows a confirmation modal: *"This trade risks $X. Your remaining daily loss budget is $Y. Continue?"*

The evaluator is a pure function in `src/lib/prop-firm.ts`, tested with snapshot scenarios for the major prop firms (FTMO Phase 1, FTMO Funded, MFF, FundedNext).

### 6.15 Economic calendar tagging

The app does not call ForexFactory directly. Instead, the Calendar page has a "Import calendar CSV" button — the user manually downloads ForexFactory's free weekly CSV (or any compatible format) and imports it.

**Import flow:**

1. User downloads `ff_calendar_thisweek.csv` from forexfactory.com in their browser.
2. Drags it onto the Calendar page.
3. App parses with papaparse, inserts into `news_events` table with currency, impact level (low/med/high), datetime UTC, title, forecast, previous, actual.
4. Snapshot is saved to `calendar/`.

**Trade tagging:** a background process (or a manual "Re-tag trades with news context" button) iterates trades and, for each, finds news events:
- Within ±30 minutes of `opened_at_utc`
- Whose currency matches one of the trade's symbol's two currencies
- With impact = HIGH (configurable threshold)

Matches are stored in a `trade_news_events` join table. The trade detail page shows a "News context" badge listing matched events. The dashboard exposes a filter "Trades during HIGH-impact news" so the trader can see if news trading is helping or hurting.

### 6.16 Reports & exports

**CSV export:**
- Full database export (every trade with every field) → `reports/ledger-export-<timestamp>.csv`
- Current blotter view → respects active filters
- Selected rows → from bulk actions

**PDF reports** (via pdfkit):
- **Per-trade report** — single-page summary of one trade with all fields, primary screenshot, notes timeline. "Print / PDF this trade" button on Trade Detail.
- **Date-range summary** — full performance report for a chosen date range and account: stats row, equity curve image, top 5 setups, mistake frequencies, sample of best and worst trades. Button on Dashboard.
- **Weekly review** — printable version of any saved weekly review.

PDFs are written to `%APPDATA%\Ledger\reports\` and the app shows them in the OS file explorer with `shell.showItemInFolder()`.

### 6.17 Backup and restore

**Manual backup:** Settings → "Backup now" creates a ZIP at `backups/ledger-<timestamp>.zip` containing `ledger.db`, `screenshots/`, `imports/`, `reports/`, and `calendar/`. Keeps the last 10 backups, prunes older ones.

**Automatic backup on close:** the app writes a backup ZIP to `backups/auto/` on every clean shutdown. Keeps the last 5.

**Restore:** Settings → "Restore from backup" → file picker for a ZIP → confirmation modal warning that current data will be replaced → atomic restore (current data moved to `backups/pre-restore-<timestamp>/`, ZIP extracted, app restarts).

Cloud sync is not built in. Instead, the user is offered to point their data folder at a OneDrive/Dropbox path during the first-run wizard. The whole folder syncs automatically through their existing cloud client.

### 6.18 Settings

Tabbed interface:

- **General** — theme (dark/light/system), display timezone (IANA dropdown), display currency, win/loss color preference, density (comfortable/compact), launch FXLedger on Windows startup (toggle, default off), start minimized to tray (toggle, default off when launched manually).
- **Accounts** — full CRUD with prop firm rule configuration.
- **Instruments** — full CRUD; pip_size validation prevents incorrect entries.
- **Tags** — manage CONFLUENCE / MISTAKE / CUSTOM tag categories.
- **Setups** — manage the setup name autocomplete list.
- **Hotkey** — change the global capture hotkey, with a "Press a key combination" picker and conflict detection.
- **Live Bridge** — configure MT4 and MT5 watch directories, show last sync timestamp, "Pause sync" toggle, "Open MQL EA folder" helper button.
- **Calendar** — import history, "Re-tag all trades" button, news impact threshold for tagging.
- **Data folder** — current path, "Open in Explorer" button, "Move data folder" button (atomic copy with rollback).
- **Backups** — list of existing backups with restore/delete actions, "Backup now" button, auto-backup on/off, max backup count.
- **Trash** — soft-deleted trades with Restore and Permanently Delete buttons. Auto-purge after 90 days (configurable).
- **Sample data** — "Load sample trades" / "Clear sample data" buttons, only enabled when relevant.
- **Logs** — "Open log folder", log level selector, "Export logs to ZIP" for support.
- **About** — version, license, "Check for updates" (off by default), credits.

### 6.19 Trash and soft delete

Every delete in the UI is a soft delete (`UPDATE trades SET deleted_at_utc = ?`). The Trash view in Settings is the only place soft-deleted trades are visible. From there: Restore (clears `deleted_at_utc`) or Permanently Delete (cascade hard-delete).

Auto-purge: a daily job (on app launch, throttled to once per day via a settings flag) hard-deletes anything in trash older than the configured retention (default 90 days, configurable 0–365).

### 6.20 Audit log

Every change to a trade, leg, screenshot, tag, or note is recorded in the `audit_log` table:

```
audit_log: id, entity_type, entity_id, action (CREATE/UPDATE/DELETE/RESTORE), changed_fields (JSON), actor (always 'user' in single-user app), timestamp_utc
```

The Trade Detail page has a "History" tab showing the chronological audit log for that trade. Useful for catching journal-tampering ("did I really tag this as FOMO three weeks ago, or did I add that yesterday?").

### 6.21 Logging

`electron-log` writes to `%APPDATA%\Ledger\logs\` with rotation (5MB × 5 files). Logs include: app start/stop, every IPC call (method + duration, never payloads), every import run, every bridge sync, every error with stack trace. **Never logs trade content, notes, or screenshots** — privacy is non-negotiable.

`electron-log` also pipes renderer console messages to the same file for unified debugging.

### 6.22 First-run wizard

On first launch, before any UI is shown:

1. **Welcome screen** — short explanation of what FXLedger does.
2. **Data folder** — choose where to store data. Default `%APPDATA%\Ledger`. Tip: *"Pick a folder inside OneDrive, Dropbox, or Google Drive to get free automatic backup."*
3. **Display timezone** — IANA dropdown, defaults to system tz.
4. **First account** — name (default "My Account"), broker (free text), currency (dropdown), starting balance (optional), account type (LIVE/DEMO/PROP). For PROP, an inline rule configurator.
5. **Optional sample data** — checkbox: "Load 20 sample trades so I can explore the dashboard." Cleared with one click later.
6. **Done** — opens the blotter with the sample data or an empty state, then immediately launches the interactive guided tour (module 6.26). The tour can be skipped with one click.

The wizard writes `first_run_complete: true` to `config.json` and is never shown again unless the user resets via Settings.

### 6.23 In-app help system

Every part of the app is self-documenting. A trader who has never used a journal must be able to understand every field, metric, and action without leaving the app.

**Contextual tooltips:**
Every form field, table column header, and dashboard metric has a `?` icon. Hovering or clicking it shows a tooltip with:
- Plain-language definition (no assumed knowledge)
- A concrete example using real trading numbers
- Why it matters for improving their edge

Examples of required tooltips:
- **R-multiple**: "How much profit or loss you made relative to your initial risk. If you risked 50 pips and made 100 pips, your R is +2R. Consistently above +1R means your setups are worth taking."
- **Confluence**: "Additional reasons supporting your trade beyond the main setup. More confluence = higher probability. Example: Order Block + HTF trend alignment + London kill zone = 3 confluence factors."
- **Weighted average entry**: "Your effective entry price when you scaled into the position across multiple fills. Calculated as total cost ÷ total volume."
- **Profit factor**: "Sum of all winning P&L divided by the absolute sum of all losing P&L. Above 1.0 means you are profitable. Above 1.5 is strong. Below 1.0 means you are losing money overall."
- **Max drawdown**: "The largest peak-to-trough drop in your account equity. If you hit $12,000 and then fell to $9,000 before recovering, your max drawdown is $3,000 (25%)."
- **Expectancy**: "Your average profit per trade in R. If your expectancy is +0.4R and you risk $100 per trade, you expect to make $40 on average per trade over a large sample."
- **Breakeven tolerance**: "A trade within ±0.1R of zero is counted as breakeven rather than a win or loss. Prevents noise from distorting win rate."

**Glossary page** (accessible from Help menu or `?` button in any empty state):
A searchable A–Z reference of every trading term used in the app: Asian Kill Zone, Breaker Block, Confluence, Daily Loss Limit, Drawdown, Expectancy, Fair Value Gap, Funded Account, Higher Timeframe, ICT, Kill Zone, Liquidity, Market Structure Shift, Order Block, Profit Factor, R-multiple, Reward:Risk, Scalping, Session, Setup, Slippage, Smart Money Concepts, Stop Loss, Supply and Demand, Swing High/Low, Take Profit, Trailing Drawdown, Win Rate, Wyckoff.

**Keyboard shortcuts overlay** (press `?` anywhere in the app):
A modal listing every shortcut in the app:
- `Ctrl+N` — New trade
- `Ctrl+Alt+L` — Hotkey capture overlay
- `Ctrl+F` — Focus search bar
- `Ctrl+Z` — Undo last soft delete (from blotter)
- `Escape` — Close modal / cancel form
- `Enter` — Submit focused form
- `Tab` / `Shift+Tab` — Navigate form fields
- `Ctrl+P` — Print / PDF current trade (on Trade Detail)
- `Ctrl+Shift+B` — Backup now
- `?` — Open this keyboard shortcuts overlay

**MT4/MT5 Expert Advisor setup guide** (accessible from Settings → Live Bridge → "Setup Guide" button):
A multi-step illustrated guide with numbered steps:
1. In MetaTrader, go to File → Open Data Folder → MQL5 (or MQL4) → Experts
2. Copy `LedgerBridge.mq5` (or `.mq4`) from the path shown by the app into that folder
3. In MetaTrader Navigator panel, refresh and find "LedgerBridge"
4. Drag it onto any chart (symbol does not matter — it monitors all trades)
5. In the EA settings dialog, ensure "Allow DLL imports" and "Allow automated trading" are enabled
6. Click OK — the EA is now running. A green smiley face appears in the chart corner.
7. Return to FXLedger → Settings → Live Bridge → enter the MQL5/Files/Ledger path shown in MetaTrader → Save
8. The status indicator turns green: "Bridge active — watching for trades"

Each step includes a description of what the user should see on screen. The guide detects whether MT4 or MT5 files are being watched and adjusts instructions accordingly.

**In-app update notifications:**
When `electron-updater` detects a new version (check triggered manually from Settings → About or automatically on launch if the user has enabled it), a non-blocking banner appears at the top of every page: *"FXLedger 1.1.0 is available — [View changelog] [Update now] [Dismiss]"*. Clicking "Update now" downloads in the background and prompts to restart. The changelog is a markdown file bundled with the update. Auto-update is off by default; the user enables it in Settings → About.

### 6.24 Risk & lot-size calculator

A persistent, accessible calculator that answers the trader's most important pre-trade question: **"How many lots should I trade?"**

**Access points:**
- Floating button (`⚖`) in the bottom-right corner of the main window on every page
- Keyboard shortcut `Ctrl+Shift+R`
- Inline inside `<TradeForm>` — a "Calculate lot size" link next to the Volume field

**Calculator inputs:**
- Account balance ($) — pre-filled from the active account's current equity
- Risk percentage (%) — e.g. 1%, 2% — remembered between sessions per account
- Entry price — pre-filled from the trade form if open
- Stop loss price — pre-filled from the trade form if open
- Instrument (pair) — pre-filled from the trade form if open; used to look up `pip_size` and `contract_size`

**Calculator outputs:**
- **Recommended lot size** — displayed large and bold
- Risk in pips (stop distance)
- Risk in account currency ($)
- Pip value per lot (so the trader understands the math)
- "Use this lot size" button — fills the Volume field in the open trade form

**Math:**
```
stop_pips   = |entry_price - stop_price| / instrument.pip_size
pip_value   = instrument.pip_size × instrument.contract_size    (for quote = USD)
              (for non-USD quote, pip_value requires conversion — show a note if base currency ≠ account currency)
risk_amount = account_balance × (risk_pct / 100)
lot_size    = risk_amount / (stop_pips × pip_value)
lot_size    = round down to nearest 0.01 (never over-risk)
```

The calculator lives in `src/lib/risk-calc.ts` and is covered by Vitest tests for EURUSD, USDJPY, XAUUSD, and a non-USD-quote pair (GBPJPY with USD account).

**Prop firm integration:** if the active account has a daily loss limit and the risk amount from the calculator would use more than 50% of the remaining daily loss budget, a yellow warning is shown inline: *"This trade risks $X of your $Y remaining daily budget."*

### 6.25 System tray, auto-launch, and startup behavior

The global hotkey and live bridge must work even when the trader has no visible FXLedger window open — they are in MetaTrader or TradingView and want to capture a trade without switching apps.

**System tray:**
- On launch, Electron creates a system tray icon (a small "L" or ledger icon) visible in the Windows taskbar notification area.
- **Closing the main window** (clicking the × button) **hides the window**, it does not quit the app. The tray icon remains. The hotkey remains registered. The bridge watcher keeps running.
- The tray icon has a right-click context menu:
  - **Show FXLedger** — restores the main window
  - **New trade** (`Ctrl+N`) — opens main window focused on the new trade form
  - **Capture overlay** (`Ctrl+Alt+L`) — triggers the hotkey overlay directly
  - **Separator**
  - **Today's P&L**: "+$142.50" (read-only, updated every minute)
  - **Separator**
  - **Quit FXLedger** — the only way to fully exit the process
- Double-clicking the tray icon shows the main window.
- A tray tooltip on hover shows: "FXLedger — Bridge: active | Today: +$142.50"

**Auto-launch on Windows startup:**
- Settings → General → "Launch FXLedger when Windows starts" toggle (default: off).
- Implemented via `app.setLoginItemSettings({ openAtLogin: true })` (Electron's built-in API — no registry manipulation needed).
- When auto-launched, the app starts **hidden** (no window shown). The tray icon appears. The bridge and hotkey are active. The trader opens the window only when they need to review trades.

**Startup sequence:**
1. App starts (from desktop icon or auto-launch)
2. Config loaded, data folder verified
3. DB initialized (migrations applied, integrity check run)
4. IPC handlers registered
5. Hotkey registered
6. Bridge watcher started
7. Tray icon created
8. If `first_run_complete = false` → show first-run wizard
9. If auto-launched → stay hidden; else → show main window

**Database integrity check on startup:**
Run `PRAGMA integrity_check` and `PRAGMA foreign_key_check` on every launch. If the DB is healthy, proceed silently. If corrupted, show a modal: *"Your database may be corrupted. Would you like to restore from your most recent backup?"* with buttons: "Restore latest backup" and "Continue anyway (not recommended)."

### 6.26 Interactive guided tour

Shown once, immediately after the first-run wizard completes (or when triggered manually from Help → "Take the tour again").

A step-by-step overlay tour using a spotlight technique: the rest of the screen is dimmed, and the highlighted element is called out with a popover explaining what it is. Navigation: "Next →", "← Back", "Skip tour", step counter (e.g. "3 of 8").

**Tour steps (8 total):**

1. **The blotter** — *"This is your trade journal. Every trade you log or import appears here as a row. Click any row to open the full trade detail."*
2. **+ New Trade button** — *"Click this — or press Ctrl+N — to manually log a trade. Use this for historical trades or when you want to record context before the broker confirms."*
3. **The hotkey** — *"Press Ctrl+Alt+L from anywhere on your screen — even while TradingView is open — to instantly capture a screenshot and log a trade in under 12 seconds."*
4. **Import** — *"Already have a history? Drag your MT4 or MT5 statement HTML onto the Import page and FXLedger will parse every trade automatically."*
5. **The dashboard** — *"Once you have trades logged, this page reveals your edge: win rate, profit factor, best setups, best sessions, mistake patterns."*
6. **The risk calculator** — *"Use this before every trade — press Ctrl+Shift+R — to calculate the exact lot size that risks only 1% (or your chosen %) of your account."*
7. **The prop firm banner** — *"If this account is a prop account, a warning banner appears here when you approach your daily loss or drawdown limit."*
8. **Daily review** — *"After every session, run the daily review — it takes 3 minutes and turns your journal into a coaching tool."*

Tour state is stored in `settings` table as `tour_completed = '1'`.

### 6.27 Session clock & quick-stats header strip

A persistent horizontal strip below the top navigation bar, visible on every page (blotter, dashboard, import, review, settings).

**Left section — Session clock:**
- Current forex session label: **London Kill Zone**, **NY Open Kill Zone**, **Asian Kill Zone**, **London Close**, **Between Sessions**, etc.
- Computed from display timezone via `lib/tz.ts` (DST-safe)
- Countdown timer: *"Ends in 1h 23m"* or *"Next: NY Open in 45m"*
- Color-coded: green for active kill zones, grey for off-hours

**Center section — Today's stats (active account):**
- Today's P&L: `+$142.50` (green) or `−$85.00` (red)
- Today's trades: `4 trades`
- Win rate today: `75%`
- All computed from trades closed today in the active account's display timezone

**Right section — Account health:**
- For PROP accounts: daily loss used `2.1% / 5%`, drawdown `3.4% / 10%` — color shifts yellow at 80%, red at 95%
- For non-PROP accounts: current equity (last known balance snapshot)
- Account switcher dropdown (same as top bar, duplicated here for convenience)

The strip is collapsible (click an arrow to hide it, preference saved to settings). It refreshes on a 60-second interval and immediately after any trade save or import commit.

---

## 7. The P&L engine — `src/lib/pnl.ts`

The most safety-critical module. Build and test it before anything depends on it.

**Public API:**

```ts
export interface TradeMetrics {
  status: 'OPEN' | 'PARTIAL' | 'CLOSED';
  weightedAvgEntry: number | null;
  weightedAvgExit: number | null;
  netPips: number | null;
  netPnl: number | null;          // includes commission + swap
  rMultiple: number | null;        // null if initial_stop_price missing
  totalEntryVolume: number;
  totalExitVolume: number;
  remainingVolume: number;
  holdingTimeMs: number | null;
  openedAtUtc: string | null;
  closedAtUtc: string | null;
  result: 'WIN' | 'LOSS' | 'BREAKEVEN' | null;
}

export function computeTradeMetrics(
  trade: Trade,
  legs: TradeLeg[],
  instrument: Instrument,
  opts?: { breakevenTolerance?: number }   // default ±0.1R
): TradeMetrics;

export interface AggregateMetrics {
  totalTrades: number;
  closedTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number;
  netPnl: number;
  averageR: number | null;
  expectancy: number | null;
  profitFactor: number | null;
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpePerTrade: number | null;
  equityCurve: { timestamp: string; equity: number; drawdown: number }[];
}

export function computeAggregateMetrics(
  trades: Array<{ trade: Trade; legs: TradeLeg[]; instrument: Instrument }>,
  startingBalance: number
): AggregateMetrics;
```

**Math rules:**

- `weightedAvgEntry = Σ(entry.price × entry.volume) / Σ(entry.volume)`
- `weightedAvgExit  = Σ(exit.price × exit.volume) / Σ(exit.volume)`
- For LONG: `netPips = (avgExit − avgEntry) / instrument.pip_size`
- For SHORT: `netPips = (avgEntry − avgExit) / instrument.pip_size`
- For LONG: `rMultiple = (avgExit − avgEntry) / (avgEntry − initial_stop_price)`. Null if `initial_stop_price` missing.
- For SHORT: sign-flipped.
- `netPnl` is taken from broker-supplied profit fields on each leg if present (sum across legs); otherwise computed from price diff × volume × contract_size, plus commission and swap from every leg.
- `status`: no exits → OPEN; exit volume < entry volume → PARTIAL; exit volume = entry volume → CLOSED.
- `result`: null if not CLOSED. Else: WIN if `netPnl > breakevenTolerance × |1R|`, LOSS if `netPnl < -breakevenTolerance × |1R|`, else BREAKEVEN.
- `maxDrawdown`: walk the equity curve, track running peak, the largest `(peak - current)` is the drawdown. Returned in account currency and as a percentage of the peak.

**Required test cases** (in `tests/pnl.test.ts`, all must pass):

1. Long winner on EURUSD (single entry, single exit)
2. Short winner on EURUSD
3. Long winner on USDJPY (verifies pip_size 0.01)
4. Long winner on GBPJPY
5. Long winner on XAUUSD (verifies pip_size 0.1)
6. Long winner on XAGUSD (pip_size 0.001)
7. Long with one partial exit at 50% volume, then final exit
8. Long with two partial exits (33%, 33%) and final 34%
9. Long with two scale-in entries, single full exit (weighted avg entry)
10. Long with two scale-in entries and two partial exits
11. Short loser hitting stop exactly (rMultiple = -1)
12. Long winner exactly at 1R (rMultiple = 1)
13. Breakeven trade (rMultiple ≈ 0, result = BREAKEVEN)
14. Trade with no `initial_stop_price` (rMultiple = null, everything else valid)
15. Open trade (no exits) — netPips/netPnl/rMultiple null, status OPEN
16. Partial trade (some exit volume but not all) — status PARTIAL, metrics on closed portion
17. Trade with non-zero commission and swap on every leg (netPnl includes them)
18. Trade with broker-supplied profit on each leg (netPnl uses broker values, not computed)
19. Trade with negative swap (overnight short on a high-yielder)
20. Aggregate: empty trade list → zero stats, no NaNs
21. Aggregate: all winners → win rate 100%, profit factor = Infinity handled gracefully
22. Aggregate: all losers → win rate 0%, profit factor = 0
23. Aggregate: max drawdown on a clear peak-to-trough series ($10000 → $12000 → $9000 → $11000 → $8000) = $4000
24. Aggregate: max drawdown percentage on the same series = 33.33%
25. Aggregate: profit factor with mixed wins and losses
26. Aggregate: expectancy in R for a series including null-R trades (excluded from R calc)
27. Aggregate: equity curve has one point per trade close, in chronological order

`lib/pnl.ts` is the **only** place P&L math lives. Any inline math in a component is a bug.

---

## 8. Hard rules

These rules are not negotiable.

1. **No timestamp arithmetic without `date-fns-tz`.** Never hardcode UTC offsets. DST will break hardcoded offsets twice a year.
2. **All timestamps in the DB are UTC ISO-8601 strings.** Display tz is a user setting.
3. **No P&L computation outside `lib/pnl.ts`.** No exceptions.
4. **Every code path in `lib/pnl.ts` has a Vitest test.** P&L bugs are unforgivable.
5. **Every importer parse failure logs the row and continues.** Never abort an import on a single bad row.
6. **Every database write goes through drizzle.** No raw SQL strings in routes or components. (Migrations and FTS triggers are the only allowed exception, in `lib/db/`.)
7. **All file paths in DB are relative to the configured data dir.** Never store absolute paths.
8. **The data dir is read from `config.json` on every launch.** Moving the folder must not break references.
9. **Manual entry and importer trades are indistinguishable downstream.** Same P&L engine, same blotter renderer, same dashboard aggregation. The only difference is the `source` field and external IDs.
10. **Soft delete only from the UI.** Hard-delete is only available from the Trash view.
11. **No telemetry, no analytics, no network calls.** The only network call ever permitted is the optional auto-update check, which is off by default.
12. **electron-log never logs note content, screenshots, or trade prices.** Privacy is non-negotiable.
13. **The instrument's `pip_size` is the only source of pip math.** Never hardcode `0.0001` anywhere.
14. **Every change to a trade creates an audit_log entry.** Including bulk operations (one entry per affected trade).
15. **Reconciliation merges preserve the original trade id.** Audit history must survive the merge.
16. **The TradeForm component is reused** across manual entry, hotkey overlay, and trade detail. Build once.
17. **Tests run in CI on every commit.** Vitest in pre-commit hook is recommended.
18. **All user-facing form validation uses Zod schemas.** Errors surface as inline messages below the relevant field — never as `window.alert()`, never as a generic "Something went wrong." Every Zod schema lives in `src/lib/schemas.ts`. The same schemas validate IPC handler inputs in the main process.
19. **The system tray icon is always present when the app is running.** Closing the main window hides it; it does not quit the process. The only way to fully quit is via the tray context menu → "Quit FXLedger" or `app.quit()` from the about page.

---

## 9. Acceptance criteria

The journal is done when a trader can do all of the following on a clean Windows install, end-to-end, without bugs:

1. Install the `.exe`, click the desktop icon, complete the first-run wizard, and arrive at an empty (or sample-populated) blotter in under 10 seconds.
2. Configure a PROP account with FTMO Phase 1 rules ($10k, 5% daily loss, 10% max drawdown) and see the prop firm banner go yellow when daily P&L hits −2.5%.
3. Press `Ctrl+Alt+L` in front of any chart, fill the overlay form in under 12 seconds, and see the trade appear in the blotter as OPEN with a screenshot attached.
4. Drag an MT5 detailed statement HTML onto the Import page, see the preview with new/duplicate/merge/failed buckets, click Import, and see hundreds of trades populate with correct pip math for EURUSD, USDJPY, and XAUUSD.
5. Drag an MT4 detailed statement HTML and have it parse just as cleanly.
6. Drop a generic broker CSV with non-standard column ordering and have the fuzzy header matcher handle it.
7. Watch a live trade close in MT5 and see it appear in the blotter within 5 seconds via the bridge, with a toast notification.
8. Have a manually-logged live trade get merged automatically with its broker version when the statement is imported the next day.
9. Open any trade, paste a screenshot from clipboard with `Ctrl+V`, type a markdown note in the timeline, tag confluence and mistakes, and see autosave handle everything with no save button.
10. Add a second timestamped note to the same trade a week later without overwriting the first.
11. Multi-select 50 trades in the blotter and bulk-tag them with "ICT 2022" in one action — and see 50 audit log entries.
12. Open the Dashboard, see all 10 widgets render correctly, and verify max drawdown matches a hand-calculated value.
13. Filter the blotter by `tag:fomo symbol:gbpjpy -tag:revenge` and see only matching trades.
14. Run the daily review workflow, save it, and find it in the reviews sidebar a week later.
15. Soft-delete a trade by mistake, find it in Settings → Trash, restore it, and see the audit log show CREATE → DELETE → RESTORE.
16. Click "Backup now", restore from that backup on a different machine, and have everything intact including screenshots.
17. Move the data folder to a OneDrive path via Settings → Data folder, restart the app, and have everything still work.
18. Import a ForexFactory CSV, run "Re-tag trades with news context", and see the news badge appear on trades that occurred near red-folder events.
19. Generate a per-trade PDF and a date-range summary PDF that look professional enough to email to a mentor.
20. Open the History tab on any trade and see every change ever made to it.

21. Close the main window — confirm the tray icon remains in the taskbar. Press `Ctrl+Alt+L` — confirm the capture overlay appears. Right-click the tray icon → confirm "Today's P&L" shows the correct amount. Select "Quit FXLedger" → confirm the process exits fully.
22. Open the risk calculator (`Ctrl+Shift+R`), enter account balance $10,000, risk 1%, entry 1.0850, stop 1.0800 on EURUSD — confirm it outputs 0.20 lots. Click "Use this lot size" — confirm the Volume field in the open trade form is filled with 0.20.
23. Hover over the "R-multiple" column header in the blotter — confirm a tooltip appears explaining what R-multiple means. Hover over "Profit factor" on the dashboard — confirm a tooltip appears with a plain-language definition and example.
24. Import a broker statement with 500+ trades — confirm a progress bar is visible during parsing and the UI does not appear frozen at any point.

When all 24 criteria pass on a clean Windows machine with no manual intervention beyond the documented user actions, the journal is shipped.

---

## 10. How to actually build this

This brief is the complete spec. The code in this repository contains:

- `schema.sql` — full DDL (the truth)
- `package.json` — every dependency, ready to `npm install`
- `electron/main.ts`, `electron/preload.ts` — Electron shell skeleton
- `src/lib/pnl.ts` — full P&L engine implementation (done — do not rewrite, only extend)
- `tests/pnl.test.ts` — full test suite for the P&L engine (must pass before any feature work)
- `src/lib/tz.ts` — timezone and session detection (done)
- `src/lib/importers/headers.ts` — fuzzy header matcher (done)
- `src/lib/importers/mt5-html.ts` — MT5 statement parser (done)
- `src/lib/importers/mt4-html.ts` — MT4 statement parser (done)
- `src/lib/db/schema.ts` — drizzle schema mirroring `schema.sql`
- `electron/mql/LedgerBridge.mq5` — MT5 Expert Advisor (done)
- `electron/mql/LedgerBridge.mq4` — MT4 Expert Advisor (done)
- `README.md` — install + run + build instructions

Everything else (routes, components, IPC handlers, dashboard widgets) is yours to scaffold using Claude Code with this brief as the source of truth. Open the project in Claude Code, point it at `PROJECT_BRIEF.md`, and tell it to build the next module from Section 6 in order. The done modules listed above are the load-bearing pieces that have to be right; everything else is React component work that AI assistance handles fluently.

The order of build:

1. `npm install` and verify the existing tests pass with `npm test`.
2. `npm run dev` to confirm the Electron shell launches.
3. Build the drizzle migration runner and seed data on first launch (Settings module 6.18 wizard 6.22).
4. Build the manual entry form (`<TradeForm>`) — module 6.3.
5. Build the blotter — module 6.7.
6. Build the trade detail page using the same `<TradeForm>` — module 6.8.
7. Wire up the importer UI — module 6.4.
8. Wire up reconciliation in the import flow — module 6.9.
9. Build the dashboard widgets — module 6.12.
10. Build the hotkey overlay — module 6.6.
11. Build the live bridge watcher — module 6.5.
12. Build the daily/weekly review pages — module 6.13.
13. Build prop firm guardrails — module 6.14.
14. Build the calendar import + tagging — module 6.15.
15. Build reports/PDF — module 6.16.
16. Build backup/restore — module 6.17.
17. Polish: trash, audit log UI, search UX, empty states, keyboard shortcuts, print views.
17a. System tray + auto-launch on startup — module 6.25.
17b. Risk & lot-size calculator — module 6.24. Add `src/lib/risk-calc.ts` and Vitest tests first.
17c. In-app help system: tooltips on every field, glossary page, keyboard shortcuts overlay, MT4/MT5 EA setup guide, update notification banner — module 6.23.
17d. Interactive guided tour — module 6.26.
17e. Session clock & quick-stats header strip — module 6.27.
18. Package with electron-builder — verify all 24 acceptance criteria — ship.

There is no v1, no v2, no phase. There is one product. Build it.
