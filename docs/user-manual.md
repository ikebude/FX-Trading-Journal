# Ledger — User Manual

> **Version:** 1.0.0  
> **Platform:** Windows 10 / Windows 11  
> **Support:** All data stays on your machine. No account required.

---

## Table of Contents

1. [Installation](#1-installation)
2. [First Launch & Setup](#2-first-launch--setup)
3. [Manual Trade Entry](#3-manual-trade-entry)
4. [Importing Your Trading History](#4-importing-your-trading-history)
5. [Live Bridge (Automatic Import from MetaTrader)](#5-live-bridge-automatic-import-from-metatrader)
6. [Trade Detail & Annotations](#6-trade-detail--annotations)
7. [Dashboard & Analytics](#7-dashboard--analytics)
8. [Reviews (Daily & Weekly Journal)](#8-reviews-daily--weekly-journal)
9. [Economic Calendar](#9-economic-calendar)
10. [PDF Reports & CSV Export](#10-pdf-reports--csv-export)
11. [Prop Firm Guardrails](#11-prop-firm-guardrails)
12. [Backup & Restore](#12-backup--restore)
13. [Settings](#13-settings)
14. [Hotkey Overlay](#14-hotkey-overlay)
15. [Keyboard Shortcuts](#15-keyboard-shortcuts)
16. [Trash & Data Recovery](#16-trash--data-recovery)
17. [Troubleshooting](#17-troubleshooting)
18. [FAQ](#18-faq)

---

## 1. Installation

### System Requirements

- Windows 10 (1903+) or Windows 11
- 4 GB RAM minimum (8 GB recommended)
- 500 MB free disk space (more for screenshots)
- No internet connection required after installation

### Installing Ledger

1. Double-click `Ledger-1.0.0-setup.exe`
2. Click **Next** through the installer
3. Choose installation directory (default: `C:\Program Files\Ledger`)
4. ✅ Check **Create Desktop Shortcut**
5. ✅ Check **Create Start Menu Shortcut**
6. Click **Install** → **Finish**

> **Note:** The installer does NOT require administrator privileges to the default AppData location. If you install to `C:\Program Files`, you will need admin rights.

### Where Your Data Lives

All your trades, screenshots, and backups are stored in:

```
C:\Users\<YourName>\AppData\Roaming\Ledger\
├── ledger.db          ← Your trade database
├── screenshots\       ← Chart images
├── imports\           ← Copies of imported statements
├── backups\           ← Backup archives
└── config.json        ← App settings
```

You can move this folder. Go to **Settings → Data Folder** and select a new location. Ledger will copy your data to the new location.

---

## 2. First Launch & Setup

### Step 1: Create Your First Account

When Ledger opens for the first time, a setup wizard will guide you through creating your first trading account.

Click **"+ New Account"** and fill in:

| Field | What to enter |
|---|---|
| **Account Name** | Something descriptive, e.g., "IC Markets Live" or "FTMO Phase 1" |
| **Broker** | Your broker's name (optional, for display) |
| **Account Currency** | The currency your broker account is denominated in (USD, EUR, GBP...) |
| **Initial Balance** | Your starting balance — used to calculate drawdown accurately |
| **Account Type** | LIVE, DEMO, or PROP |

For **Prop Firm** accounts (FTMO, MyForexFunds, etc.), also fill in:
- Daily Loss Limit
- Max Drawdown
- Profit Target
- Current Phase (Phase 1, Phase 2, Funded, Verified)

### Step 2: Add Instruments (Optional)

Ledger ships with 80+ instruments pre-configured (all major FX pairs, gold, silver, major indices). If you trade a custom instrument:

Go to **Settings → Instruments → + Add Instrument** and enter:
- Symbol (exactly as it appears in your broker platform, e.g., `EURUSDm`)
- pip_size: `0.0001` for standard FX, `0.01` for JPY pairs
- Contract size: `100000` for standard FX lots

---

## 3. Manual Trade Entry

There are three ways to log a trade manually:

### Option A: Full TradeForm (Blotter)
1. Click the **"+ New Trade"** button in the top bar
2. Fill in the Required fields (symbol, direction, entry price, lots, entry time)
3. Fill in optional Planning fields (stop loss, take profit, setup name)
4. Fill in optional Context fields (market condition, entry model, confidence, emotion)
5. Click **"Save Trade"**

### Option B: Quick Entry (Hotkey Overlay)
Press **Ctrl+Alt+L** while MetaTrader is open:
- A compact floating form appears
- Fill in just the essentials
- Press **Enter** to save
- The overlay auto-hides

### Option C: Lot-Size Calculator First
1. Press **Ctrl+Shift+R** (or click the calculator icon in the toolbar)
2. Enter your risk parameters (account size, risk %, stop pips)
3. Click **"Use X.XX lots in new trade"**
4. The TradeForm opens with the lot size pre-filled

### Adding an Exit Leg
When a trade closes:
1. Click the trade in the Blotter to open the Detail Drawer
2. Go to the **Legs** tab
3. Click **"+ Add Exit Leg"**
4. Enter exit price, exit time, commission, swap, and profit
5. P&L is automatically recalculated

---

## 4. Importing Your Trading History

### What Can Be Imported

| Format | How to Export from MetaTrader |
|---|---|
| **MT4 HTML Statement** | MT4 → Account History tab → Right-click → Save as Detailed Report |
| **MT5 HTML Statement** | MT5 → View → Account History → Right-click → Save as Detailed Report |
| **Generic CSV** | Most brokers can export trade history as CSV |

### Import Process

1. Click **"Importer"** in the left sidebar
2. Drag your file onto the drop zone, or click **"Browse"**
3. Ledger auto-detects the format (MT4, MT5, or CSV)
4. A **preview table** shows what will be imported:
   - ✅ Green rows = clean, ready to import
   - 🟡 Yellow rows = possible duplicate (already in your journal)
   - 🔴 Red rows = parse error (see reason in the Failed Rows tab)
5. Select the account to import into
6. Click **"Import [N] Trades"**
7. A summary shows: imported, duplicates skipped, merged, failed

### Handling Duplicates

If you import the same statement twice, Ledger detects duplicates by the internal ticket/position ID. **Duplicates are skipped, not doubled up.** Your trade count will not inflate.

### Handling Failures

Failed rows are never silently discarded. They appear in a collapsible "Failed Rows" panel with the reason for failure. Common causes:
- Missing required column (no "Volume" or "Symbol" column)
- Non-numeric price value
- Zero-volume row (pending order that never filled)

### Reconciliation (Manual + Imported)

If you logged a trade manually in Ledger and now want to import the broker's exact data for the same trade:

1. Import the statement normally
2. Ledger detects the potential match and shows a **Reconcile** button
3. A side-by-side comparison shows your manual data vs. broker data
4. Click **"Merge"** to accept: your qualitative notes (setup, emotion, confidence) are kept; broker's exact prices and P&L replace your manual entries

---

## 5. Live Bridge (Automatic Import from MetaTrader)

The Live Bridge lets MetaTrader automatically push every closed trade to Ledger in real-time — no manual imports needed.

### Step 1: Copy the Expert Advisor

The `LedgerBridge` EA files are bundled with Ledger:
- For MT4: `C:\Program Files\Ledger\resources\mql\LedgerBridge.mq4`
- For MT5: `C:\Program Files\Ledger\resources\mql\LedgerBridge.mq5`

Copy the appropriate file to your MetaTrader's Experts folder:
- MT4: `<MT4 Data Folder>\MQL4\Experts\`
- MT5: `<MT5 Data Folder>\MQL5\Experts\`

> **Tip:** Find your MT4/5 Data Folder via: File → Open Data Folder inside MetaTrader

### Step 2: Compile and Install the EA

1. Open MetaEditor (press F4 inside MT4/5, or via Tools → MetaEditor)
2. Open the `LedgerBridge.mq4` / `.mq5` file
3. Press **F7** to compile (should say "0 errors, 0 warnings")
4. Return to MetaTrader
5. Drag **LedgerBridge** from Navigator → Expert Advisors onto any chart
6. Enable **"Allow Algo Trading"** in the MT4/5 toolbar (green play button)

### Step 3: Configure the Bridge Folder in Ledger

1. Open Ledger → **Settings → Live Bridge**
2. Set the **Bridge Inbox Path** to match where the EA writes files
   - Default: `<MT4 Data Folder>\MQL4\Files\Ledger\`
3. Click **"Start Watching"**
4. The bridge status indicator in the bottom-left turns green

### Step 4: Test It

Close a trade in MetaTrader. Within 3 seconds, you should see:
- A toast notification: "Bridge: Imported MT4 trade #12345678 (EURUSD LONG)"
- The trade appears in the Blotter

> **Troubleshooting:** If trades are not appearing, check Settings → Live Bridge → View Bridge Log

---

## 6. Trade Detail & Annotations

Click any trade row in the Blotter to open the **Detail Drawer** (slides in from the right).

### Overview Tab

Shows all computed metrics:
- Net P&L (profit/loss in account currency)
- Net pips (actual pips moved after commission)
- R-Multiple (how many R did you make or lose?)
- Total commission & swap
- Entry/exit prices (volume-weighted average)

Click the **Edit** button to modify any field of the trade.

### Legs Tab

Shows all entry and exit fills:
- Add additional legs (for scaled entries/exits)
- Edit individual leg prices, volumes, or times
- Delete a leg (P&L recalculates immediately)

### Screenshots Tab

Attach chart images to the trade:
1. Click **"+ Add Screenshot"**
2. Choose: Entry, Exit, Annotated, or Other
3. Drag a PNG/JPG from your screen, or use the screen capture button
4. Add an optional caption (e.g., "Entry at London open — clean OB tap")

Images are automatically converted to WebP format and saved to your data folder.

### Notes Tab

Write free-form markdown notes about the trade. Notes are timestamped and form a timeline — useful for capturing your evolving thoughts about a position.

**Markdown is supported:** headers, bullet lists, bold, italic, code blocks.

### Audit Tab

Shows every change ever made to this trade:
- What field changed
- Old value → new value
- When the change was made

---

## 7. Dashboard & Analytics

The Dashboard has 10 analytics widgets. Use the **date range picker** and **account selector** at the top to filter all widgets simultaneously.

### Equity Curve

A line chart showing your cumulative P&L over time. Each point represents one closed trade. A positive slope means you're making money; a negative slope means losses are accumulating.

### Drawdown Chart

Shows how far below your account peak you've fallen at any point in time. Important for risk management — most prop firms have a 5–10% max drawdown rule.

### Win Rate

A donut chart showing your percentage of winning trades vs. losing trades. Includes a breakdown for long vs. short trades.

**Important:** Win rate alone doesn't tell you if your strategy is profitable. A 40% win rate with a 2R average win is more profitable than a 70% win rate with a 0.5R average win.

### Profit Factor

`Gross Wins / Gross Losses`. Above 1.0 means profitable. Below 1.0 means losing money overall. A good professional trader typically runs 1.5–2.5.

### Expectancy

Expected profit per trade in dollar terms at your current win rate and average win/loss size. This is the most important single metric: it tells you the expected value of your edge.

### R Distribution

A histogram showing how your R-multiples are distributed. Ideally you want a right skew (more large winners than large losers). A tight distribution around 0.5–2R suggests good risk management.

### Setup Performance

Bar chart showing win rate and average R for each setup name. Identifies which setups are generating your edge and which are costing you money. Trade fewer setups — focus on what works.

### Session Performance

Compare your performance across London, New York, Asian, and Overlap sessions. Many traders find they perform poorly in one session — this chart helps identify that.

### Day of Week Heatmap

Average P&L by day of week. If you consistently lose on Mondays, consider not trading Mondays.

### Hour of Day Heatmap

Average P&L by hour (broker time). Reveals which hours are your best and worst.

---

## 8. Reviews (Daily & Weekly Journal)

Reviews are guided structured reflections separate from the raw trade data.

### Daily Review

Complete a daily review at the end of each trading day:

1. Click **"Reviews"** in the sidebar
2. Click **"+ Daily Review"**
3. Select the date
4. Answer the guided prompts:
   - Did you follow your plan?
   - What was your biggest win?
   - What was your biggest mistake?
   - What will you improve tomorrow?
   - Rate your mood, discipline, and energy (1–5)

**Tip:** Use the daily review template in `docs/template.md` as a starting point.

### Weekly Review

Done on Fridays:
1. Click **"+ Weekly Review"**
2. Select the week
3. Answer the higher-level prompts:
   - What patterns worked?
   - What patterns should you eliminate?
   - Any strategy adjustments?

---

## 9. Economic Calendar

### Importing the ForexFactory Calendar

Ledger doesn't have a live internet connection, so you import the calendar manually:

1. Go to [ForexFactory.com/calendar](https://forexfactory.com/calendar)
2. Click the calendar icon (top right) → **Download**
3. Choose **CSV format**, select your date range
4. Save the file
5. In Ledger: **Calendar → Import CSV** → select the downloaded file

### Using the Calendar

- Economic events appear on the Calendar page with color-coded impact levels:
  - 🔴 Red = High Impact (Non-Farm Payrolls, FOMC, CPI)
  - 🟠 Orange = Medium Impact
  - 🟡 Yellow = Low Impact
- Events within ±30 minutes of your trade entry are automatically tagged
- You can see "NFP was 15 minutes before this entry" in the trade detail

### Re-tagging Trades

If you import new calendar data, click **"Re-tag All Trades"** to recompute news proximity for all trades.

---

## 10. PDF Reports & CSV Export

### Per-Trade PDF

1. Open a trade's Detail Drawer
2. Click the **"Download PDF"** button
3. A PDF is generated and opened with your default PDF viewer

The PDF includes: trade metrics, legs table, setup context, notes, and a Ledger footer.

### Summary Report PDF

1. Go to **Reports** in the sidebar
2. Apply date range and account filters
3. Click **"Generate Summary PDF"**

The summary PDF includes: aggregate stats (win rate, profit factor, expectancy, avg R), trade list table, and cover page with filter details.

### CSV Export

1. Go to **Reports → Export CSV**
2. Apply filters
3. Choose save location
4. Opens a CSV with all fields for analysis in Excel or Python

---

## 11. Prop Firm Guardrails

If you're trading a prop firm challenge (FTMO, MyForexFunds, E8 Funding, etc.):

### Setting Up Prop Rules

1. When creating your account, select **Account Type = PROP**
2. Fill in your firm's rules:
   - **Daily Loss Limit**: e.g., $500 (or 5% if using percentage)
   - **Max Drawdown**: e.g., $1,000 (or 10%)
   - **Profit Target**: e.g., $1,000 (or 10%)
   - **Drawdown Type**: STATIC (from initial balance) or TRAILING (from peak)

### The Guardrail Banner

A persistent banner appears at the top of the screen showing real-time progress:

- **Daily P&L**: Today's P&L vs. your daily loss limit
  - Green = comfortable
  - Amber = within 20% of the limit
  - Red = limit exceeded ⚠️
- **Max Drawdown**: Current drawdown vs. maximum allowed
- **Profit Target**: Progress toward your target

> **Warning:** Ledger shows you the numbers — but it does NOT automatically stop you from trading. Use it as a dashboard, not as a hard stop.

---

## 12. Backup & Restore

### Automatic Backup

Every time you close Ledger, it automatically creates a ZIP backup:

```
C:\Users\<YourName>\AppData\Roaming\Ledger\backups\auto\
  ledger-auto-2024-01-15_14-30-00.zip
  ledger-auto-2024-01-14_09-15-00.zip
  ...
```

The 30 most recent auto-backups are kept; older ones are automatically deleted.

### Manual Backup

1. Go to **Settings → Backup**
2. Click **"Create Backup Now"**
3. A timestamped ZIP file is created in `backups/`
4. Optionally, click **"Save to Custom Location"** to export to USB or cloud storage

What's in the backup:
- `ledger.db` — all your trades, notes, analytics data
- `screenshots/` — all your chart images
- `config.json` — your settings

### Restoring a Backup

⚠️ **Warning: Restore replaces your current data. There is no undo.**

1. Go to **Settings → Backup → Restore from Backup**
2. Browse to a `.zip` backup file
3. Ledger validates the archive
4. Confirm the restore
5. **Ledger will restart** to apply the restored database

> **Tip:** Before restoring, Ledger automatically saves your current database as `ledger.db.pre-restore` so you can recover from an accidental restore.

---

## 13. Settings

### General

| Setting | Description |
|---|---|
| Theme | Dark / Light / System |
| Display Timezone | Your local timezone for displaying trade times |
| Language | English (more languages coming) |
| Start on Windows Startup | Launch Ledger automatically when Windows starts |

### Data Folder

- View current data folder path
- Move data to a new location (Ledger copies all files)

### Instruments

- View all instruments with their pip_size
- Add custom instruments for exotic pairs or indices
- Edit pip_size or contract_size (this will recompute P&L for all trades of that instrument)

### Live Bridge

- Configure the bridge inbox folder path
- View the bridge activity log (processed/failed files)
- Clear the bridge log

### Backup

- Create manual backup
- Restore from backup
- Configure auto-backup settings

### Accounts

- Create, edit, delete accounts
- View per-account statistics
- Archive (deactivate) old accounts without deleting data

### Hotkey

- Change the global hotkey (default: Ctrl+Alt+L)
- Test if the hotkey is registered

---

## 14. Hotkey Overlay

The hotkey overlay is a compact trade-logging window that floats on top of MetaTrader.

### Opening the Overlay

Press **Ctrl+Alt+L** (or your custom hotkey) at any time, even when MetaTrader is in the foreground.

### Using the Overlay

- Fill in Symbol, Direction, Entry Price, Lots
- Optionally attach a screenshot using the capture button (captures the last non-Ledger window)
- Press **Enter** to save, or **Escape** to cancel
- The overlay auto-hides when you click away from it

### Pinning the Overlay

Click the 📌 pin icon in the overlay's title bar to prevent auto-hide.

### Lot Size Calculator in Overlay

Press **Ctrl+Shift+R** to open the risk calculator within the overlay. When you click "Use X.XX lots", the lot field is automatically filled.

---

## 15. Keyboard Shortcuts

### Global (App-Wide)

| Shortcut | Action |
|---|---|
| `Ctrl+Alt+L` | Open trade logging overlay |
| `Ctrl+Shift+R` | Open risk/lot-size calculator |
| `Ctrl+K` | Open full-text search |
| `?` | Show keyboard shortcuts panel |
| `Ctrl+N` | New trade (when on Blotter) |

### Blotter

| Shortcut | Action |
|---|---|
| `↑` / `↓` | Navigate trade rows |
| `Enter` | Open detail drawer for selected trade |
| `Delete` | Soft-delete selected trade (moves to Trash) |
| `Ctrl+A` | Select all trades (for bulk actions) |

### Trade Detail Drawer

| Shortcut | Action |
|---|---|
| `Escape` | Close drawer |
| `E` | Edit the trade |
| `1` / `2` / `3` / `4` / `5` | Switch tabs (Overview / Legs / Screenshots / Notes / Audit) |

### Global Navigation

| Shortcut | Action |
|---|---|
| `Alt+1` | Go to Dashboard |
| `Alt+2` | Go to Blotter |
| `Alt+3` | Go to Importer |
| `Alt+4` | Go to Reviews |

---

## 16. Trash & Data Recovery

Ledger uses **soft delete** — deleted trades are moved to the Trash, not permanently removed.

### Soft Deleting Trades

- Right-click a trade → **Delete**
- Or press `Delete` key when a trade row is selected
- The trade disappears from the Blotter and is excluded from all analytics

### Viewing the Trash

Click **Trash** in the sidebar to see all deleted trades.

### Restoring a Trade

1. Click the trade in the Trash
2. Click **"Restore"**
3. The trade reappears in the Blotter with all its data intact

### Permanently Deleting

1. In the Trash, click **"Permanently Delete"**
2. Confirm the action
3. The trade, all its legs, notes, screenshots, and audit records are permanently removed

> **Note:** Screenshots files are also deleted from disk on permanent delete.

---

## 17. Troubleshooting

### Ledger won't start

1. Check Windows Event Viewer for crash details
2. Check the log file: `%APPDATA%\Ledger\logs\main.log`
3. Try deleting `%APPDATA%\Ledger\config.json` — Ledger will regenerate it with defaults (your trade data is NOT affected)

### Bridge not receiving trades

1. Verify the EA is attached to a chart (check MT4/5 top-right of the chart)
2. Verify "Algo Trading" is enabled (toolbar button, green check)
3. In MT4, go to Tools → Options → Expert Advisors → check "Allow automated trading"
4. Check the MT4/5 Experts tab (bottom panel) for LedgerBridge messages
5. Verify the bridge inbox path in Ledger Settings matches the EA's output folder
6. Manually check if `.json` files exist in the bridge inbox folder

### Import failing / all trades in "Failed Rows"

1. Ensure you exported the **Detailed Report** (not Account Statement)
2. Try a different date range — very large files (10,000+ trades) may need to be split
3. Check the failed row reason — common issue: date format mismatch

### P&L showing wrong values

1. Check the instrument's pip_size in Settings → Instruments
2. For JPY pairs: pip_size must be `0.01`, not `0.0001`
3. For XAUUSD: pip_size = `0.1`, contract_size = `100`
4. After fixing pip_size, click the instrument's "Recompute All Trades" button

### Screenshots not loading

1. Check the screenshot file exists: open the path shown in the screenshot detail
2. If the data folder was moved, re-link it in Settings → Data Folder

### Database appears corrupt

1. Stop Ledger
2. Navigate to `%APPDATA%\Ledger\`
3. Run: `sqlite3 ledger.db "PRAGMA integrity_check;"`
4. If it returns anything other than "ok", restore from the most recent backup

---

## 18. FAQ

**Q: Do I need internet to use Ledger?**  
A: No. Ledger works completely offline. The only optional network feature is auto-update checking, which is disabled by default.

**Q: Can I use Ledger with multiple brokers?**  
A: Yes. Create a separate Account for each broker account. You can switch between accounts in the top bar.

**Q: Will importing old statements create duplicates?**  
A: No. Ledger deduplicates by the internal trade ticket/position ID. Importing the same file twice will show all trades as "duplicate, skipped."

**Q: Can I share my data with another trader?**  
A: Yes. Create a manual backup and send the ZIP file. They can restore it on their machine. Note that this will replace their data.

**Q: What happens if I accidentally delete my database?**  
A: Check the auto-backup folder: `%APPDATA%\Ledger\backups\auto\`. The most recent ZIP contains your last known good database.

**Q: Can I customize the pip_size for a non-standard instrument?**  
A: Yes. Go to Settings → Instruments → find or create the instrument → edit pip_size. This will trigger a recomputation of all trades for that instrument.

**Q: How do I track prop firm challenges?**  
A: Create an account with Account Type = PROP and fill in the firm's rules. The guardrail banner will appear automatically.

**Q: Is my trading data secure?**  
A: Yes. Everything is stored locally on your machine. Ledger has no cloud connection, no telemetry, and no external data transmission of any kind.

**Q: Can I use Ledger on a laptop and desktop?**  
A: Yes, but you need to manually sync by using backup/restore. There is no automatic multi-device sync in v1.0.0.

**Q: How do I report a bug?**  
A: Check the log file at `%APPDATA%\Ledger\logs\main.log` and report it via the project's GitHub Issues page.

---

*Ledger v1.0.0 — Your trades. Your data. Your edge.*
