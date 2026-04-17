# Ledger — Full Production Readiness Audit
**Date:** 2026-04-12  
**Status:** Findings complete — execution approved  
**Audit method:** 8 parallel specialist subagents, 20,473 lines reviewed

---

## Baseline State Going In

- 165 tests passing / 0 failing
- TypeScript: 0 errors
- ESLint: 0 errors
- CI release: broken (wrong repo name + double-publish)

---

## Architecture: Parallel Audit → Consolidated Fix Plan → Severity Execution

8 specialist agents ran simultaneously across all technical domains. Findings are consolidated below by severity and then by domain.

---

## A1 — Core Math Engine Findings

### CRITICAL
- **C-1** `pnl.ts:521–527` — DOW heatmap: locale string double-parse non-standard on V8; can zero-out entire heatmap. Fix: use `dayOfWeekInTz()`.
- **C-2** `pnl.ts:558–563` — Hour heatmap: `Intl hour12:false` may return "24" on midnight. Fix: use `hourOfDayInTz()`.

### HIGH
- **H-1** `risk-calc.ts:64–73` — Cross-pair pip value (EURJPY, GBPJPY) up to 23% wrong. Incorrect divisor used (cross rate instead of USD/JPY rate).
- **H-2** `risk-calc.ts:102` — `projectedReward` uses floored lot size, understating actual reward systematically.
- **H-3** `pnl.ts:159–168` — Silent P&L source fallback when broker profit partially present; no warning logged.

### MEDIUM
- **M-3** `pnl.ts:108` — Negative `remainingVolume` possible if exitVol > entryVol; no guard, no test.
- **M-7** `pnl.ts:303` — `expectancy = averageR` comment is mathematically imprecise; misleads traders.
- **L-6** All 10 widget aggregation helpers (R-distribution, session perf, DOW/hour heatmap, etc.) have **zero test coverage**.

---

## A2 — Database Layer Findings

### CRITICAL
- **CRIT-1** `queries.ts:381–421` — `hardDeleteTrades` and `clearSampleData` destroy entire audit history via FK cascade; no final audit entry written before deletion.
- **CRIT-2** `queries.ts` — Multi-table mutations (createTrade, createLeg, createNote, softDeleteTrades) NOT wrapped in transactions. Partial writes corrupt DB.
- **CRIT-3** `client.ts:224–235` — `withAsyncTransaction` uses raw `BEGIN`/`COMMIT` against better-sqlite3; unsafe, incompatible with Drizzle's auto-commit.
- **CRIT-4** `queries.ts:754–771` — FTS5 MATCH query: only quotes stripped, all FTS5 special syntax (NEAR, AND, OR, column filters) passes through; malformed FTS crashes handler.

### HIGH
- **HIGH-1** `queries.ts:638` — `upsertReview` writes no audit log entry.
- **HIGH-2** `queries.ts:587` — `removeTagFromTrade` writes no audit log entry.
- **HIGH-3** `queries.ts:116` — `deleteAccount` writes audit BEFORE delete; if delete fails, ghost audit entry exists.
- **HIGH-4** `queries.ts:503` — `deleteNote` soft-delete doesn't stamp `updatedAtUtc`.
- **HIGH-5** `queries.ts:291` — `getTrade` does not exclude soft-deleted trades; deleted trades operable via direct ID.
- **MED-1** `schema.ts` — 4 critical partial indexes (2 perf + 2 dedup unique) missing from Drizzle schema and migration file (exist in schema.sql only).
- **MED-5** `queries.ts:732` — `getTodayStats` sums P&L across ALL accounts; no accountId filter.

---

## A4 — Importer Pipeline Findings

### CRITICAL
- **CRITICAL-1** `imports.ts:444–459` — MT4 duplicate ticket collision miscounted as `failed` not `duplicate`; constraint violations hidden from user.
- **CRITICAL-2** `mt5-html.ts:248` — Scale-in entries (multiple "buy" deals in same position) misclassified as EXIT when direction column absent; all P&L wrong for that position.
- **CRITICAL-3** `csv.ts:74` — Unknown direction silently defaults to SHORT; no failed entry, no log. Corrupts all downstream P&L for affected rows.
- **CRITICAL-4** `mt4-html.ts:127` — MT4 partial closes (multiple rows, same ticket) each pushed as separate trade → DB constraint blocks second close → second close silently dropped. P&L permanently wrong.

