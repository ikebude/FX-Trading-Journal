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

## Phase 4 — Build Foundation ✅ COMPLETE

**TradeForm Consistency Fix** — Critical Rule 15 violation resolved:
- [x] OverlayPage refactored to use shared `<TradeForm>` component
- [x] Custom submit handler added for overlay-specific logic (screenshot attachment, notes)
- [x] Pre-trade emotion field added to quick form for consistency
- [x] All TypeScript errors resolved (0 errors)
- [x] All 260 unit tests passing
- [x] Production build succeeds

**Release v1.0.6** — Patch release for TradeForm compliance:
- [x] Version bumped to 1.0.6
- [x] CHANGELOG updated with fix details
- [x] Ready for git tag and release

---

## Phase 5 — v1.0.7 Hotfix Sprint ✅ COMPLETE

**v1.0.7 shipped 2026-04-20** — All critical bugs and UX gaps addressed. 270/270 unit tests passing, 0 typecheck errors, 0 lint errors, clean production build.

### Critical Bugs (Broken Functionality) ✅ FIXED
- [x] **Account pre-selection bug**: New Trade form and Hotkey overlay now pre-select active account
- [x] **TrashPage disabled**: Now shows deleted trades from all accounts when no account selected
- [x] **Stale drawer after delete**: Trade detail drawer closes after successful soft-delete
- [x] **Bridge folder picker missing**: Added folder picker button to settings page

### Real-Life UX Gaps ✅ FIXED
- [x] **Post-import navigation**: Added "View Imported Trades" button after import completion
- [x] **Import history UI missing**: Added import history section to importer page
- [x] **Dashboard error recovery**: Added retry button on "Failed to load" state
- [x] **Filter persistence**: Added blotter filter persistence across navigation
- [x] **Success feedback missing**: Added success toast for reviews save
- [x] **Invalid default values**: Fixed entry price defaulting to 0 (now undefined/empty)

### Navigation/Flow Polish ✅ FIXED
- [x] **Post-import flow**: Direct link to Blotter after successful import
- [x] **Filter state management**: Filters persist across navigation
- [x] **Empty state prompts**: Improved dashboard empty states with helpful guidance
- [x] **Form validation UX**: Clear error messages and field highlighting (already good)

### Testing & Validation
- [x] **Unit tests**: All 270 tests pass ✅
- [x] **TypeScript compilation**: No type errors ✅
- [x] **E2E trader scenarios**: Test complete flows from account setup to reporting
- [x] **Real-world data testing**: Import actual broker statements and verify
- [x] **Cross-platform validation**: Windows installer and first-run experience
- [x] **Performance validation**: Large datasets (1000+ trades) don't cause UI lag

**Target:** Ship v1.0.7 within 3 days with all critical bugs fixed and UX gaps addressed

---

## Phase 6 — v1.1 Sprint (Week 2) 🏗️ [BLOCKED until v1.0.7 ships]

Next: T2.1 Setup library CRUD + versioning (2.5 days)
- Add `setup_versions` table for change tracking
- UI at `/settings/setups` for setup management
- Setup dropdown everywhere (already implemented)
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
