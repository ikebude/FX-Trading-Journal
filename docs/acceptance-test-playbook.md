# FXLedger — Manual Acceptance Test Playbook

This playbook covers the acceptance criteria that require real Windows interactions
(NSIS installer, global hotkey, system tray, multi-machine backup) plus post-release
verification steps.

Run this playbook against a **clean install** of the release `.exe` — not the dev server.

**Latest tested version:** v1.1.0 (May 17, 2026)

**Sign-off format for each section:**

> ☐ Passed — initials: ________  date: __________  version: _______

---

## §1 — AC-01: Clean install under 10 seconds

**Prereqs:**
- A Windows machine (or VM) with no prior FXLedger installation.
- The `FXLedger Setup {version}.exe` installer from the GitHub release.
- A stopwatch (phone timer works).

**Steps:**
1. Double-click `FXLedger Setup {version}.exe`.
2. Click through the NSIS installer (one-click or custom path — either is valid).
3. Start the stopwatch the moment you click "Finish" in the installer.
4. Watch the screen until the FXLedger blotter is fully visible (sidebar + column headers + any empty-state message).
5. Stop the stopwatch.

**Expected result:** The blotter is fully visible in ≤ 10 seconds from "Finish" click.

**Sign-off:**
> ☐ Passed — initials: ________  date: __________  version: _______

---

## §2 — AC-03: Ctrl+Alt+L overlay

**Prereqs:**
- FXLedger installed and running (main window open or minimized to tray).
- Another application in the foreground (e.g., Notepad, Chrome).

**Steps:**
1. Click into a different application so Ledger is not focused.
2. Press `Ctrl+Alt+L`.
3. The overlay window (420×640, frameless, always-on-top) should appear centered on the current monitor.
4. Fill in: Symbol = EURUSD, Direction = LONG, Lots = 0.10, Entry Price = 1.0850, Risk Pips = 20.
5. Click Submit (or press Enter).

**Expected result:**
- The overlay appears within ~1 second.
- The form is fully usable (all fields reachable, dropdowns work).
- After Submit, the overlay closes.
- Within 2 seconds, the trade appears in the main Ledger blotter.
- Total elapsed time from hotkey press to trade appearing in blotter: ≤ 12 seconds.

**Sign-off:**
> ☐ Passed — initials: ________  date: __________  version: _______

---

## §3 — AC-16: Backup + restore on a second machine

**Prereqs:**
- Machine A: Ledger installed with ≥ 5 trades and ≥ 1 trade with a screenshot attached.
- Machine B: Ledger installed (fresh, no trades).
- A USB drive or shared folder to transfer the backup ZIP.

**Steps (Machine A):**
1. Open Ledger → Settings → Backup.
2. Click "Backup now" (or "Manual backup to Downloads").
3. Note the backup filename (e.g., `ledger-backup-2026-04-17.zip`).
4. Copy the ZIP to the USB drive / shared folder.

**Steps (Machine B):**
1. Open Ledger → Settings → Backup.
2. Click "Restore from backup".
3. Select the ZIP copied from Machine A.
4. Wait for the restore to complete (dialog should confirm success).
5. Navigate to the Blotter — all trades from Machine A should be visible.
6. Open one of the trades with a screenshot attached — the screenshot should display correctly.

**Expected result:** All trades, notes, and screenshots are present and intact on Machine B.

**Sign-off:**
> ☐ Passed — initials: ________  date: __________  version: _______

---

## §4 — AC-17: Move data folder to OneDrive path