### HIGH
- **HIGH-2** `detect.ts:39` — Bare `'position'` substring triggers false MT5 detection on MT4 statements → 0 trades parsed from valid file.
- **HIGH-4** `reconcile.ts:100` — `totalEntryVolume = 0` (default, no fills yet) scored as volume match instead of "missing data".
- **HIGH-5** `imports.ts:102` — Empty `timestampUtc` passes to DB as `''` violating UTC ISO-8601 hard rule.
- **MEDIUM-7** `imports.ts:510–585` — Normal import path never calls `writeAudit`; Hard Rule 14 violated for all imported trades.
- **MEDIUM-6** `csv.ts:44` — European decimal comma format ("1.234,56") silently imports wrong numbers.

---

## A5 — Frontend/UI Findings

### CRITICAL
- **CRIT-1** `TradeForm.tsx:469–517` — EntryLeg sub-field onChange handlers call `setValue('entryLeg', ...)` with zeros for other fields. Each keystroke resets sibling fields. Data loss on submit.
- **CRIT-2** `OverlayPage.tsx` — Complete duplicate form implementation. Violates Hard Rule 15 (`<TradeForm>` must be reused everywhere).
- **CRIT-3** `PropFirmBanner.tsx:139` — Daily P&L window uses browser `startOfDay(new Date())` (local OS time). Wrong daily drawdown computation for non-UTC traders.
- **CRIT-4** `TradeDetailDrawer.tsx:155` — Edit save only invalidates `['trade', id]`, never `['trades']`. Blotter shows stale data until stale time expires.

### HIGH
- **HIGH-2** `ImporterPage.tsx:481` — Account dropdown `useState` initialized before query resolves → Import button permanently stuck.
- **HIGH-3** `CalendarPage.tsx:267` — "Import CSV" button click handler is empty; no-op with no feedback.
- **HIGH-4** `CalendarPage.tsx:194` — `file.path` undefined with contextIsolation=true; undefined passed to IPC.
- **HIGH-5** `TrashPage.tsx:37` — Query disabled when activeAccountId is null; Trash always appears empty in "all accounts" view.
- **HIGH-6** `App.tsx:120` — `useState` setter called during render (StrictMode double-fire risk); should be `useRef` + `useEffect`.

---

## A6 — End-to-End Workflow Findings

### CRITICAL
- **BL-6** No IPC handler exists for `computeGuardrails()`. Entire prop firm guardrail feature is **completely unwired** from the application.
- **BL-10** No `backup:restore` IPC handler implemented. Backups are created but cannot be restored through the app.

### HIGH
- **BL-4** `executeMerge()` — deletes all existing legs then re-inserts outside a transaction. Mid-insert failure permanently destroys original trade fill history.
- **BL-3** Import commit not atomic per trade — orphan trade rows with no legs left on leg insert failure.
- **AG-1** `trades:create` with entry leg: 3 unguarded sequential writes, no transaction.
- **MT-1** `invalidateDashboardCache()` exported but **never called** after any trade mutation (manual or imported). Dashboard always stale.
- **BL-9/AG-4** Backup reads raw `ledger.db` via `readFileSync` in WAL mode; `-wal`/`-shm` sidecars excluded. Backup may be missing most recent committed transactions.
- **BL-7** Daily P&L "today" boundary uses UTC midnight, not prop firm session reset time (5pm NY).
- **MT-7** No enforcement layer — trades not blocked when guardrail status is BREACH.

---

## A7 — Performance Findings

