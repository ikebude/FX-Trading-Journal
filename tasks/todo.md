# FXLedger — Task Tracker

The current phase of work is tracked here. Each session should update this file.

---

## Phase 3 — Full Codebase Audit ✅ COMPLETE

All 33 bugs across 12 files fixed. See plan at:
`C:\Users\3Consult\.claude\plans\recursive-crunching-tiger.md`

**Fixed files:**
- [x] `electron/mql/LedgerBridge.mq4` — T1-1, T1-2, T6-5
- [x] `electron/mql/LedgerBridge.mq5` — T1-1, T1-2, T6-5, T6-6
- [x] `schema.sql` — T1-4, T4-2, T4-3, T4-4
- [x] `src/lib/db/schema.ts` — T1-4, T4-2, T4-3, T4-4
- [x] `src/lib/tz.ts` — T1-3, T6-1
- [x] `src/lib/pnl.ts` — T2-1, T2-2, T2-3, T2-4, T4-1
- [x] `src/lib/importers/mt4-html.ts` — T2-5, T6-2
- [x] `src/lib/importers/mt5-html.ts` — T2-6, T6-3
- [x] `src/lib/importers/headers.ts` — T6-4
- [x] `electron/main.ts` — T2-7, T2-8, T3-1, T3-3
- [x] `electron/preload.ts` — T3-2
- [x] `tests/pnl.test.ts` — T5-1 (34 tests total)

---

## Phase 4 — Build Foundation (Current) 🏗️

Build in this exact order (from CLAUDE.md §Build Order):

### Step 1: Environment verification
- [ ] Confirm `node --version` ≥ 22 (LTS) and `npm --version` ≥ 10
- [ ] Run `npm install` — install all locked dependencies
- [ ] Run `npm test` — all 34 tests must pass before any UI work begins
- [ ] Run `npm run typecheck` — zero type errors

### Step 2: Electron dev shell
- [ ] Run `npm run dev` — Electron window must open
- [ ] Confirm preload bridge loads without errors (DevTools console clean)

### Step 3: DB client + migration runner (`src/lib/db/client.ts`)
- [ ] Create `src/lib/db/client.ts` — better-sqlite3 + drizzle bootstrap
- [ ] Add first-launch migration: run `schema.sql` DDL + partial unique indexes
- [ ] Seed instrument table with ~30 common FX pairs + metals
- [ ] Verify DB file is created at `%APPDATA%\Ledger\ledger.db`

### Step 4: IPC handler skeleton (`electron/ipc/`)
- [ ] Create `electron/ipc/index.ts` — barrel that registers all handlers
- [ ] Stub all 15 IPC namespaces (trades, legs, accounts, instruments, imports, bridge, capture, reviews, calendar, reports, backup, audit, shell, settings, tags/setups)
- [ ] Wire `registerIpcHandlers` in `electron/main.ts`

### Step 5: DB queries layer (`src/lib/db/queries.ts`)
- [ ] All read queries (list trades, get trade, list legs, etc.)
- [ ] All write queries through Drizzle (insert, update, soft-delete, restore)

### Step 6: `<TradeForm>` component — Milestone 4
- [ ] Reusable form: manual entry, Mode A (quick) + Mode B (full detail)
- [ ] Zod validation schema in `src/lib/schemas.ts`
- [ ] Used by: blotter new-trade button, hotkey overlay, trade detail

### Step 7: Blotter — Milestone 5
- [ ] Virtualized table — TanStack Table + @tanstack/react-virtual
- [ ] Filters: account, date range, symbol, direction, setup, session, tag
- [ ] Columns: status badge, symbol, direction, entry/exit, pips, P&L, R, setup

### Step 8: Trade detail page — Milestone 6
- [ ] Reuse `<TradeForm>` in edit mode
- [ ] Screenshot gallery (upload from disk, paste from clipboard)
- [ ] Notes timeline (add/edit/delete)
- [ ] Leg breakdown table
- [ ] Audit log section

### Step 9: Statement importer UI — Milestone 7
- [ ] Drag/drop zone → detect format (MT4 HTML / MT5 HTML / CSV)
- [ ] Preview table with per-row status (import / duplicate / merge / skip)
- [ ] Commit button → calls `imports:commit` IPC

### Step 10 onwards: Dashboard, hotkey overlay, live bridge, reviews, prop firm, calendar, PDF reports, backup/restore, polish, packaging
(Follow CLAUDE.md milestone order 8–18)

---

## Notes

- **P&L math:** Never inline it. Always goes through `src/lib/pnl.ts`.
- **Timestamps:** Always UTC ISO-8601 strings. Use `date-fns-tz` + IANA zones.
- **Drizzle:** All DB writes go through Drizzle. No raw SQL in app code except migrations.
- **Tests:** Must pass before marking any step complete. Run `npm test` after every pnl.ts change.
