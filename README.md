# FXLedger — Forex Trading Journal

> A local-first, institutional-grade trading journal for Windows. No cloud, no login, no subscription, no telemetry. Your data never leaves your machine.
>
> **Status:** v1.0.7 — Critical bug-fix release. 270/270 unit tests passing. Calendar auto-sync ready.

[![Download](https://img.shields.io/badge/Download-Latest%20Release-blue?style=for-the-badge&logo=windows)](https://github.com/ikebude/FX-Trading-Journal/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11-lightgrey?style=for-the-badge&logo=windows)](https://github.com/ikebude/FX-Trading-Journal/releases/latest)

---

## What Is FXLedger?

FXLedger is a professional forex trading journal designed for serious traders who want full control of their data. It runs entirely on your Windows PC — no account required, no internet needed after installation.

**Key principles:**

- **Local-first.** Your journal database lives in `%APPDATA%\Ledger\` — a single folder you can back up, move to Dropbox, or copy to a new machine.
- **Live bridge.** Trades from MetaTrader 4/5 appear in your journal the instant they open, giving you time to add context *while you're in the trade*.
- **Institutional analytics.** R-multiples, equity curves, session heatmaps, profit factor, setup performance — the metrics you'd expect from a prop firm evaluation platform.
- **Zero compromise on privacy.** No telemetry, no analytics, no cloud. The only outbound network request ever made is the optional auto-update check, which is off by default.

---

## Download & Install

### System Requirements

| Requirement | Minimum |
|---|---|
| Operating System | Windows 10 (64-bit) or Windows 11 |
| RAM | 4 GB |
| Disk Space | 500 MB (plus your screenshots) |
| Display | 1280×720 minimum, 1920×1080 recommended |
| MetaTrader | MT4 or MT5 (optional, for live bridge) |

### Download

**[⬇ Download FXLedger Setup (latest release)](https://github.com/ikebude/FX-Trading-Journal/releases/latest)**

Download `FXLedger-Setup-x.x.x.exe` from the Assets section of the latest release.

### Installation Steps

1. Run `FXLedger-Setup-x.x.x.exe`.
2. If Windows shows a SmartScreen warning ("Windows protected your PC"), click **More info → Run anyway**. FXLedger is not digitally signed (no subscription required for the certificate), but the source code is fully open and auditable.
3. Choose your installation directory (default: `C:\Program Files\FXLedger`).
4. Click **Install**. The installer creates a desktop shortcut and Start Menu entry.
5. Launch **FXLedger** from the desktop shortcut.

On first launch, FXLedger runs the guided setup tour (about 30 seconds). After that, you're in the main blotter.

**Latest release:** [**v1.0.7**](https://github.com/ikebude/FX-Trading-Journal/releases/tag/v1.0.7) — April 20, 2026. See [CHANGELOG.md](CHANGELOG.md) for release notes.

### Uninstalling

Go to **Settings → Apps → FXLedger → Uninstall**, or run `Uninstall FXLedger.exe` in your installation folder. Your data folder (`%APPDATA%\Ledger\`) is **not** deleted during uninstall — your trades are preserved. Delete the folder manually if you want a clean removal.

---

## Quick Start

### 1. Create Your First Account

Click **New Trade → Accounts** (or go to **Settings → Accounts**) and create your first trading account. Specify:
- Account name (e.g., "ICMarkets Live")
- Broker name
- Account type (LIVE / DEMO / PROP)
- Initial balance

### 2. Log a Manual Trade

Press **New Trade** in the top bar, or use the keyboard shortcut **Ctrl+Alt+L** to open the overlay.

Fill in:
- **Symbol** — EURUSD, XAUUSD, US30, etc.
- **Direction** — LONG or SHORT
- **Entry price, lots, timestamp**
- **Stop loss price** (enables R-multiple calculation)
- **Setup name** (optional but recommended for analytics)

Click **Save**. The trade appears in the blotter immediately.

### 3. Import a Statement

Go to **Import** (sidebar) and drag your MT4 or MT5 HTML statement onto the import area. FXLedger parses the statement, shows you a preview of what will be imported, and lets you confirm before committing. Any rows that can't be parsed are listed separately so nothing is silently dropped.

### 4. Set Up the Live Bridge (Optional)

See [Live Bridge Setup](#live-bridge-setup) below. This is the most powerful feature — trades appear in your journal the instant MetaTrader opens them, so you can add your setup notes and screenshots while you're still in the trade.

---

## Features

### Trade Blotter

The main view shows all your trades in a fast virtualized table.

- **Columns:** Direction badge, Symbol, Open time, Close time, Lots, Pips, P&L, R-multiple, Status, Setup name
- **Filters panel** (toggle with the sliders icon): filter by status, direction, symbol, setup, session, date range, P&L range, tags
- **FTS5 full-text search:** type in the search bar to search across symbols, notes, setup names, and tags in milliseconds
- **Bulk select:** check multiple rows (or the header checkbox to select all) to perform bulk actions — Move to Trash
- **Pagination:** 100 trades per page with prev/next controls
- **Live badge:** trades from the MT4/MT5 bridge show a pulsing green "LIVE" badge while open

Click any row to open the trade detail drawer.

### Trade Detail Drawer

Everything about a trade in one panel:

- **Edit** any field: setup name, entry model, market condition, confidence (1–5), pre/post-trade emotion, notes
- **Add screenshots:** paste from clipboard (Ctrl+V), or use the **Capture** button (Ctrl+Alt+L) to snap the MT4/5 chart
- **Entry/Exit legs table:** all partial fills and scale-ins/outs with their timestamps, prices, and volumes
- **Calculated metrics:** net pips, net P&L, R-multiple, commission, swap, weighted avg entry/exit
- **News tags:** any economic events that occurred while the trade was open are automatically tagged (requires calendar import)
- **Audit log:** every change to the trade is recorded with a timestamp

### Dashboard

Go to **Dashboard** for a performance overview across any date range and account:

| Widget | What it shows |
|---|---|
| Equity Curve | Cumulative P&L over time |
| Drawdown | Running drawdown from peak (shaded area) |
| Win Rate | Win / Loss / BE split as donut chart |
| Profit Factor | Gross profit ÷ gross loss |
| Expectancy | Expected P&L per trade |
| R Distribution | Histogram of R-multiples |
| Setup Performance | Win rate and avg R per setup name |
| Session Performance | Win rate by London/NY/Asian/Off-hours session |
| Day Heatmap | P&L by day of week |
| Hour Heatmap | P&L by hour of day |

### Reviews

Go to **Reviews** to write daily or weekly trade reviews with markdown support. Reviews are linked to the date range they cover and stored alongside your trades.

### Calendar

Go to **Calendar** to see your trades alongside high-impact economic news events. FXLedger **automatically syncs** the ForexFactory economic calendar every 4 hours (configurable from 1–24 hours). Trades are automatically tagged with relevant news events that occurred within 15 minutes of entry/exit. You can also manually import ForexFactory CSV if preferred.

### Reports

Go to **Reports** to generate:

- **Per-trade PDF** — all trade details, screenshots, entry/exit table, and metrics on one page
- **Date range summary PDF** — equity curve, statistics table, and trade list for any period
- **CSV export** — export filtered trades to CSV for further analysis in Excel

### Hotkey Overlay

Press **Ctrl+Alt+L** anywhere on your screen (even while MetaTrader is focused) to open a compact 420×640 overlay. The overlay lets you:

- Log a new trade quickly without switching windows
- Capture a screenshot of the chart that's behind the overlay
- The overlay auto-hides when you click elsewhere

Change the hotkey in **Settings → General**.

### Backup & Restore

- **Auto-backup:** FXLedger creates a ZIP backup of your database automatically when you close the app.
- **Manual backup:** Settings → Backup → Backup Now creates an immediate backup.
- **Restore:** Settings → Backup → select a backup → Restore. The backup ZIP contains your full database and all screenshots.

Your backups live in `%APPDATA%\Ledger\backups\`. For cloud redundancy, move your data folder to OneDrive or Dropbox via Settings → Data.

---

## Live Bridge Setup

The live bridge lets MetaTrader 4 or 5 send trades to FXLedger in real time using a bundled Expert Advisor (EA). When you open a position in MT4/MT5, FXLedger sees it within seconds and creates an OPEN trade. You add your "why" notes, screenshots, and setup details while the trade is live. When you close the position, FXLedger updates the same trade record with the exit price and P&L — all your annotations are preserved.

### Step 1: Copy the Expert Advisor

After installing FXLedger, the EA files are at:
```
%USERPROFILE%\Documents\FXLedger\mql\LedgerBridge.mq5   (for MT5)
%USERPROFILE%\Documents\FXLedger\mql\LedgerBridge.mq4   (for MT4)
```

**For MetaTrader 5:**
1. In MT5, press **F4** to open MetaEditor.
2. In MetaEditor, navigate to `File → Open Data Folder`. This opens the MT5 data directory.
3. Navigate to `MQL5\Experts\`.
4. Copy `LedgerBridge.mq5` into that folder.
5. Back in MetaEditor, press **F7** to compile. You should see "0 errors, 0 warnings".
6. In MT5, open the **Navigator** panel (Ctrl+N), expand **Expert Advisors**, and drag **LedgerBridge** onto any chart.
7. In the EA settings dialog:
   - Enable **Allow DLL imports** — not required for this EA
   - Enable **Allow automated trading**
   - Click OK

**For MetaTrader 4:**
Same steps but use `MQL4\Experts\` and `LedgerBridge.mq4`.

### Step 2: Configure the Bridge in FXLedger

1. In FXLedger, go to **Settings → Live Bridge**.
2. In the **Watch Directory** field, enter the path to the `Ledger` folder inside your MT4/MT5 data directory. Example:
   ```
   C:\Users\YourName\AppData\Roaming\MetaQuotes\Terminal\<hash>\MQL5\Files\Ledger
   ```
   To find the correct path: in MT5, press **F4 → File → Open Data Folder**, then navigate to `MQL5\Files\Ledger\`. Copy that path.
3. Click **Set & Start Watching**. The status indicator should turn green: **Running**.

### Step 3: Verify It's Working

1. Open a position in MT4/MT5 on any symbol.
2. Within 5 seconds, you should see a toast notification in FXLedger: *"EURUSD LONG — position opened"*.
3. The trade appears in the blotter with a pulsing green LIVE badge.
4. Add your notes and screenshots now, while the trade is live.
5. When you close the position in MT4/MT5, the trade updates automatically with the exit price and P&L.

### Troubleshooting the Bridge

| Symptom | Cause | Fix |
|---|---|---|
| No trades appearing after EA attaches | Watch directory is wrong | Copy the path from MT5's Open Data Folder |
| EA compiles but shows "not authorized" | AutoTrading is disabled | Click the AutoTrading button in the MT5 toolbar |
| Trades appear but duplicate on reimport | Normal behaviour — deduplication is automatic | No action needed |
| EA shows an error in the Journal tab | Check the MT5 Journal for details | Most common: wrong file permissions on the Ledger folder |

---

## Settings Reference

| Setting | Description |
|---|---|
| Theme | Dark / Light / System |
| Display Timezone | All timestamps in the app are displayed in this IANA timezone |
| Launch on startup | Start FXLedger when Windows logs in |
| Auto-update | Check for new versions on startup (off by default; requires internet) |
| Hotkey | Global shortcut to open the capture overlay (default: Ctrl+Alt+L) |
| Watch Directory | MT4/5 files folder for the live bridge |
| Backup | Manual backup and restore controls |
| Data Folder | Location of your FXLedger data (database + screenshots + backups) |

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Alt+L` | Open capture overlay (global, works in any app) |
| `?` | Show keyboard shortcuts reference |
| `N` | New trade (when blotter is focused) |
| `Esc` | Close any open drawer or dialog |
| `Ctrl+Z` | Undo last trade edit (in trade form) |
| `←` / `→` | Previous / next trade in the detail drawer |

---

## Data Folder Layout

```
%APPDATA%\Ledger\
├── ledger.db              ← SQLite database (all your trades)
├── config.json            ← App settings (timezone, theme, hotkey, etc.)
├── screenshots\           ← Trade screenshots (WebP format)
│   └── unmatched\        ← Screenshots not yet linked to a trade
├── bridge\
│   ├── inbox\            ← MT4/5 EA writes trade JSON files here
│   ├── processed\        ← Successfully processed bridge files
│   └── failed\           ← Bridge files that couldn't be parsed
├── imports\               ← Uploaded statement files
├── backups\
│   └── auto\            ← Automatic backups on close
├── calendar\              ← Imported ForexFactory CSV files
├── reports\               ← Generated PDF reports
└── logs\                  ← Application log files
```

To move your data folder to a different location (e.g., OneDrive or a different drive):
1. Go to **Settings → Data → Open Folder**.
2. Copy the entire `Ledger\` folder to the new location.
3. In Settings → Data → Data Folder path, paste the new path and click Save.
4. Restart FXLedger. It will use the new location on next launch.

---

## Privacy & Security

- **No network calls** — FXLedger makes zero outbound connections unless you enable auto-update in Settings.
- **No telemetry, no analytics.** Period. The source code is public — verify for yourself.
- **No login required.** There is no account, no email, no password.
- **All data is on your machine.** The database is a standard SQLite file you can open with any SQLite browser.
- **electron-log never records trade content, notes, or screenshots.** Log files only contain operational events (startup, file errors, bridge status).
- **Sandboxed renderer.** The renderer process runs in a sandboxed Electron context with contextIsolation enabled. The IPC bridge only exposes whitelisted methods.

---

## Building from Source

**Prerequisites:**
- Node.js 20+
- npm 10+
- Windows (for packaging — development works on macOS/Linux too)

```bash
git clone https://github.com/ikebude/FX-Trading-Journal.git
cd FX-Trading-Journal
npm install
npm run dev          # Start development server (hot reload)
npm test             # Run test suite (165 tests across 6 suites)
npm run typecheck    # TypeScript type check
npm run build        # Build renderer + main (no installer)
npm run package:win  # Build Windows NSIS installer → release/
```

The packaged installer will be at `release/FXLedger Setup x.x.x.exe`.

### Project Structure

```
electron/
  main.ts          ← Electron main process (window, hotkey, tray, IPC registration)
  preload.ts       ← Typed IPC bridge (all renderer↔main channels)
  ipc/             ← IPC handler modules (one per domain)
  services/        ← Long-running services (bridge-watcher, backup)
  mql/             ← MT4 + MT5 Expert Advisors
src/
  lib/
    pnl.ts         ← P&L engine (single source of truth, fully tested)
    tz.ts          ← Timezone + session detection (DST-safe, IANA only)
    db/
      schema.ts    ← Drizzle ORM schema (18 tables)
      queries.ts   ← All database queries
    importers/     ← MT4/MT5 HTML statement parsers, CSV importer
  pages/           ← Route components
  components/      ← Reusable UI components
tests/
  pnl.test.ts          ← P&L engine tests
  tz.test.ts           ← timezone / session detection
  importers.test.ts    ← MT4/MT5/CSV importer fixtures
  reconcile.test.ts    ← import ↔ manual-trade reconciliation
  risk-calc.test.ts    ← lot-size / R calculator
  prop-firm.test.ts    ← prop-firm rule evaluation
  e2e/                 ← Playwright-Electron acceptance suite
schema.sql         ← SQLite DDL source of truth
```

---

## FAQ

**Q: Can I use FXLedger with a broker other than MetaTrader?**
> Yes. The statement importer supports MT4 HTML statements, MT5 HTML statements, and generic CSV. For live tracking you need MT4 or MT5. Other platforms can be logged manually or imported via CSV.

**Q: Is there a mobile app?**
> No. FXLedger is a Windows desktop app only. The data folder can be synced to a phone via OneDrive/Dropbox for viewing, but the app itself is Windows-only.

**Q: Can I have multiple trading accounts?**
> Yes. Create as many accounts as you need in Settings → Accounts. Each account has its own analytics, and the account selector in the top bar filters the entire app to that account.

**Q: How do I back up to the cloud?**
> Move your data folder to a OneDrive or Dropbox folder via Settings → Data. All your trades, screenshots, and backups will sync automatically.

**Q: Where are my screenshots stored?**
> In `%APPDATA%\Ledger\screenshots\`. Each screenshot is a WebP file named with a random ID. They are linked to their trade in the database.

**Q: Can I delete a trade permanently?**
> Yes. Deleting from the blotter moves it to Trash (soft-delete). Go to **Trash** in the sidebar to permanently delete trades. Hard-delete cannot be undone.

**Q: Why does the installer show a SmartScreen warning?**
> FXLedger is not code-signed with an Extended Validation certificate (these cost hundreds of dollars per year). The source code is fully public — you can review, build, and verify it yourself. Click "More info → Run anyway" to proceed.

**Q: Does FXLedger work without MetaTrader?**
> Fully. You can log every trade manually and import statements. The live bridge is optional.

**Q: How do I report a bug or request a feature?**
> Open an issue at [github.com/ikebude/FX-Trading-Journal/issues](https://github.com/ikebude/FX-Trading-Journal/issues).

---

## v1.1.0 Roadmap (Target: May 30, 2026)

v1.1.0 is a **production-grade release** adding 121 new features (29 P0 + 92 P1 scenarios) across 6 weeks. Key highlights:

### Foundation & Core (Week 1)
- ✅ **Balance Reconciliation** — Detect and correct account equity drift from deposits, withdrawals, credits, charges, and bonuses. Persistent banner alerts users.
- ✅ **Account Metadata** — Track broker, platform (MT4/MT5), server, leverage, timezone, login per account.
- ✅ **EA Bridge v2** — Capture all deal types (BALANCE/CREDIT/CHARGE/CORRECTION/BONUS) with 30-day backward compatibility window.
- ✅ **Trade-Form P0** — Symbol combobox + setup combobox + take-profit field in both quick and full forms.
- 🔄 **Security Sweep** — Zip-slip protection, CSP tightening, permission handlers, EXIF stripping on screenshots.
- 🔄 **News Calendar Auto-Sync** — 4-hour pull from ForexFactory feed with configuration toggle.

### Libraries & Discipline (Week 2)
- 🔄 **Setup Library CRUD** — Create/edit/version setups with performance tracking. Dropdown everywhere on the form.
- 🔄 **Methodology Tags** — Pre-built taxonomies (SMC, ICT, Wyckoff, Elliott, Harmonic, Session Bias).
- 🔄 **Prop Firm Presets** — FTMO, MFF, Topstep, E8, FundedNext, The5ers rule engines with daily loss breaker.
- 🔄 **Risk Enforcement** — 1% rule, open-risk aggregation, pre-trade simulation modal.
- 🔄 **Theme & Accessibility** — Light/dark/system toggle, reduced-motion, color-blind safe palette.
- 🔄 **Modified Dietz Equity Curve** — Accounts for deposits/withdrawals/bonuses with visual overlay.

### Analytics Depth (Week 3)
- 🔄 **Advanced Metrics** — Sharpe, Sortino, Calmar, Recovery Factor, Expectancy variance + confidence intervals.
- 🔄 **MAE / MFE** — Capture high/low watermarks during trade life; scatter plot widget.
- 🔄 **Session × Day-of-Week Cross** — P&L by session × weekday, time-of-day curve, duration-vs-outcome.
- 🔄 **Setup Edge Degradation** — Rolling 30-trade expectancy threshold with red flag alerts.
- 🔄 **Discipline Detectors** — Revenge-trade, tilt, overtrading alerts; anxiety slider; mood check-ins.
- 🔄 **Post-Mortem Mode** — Blown-account autopsy with root-cause analysis of drawdowns.

### Imports & UX (Week 4)
- 🔄 **Multi-Broker Importers** — cTrader, MatchTrader/DXtrade (FundedNext/E8), IBKR Flex Query CSV/XML.
- 🔄 **PDF Reports** — Monthly trader reports (8-page layout), prop firm submission bundles.
- 🔄 **Command Palette** — Global hotkey (Cmd-K), keyboard shortcut overlay (`?`), bulk blotter ops.
- 🔄 **E2E Acceptance Suite** — 25 new Playwright tests covering balance reconciliation, prop rule breaches, multi-import, zip-slip.

### Multi-Account & Portfolio (Week 5)
- 🔄 **Portfolio Dashboard** — Consolidated equity curve across linked accounts with FX conversion.
- 🔄 **Cross-Account Risk** — Detect hedges and correlated positions across accounts; per-account prop rules.
- 🔄 **Advanced Importers** — Edgewonk, TradeZella, TraderVue migration; PDF broker statement reconciler.
- 🔄 **Payout Tracking** — Track funded account payouts; weekend close-all enforcement; consistency rule tracker.
- 🔄 **Scale-Out Planner** — Plan TP1/TP2/TP3 at entry; track realized vs plan.

### Intelligence & Security (Week 6)
- 🔄 **Voice Memos** — Ctrl+Alt+V records up to 60s; local Whisper.cpp transcription attached to trade.
- 🔄 **Trade Search** — Local embeddings (Sentence-Transformers ONNX) + natural-language blotter queries.
- 🔄 **Screenshot OCR** — Tesseract.js indexes chart text; searchable in full-text search.
- 🔄 **End-of-Day Coaching** — Rule-based insights ("you exited 3 of 4 winners before 1R today").
- 🔄 **Advanced Security** — Encrypted data folder (opt-in), Windows Hello unlock, screenshot redaction, cryptographic audit seal.
- 🔄 **Global Support** — RTL layouts, CJK fonts, regional holidays, locale-aware number/date formats.

**Progress:** T1.1–T1.7 complete (foundation + trade-form). T1.8–T6.11 in pipeline.  
**Current:** v1.0.7 (v1.0.6 + critical bug-fix & UX sweep).  
**Full plan:** [docs/superpowers/plans/2026-04-19-v1.1-implementation.md](docs/superpowers/plans/2026-04-19-v1.1-implementation.md)  
**Spec:** [docs/superpowers/specs/2026-04-18-v1.1-real-world-scenarios.md](docs/superpowers/specs/2026-04-18-v1.1-real-world-scenarios.md) (245 scenarios)

---

## Changelog

### v1.0.7 (2026-04-20) – Critical Bug Fixes & UX Improvements
- **Account pre-selection** — TradeForm + hotkey overlay now pre-select the active account.
- **Trash page** — works without an active account; can restore trades from any account.
- **Trade detail drawer** — closes automatically after soft-delete.
- **Settings** — native folder picker for bridge watch directory (`file:pick-folder` IPC).
- **Entry Price NaN regression** — clearing the field leaves value `undefined` so a clean "required" error shows instead of "Expected number, received nan".
- **Importer** — soft-error return from `imports:parse-file`, richer diagnostics, MT5 HTML score-tiered header fallback, expandable import history panel, post-import "View Imported Trades" CTA.
- **Dashboard** — retry button on failed widgets; improved empty states.
- **Blotter** — filters persist across navigation (Zustand).
- **Reviews** — success toast on save.
- 270/270 unit tests, 0 typecheck errors, 0 lint errors, clean production build.

### v1.0.6 (2026-04-19) – T1.7: Trade-Form P0
- **Symbol combobox** — type-ahead autocomplete backed by instruments table
- **Setup combobox** — autocomplete from setup library
- **TP (take-profit) field** — available in both quick and full trade forms
- Reusable Combobox component with Radix UI Popover and keyboard navigation

### v1.0.5 (2026-04-19) – T1.5: Balance Reconciliation
- **Balance reconciliation engine** — detects drift between broker equity and computed equity from trade P&L
- **Drift banner** — persistent warning when deviation > 0.01%
- **Correction workflow** — one-click modal to create a CORRECTION balance operation
- **Account metadata** — track broker, platform, server, leverage, timezone, login
- **Expert Advisor v2.00** — emits balance operations (BALANCE/CREDIT/CHARGE/CORRECTION/BONUS)

### v1.0.0 (Initial Release)
- Full blotter with virtualized table, filters, FTS5 search, and bulk select
- Trade detail drawer with full edit, screenshots, legs, audit log
- Dashboard with 10 analytics widgets
- Statement importer (MT4 HTML, MT5 HTML, CSV)
- Live MT4/MT5 bridge with real-time open/close tracking
- Daily and weekly review pages with Markdown editor
- ForexFactory calendar import with automatic news tagging
- PDF reports (per-trade and date-range summary)
- Backup & restore (ZIP, auto on close)
- Prop firm guardrails and persistent risk banner
- Trash and audit log UI
- Interactive guided tour on first launch
- Global hotkey overlay (Ctrl+Alt+L, always-on-top)
- System tray with live daily P&L
- Lot-size / risk calculator
- Auto-launch on Windows startup (opt-in)
- Auto-update check (opt-in)

---

## License

MIT — see [LICENSE](LICENSE).

---

*Built with Electron · React 18 · TypeScript · SQLite · Drizzle ORM · TanStack Router/Query/Table · Recharts · shadcn/ui · Tailwind CSS*