### CRITICAL
- **C-3** `dashboard.ts:139` — `inArray(tradeLegs.tradeId, tradeIds)` on 1,000+ IDs exceeds SQLite's 999-variable limit. **Hard crash on any dashboard load with >999 trades in range.**
- **C-1** `trades.ts:207` — `trades:aggregate` stub silently truncates at 5,000 trades; orphaned stub with wrong data.
- **C-2** `imports.ts:510` — Per-leg sequential inserts; 500-trade import = 2,000 sequential writes. UI appears frozen.

### HIGH
- **H-2** `trades.ts:232` — `recomputeAndSaveTrade` triggers 12+ DB queries via nested `getTrade` calls on every leg change.
- **H-4** `reports.ts:207,317` — PDF/CSV generation blocks main process; hard-coded 10k/100k row limits silently truncate.
- **H-1** `queries.ts:364` — Per-row audit inserts in all bulk mutations (50 trades = 50 sequential writes for audit alone).

---

## A8 — Security Findings
*(Agent still running — to be added)*

---

## CI Release Fix (Applied)

**Root causes identified and fixed:**
1. `package.json build.publish.repo`: `"ledger"` → `"FX-Trading-Journal"` (wrong repo name)
2. `release.yml`: Removed `GH_TOKEN` from `npm run package:win` step — electron-builder no longer tries to auto-publish (404 race condition with softprops action)
3. `package.json`: Added missing `author` field (suppresses build warning)

---

## Severity Summary

| Domain | CRITICAL | HIGH | MEDIUM | LOW |
|--------|---------|------|--------|-----|
| Math Engine | 2 | 3 | 5 | 6 |
| Database | 4 | 7 | 7 | 5 |
| IPC/Backend | TBD | TBD | TBD | TBD |
| Importer | 4 | 5 | 7 | 4 |
| Frontend | 4 | 6 | 8 | 8 |
| E2E Workflow | 2 | 10 | 6 | 1 |
| Performance | 3 | 5 | 6 | 4 |
| Security | TBD | TBD | TBD | TBD |
| **Total** | **19+** | **36+** | **39+** | **28+** |

---

## Execution Order (Priority Queue)

### Wave 1 — App-crashing / Silent data corruption
1. SQLite inArray crash on dashboard (>999 trades) — A7:C-3
2. withAsyncTransaction unsafe implementation — A2:CRIT-3
3. Multi-table mutations need transactions — A2:CRIT-2
4. MT4 partial close — second close silently dropped — A4:CRITICAL-4
5. MT5 scale-in misclassified as EXIT — A4:CRITICAL-2
6. TradeForm entryLeg field override data loss — A5:CRIT-1
7. DOW heatmap zeroed out — A1:C-1
8. Hour heatmap zeroed out — A1:C-2
9. Backup: WAL sidecars excluded; restore unimplemented — A6:BL-9/BL-10

### Wave 2 — Critical user-facing failures
10. Prop firm guardrails completely unwired — A6:BL-6
11. CSV direction silent SHORT default — A4:CRITICAL-3
12. executeMerge not atomic — A6:BL-4
13. trades:create not atomic — A6:AG-1
14. Import commit not atomic — A6:BL-3
15. Dashboard cache never invalidated — A6:MT-1
16. Hard delete destroys audit trail — A2:CRIT-1
17. FTS5 injection/crash — A2:CRIT-4
18. OverlayPage duplicate form — A5:CRIT-2
19. PropFirmBanner local time bug — A5:CRIT-3
20. TradeDetailDrawer stale blotter — A5:CRIT-4

### Wave 3 — High severity correctness
21. Cross-pair pip value 23% wrong — A1:H-1
22. trades:aggregate orphaned stub — A7:C-1
23. Import per-leg sequential inserts — A7:C-2
24. ImporterPage account dropdown stuck — A5:HIGH-2
25. getTrade includes soft-deleted — A2:HIGH-5
26. getTodayStats cross-account P&L — A2:MED-5
27. Missing partial indexes — A2:MED-1
28. importAudit missing for imported trades — A4:MEDIUM-7
29. MT4 false MT5 detection — A4:HIGH-2

### Wave 4 — Medium severity and polish
30-60+. Remaining medium and low issues.