**Prereqs:**
- Ledger installed with ≥ 3 trades.
- OneDrive installed and synced (any folder inside `C:\Users\{user}\OneDrive\`).

**Steps:**
1. Create the folder `C:\Users\{user}\OneDrive\Ledger-data\`.
2. Open Ledger → Settings → Data.
3. Click "Move data folder" (or "Change location").
4. Select `C:\Users\{user}\OneDrive\Ledger-data\` as the destination.
5. Wait for the migration dialog to confirm completion.
6. **Fully quit Ledger** (tray → Quit Ledger — not just close the window).
7. Relaunch Ledger.

**Expected result:**
- After relaunch, all previous trades are visible in the Blotter.
- Settings → Data shows the new OneDrive path as the active data folder.
- Ledger continues to function normally (new trades can be created).

**Sign-off:**
> ☐ Passed — initials: ________  date: __________  version: _______

---

## §5 — AC-21a: System tray behavior

**Prereqs:**
- Ledger installed and running.

**Steps:**
1. Click the **×** (Close) button on the main Ledger window.
2. Verify the main window disappears but the Ledger icon remains in the Windows system tray (bottom-right, may be in the hidden-icons popup).
3. Right-click the tray icon.
4. Verify the context menu shows today's P&L (e.g., "Today: +$125.00" or similar).
5. Click "Quit Ledger" in the context menu.
6. Verify the tray icon disappears and the Ledger process exits (check Task Manager).

**Expected result:**
- Closing the window does not exit the app.
- Tray menu shows live today's P&L.
- "Quit Ledger" fully exits the process.

**Sign-off:**
> ☐ Passed — initials: ________  date: __________  version: _______

---

## §6 — AC-21b: Hotkey while minimized to tray

**Prereqs:**
- Ledger main window has been closed (app still in tray — see §5 above).
- Another application is in the foreground.

**Steps:**
1. With Ledger in the tray only (main window closed), press `Ctrl+Alt+L`.
2. The quick-capture overlay should appear — **not** the main window.

**Expected result:** The 420×640 overlay appears. The main window does not open.

**Sign-off:**
> ☐ Passed — initials: ________  date: __________  version: _______

---

## §7 — AC-U: Auto-update sign-off (post-v1.0.3)

> **Note:** This section cannot be completed until v1.0.3 is published. It is NOT a
> ship blocker for v1.0.2. Complete this after v1.0.3 is released and add the sign-off
> to the v1.0.3 release notes.

**Prereqs:**
- Machine with `Ledger Setup 1.0.2.exe` installed.
- v1.0.3 published on GitHub Releases (with a valid `latest.yml`).

**Steps:**
1. Open Ledger (v1.0.2) → Settings.
2. Enable "Auto-update" toggle (if not already on).
3. Click "Check for updates now".
4. Within ~5 seconds, a yellow banner should appear: "Ledger 1.0.3 is available — Download • Dismiss".
5. Click "Download".
6. A download progress bar should appear and fill to 100%.
7. Banner changes to "Ledger 1.0.3 is ready to install — Restart now".
8. Click "Restart now".
9. Ledger closes and relaunches.
10. Verify Settings → About shows version 1.0.3.

**Expected result:** End-to-end update flow works without manual file download.

**Sign-off:**
> ☐ Passed — initials: ________  date: __________  version: _______

---

# v1.1 Acceptance Criteria (AC-V.x)

> New manual criteria for the v1.1 release gate. Run on a packaged build
> after the automated gate (`npm test && typecheck && lint && build &&
> test:e2e`) passes.

## AC-V.1 — Balance reconciliation (T1.5)

**Steps:**
1. Create/select an account; import or add closed trades.
2. Add a deposit and a withdrawal via Account → Balance ledger.
3. Trigger a balance op from the EA bridge (or simulate one).
4. Open the account — the DriftBanner should be **absent** when the
   computed balance matches the broker-reported balance.
5. Edit a balance op so computed ≠ actual by > 0.01%.
6. Reload — the DriftBanner appears with the drift amount; "Create
   correction" zeroes it and the banner clears.

**Expected:** Drift detected only when > 0.01%; correction op resolves it.

**Sign-off:** ☐ Passed — initials: ____ date: ______ version: ______

## AC-V.2 — Prop-rule breach (T2.4/T2.5)

**Steps:**
1. Create a PROP account; apply a prop-firm preset (e.g. FTMO).
2. Add losing trades until the daily-loss limit is exceeded.
3. The persistent PropFirmBanner turns red and states the breached rule.
4. Open the trade form — the daily-loss circuit-breaker modal warns
   before a new entry is allowed.

**Expected:** Breach is detected, banner + pre-trade warning both fire.

**Sign-off:** ☐ Passed — initials: ____ date: ______ version: ______

## AC-V.3 — Zip-slip rejection (T1.8)

**Steps:**
1. Obtain/craft a malicious backup ZIP containing an entry with a
   `../` traversal path.
2. Settings → Restore from backup → choose the malicious ZIP.
3. Restore must abort with a clear error; no file is written outside
   the data dir.

**Expected:** Path-traversal entries are rejected; data dir untouched.

**Sign-off:** ☐ Passed — initials: ____ date: ______ version: ______

## AC-V.4 — Multi-account portfolio (T5.1/T5.2)

**Steps:**
1. Create two accounts in different currencies with some closed trades.
2. Open `/portfolio`.
3. Total net P&L shows in the base currency; accounts with no FX rate
   are listed with a "(no rate)" badge and excluded from the total
   (never silently summed at 1.0).
4. Open opposing positions in the same symbol across the two accounts.
5. The amber "Cross-account hedges detected" panel lists the symbol with
   long/short accounts and the effectively-flat lot count.

**Expected:** Currency conversion is rate-gated; cross-account hedge is
surfaced; per-account open risk rolls up.

**Sign-off:** ☐ Passed — initials: ____ date: ______ version: ______

## AC-V.5 — EA v2 migration / bridge (T1.4 + T4.9)

**Steps:**
1. Install the v2 EA; attach to an MT5 chart.
2. Open and close a position; confirm the bridge toast and the trade
   appearing in the blotter.
3. Trigger a balance op (deposit/withdrawal) from the EA; confirm it
   lands in the account ledger.
4. Leave the EA idle during market hours > 5 min → the quiet-bridge
   toast appears; skew the PC clock vs broker > 30s → drift toast.

**Expected:** v2 deal/balance events flow end-to-end; heartbeat + drift
alerts fire (T4.9).

**Sign-off:** ☐ Passed — initials: ____ date: ______ version: ______
