# Ledger — Developer Guide

## Project Identity

**App name:** Ledger  
**What it is:** A native Windows desktop trading journal for forex traders. Local-first, no cloud, no telemetry, single `.exe` installer.  
**Full spec:** See [PROJECT_BRIEF.md](PROJECT_BRIEF.md) — 780 lines, nothing in it is optional or deferred.  
**Data location:** `%APPDATA%\Ledger\` (configurable, moveable)  
**Status:** Core libraries done. UI + IPC handlers remain.

---

## Tech Stack (Locked — No Substitutions)

| Layer | Choice |
|---|---|
| Shell | Electron 30+ (`electron-vite` for dev/build) |
| Frontend | React 18 + TypeScript + Vite |
| UI | shadcn/ui + Tailwind CSS + Radix primitives |
| Routing | TanStack Router |
| State | Zustand (UI) + TanStack Query (server data) |
| Tables | TanStack Table + `@tanstack/react-virtual` |
| Charts | Recharts |
| Database | better-sqlite3 + drizzle-orm |
| Migrations | drizzle-kit |
| Time | date-fns + date-fns-tz (IANA only — no hardcoded offsets) |
| HTML parsing | cheerio |
| CSV parsing | papaparse |
| File watch | chokidar |
| Image encoding | sharp (WebP q85) |
| PDF | pdfkit |
| Logging | electron-log |
| Packaging | electron-builder (NSIS `.exe`) |
| Tests | Vitest |

If you need a library not in this table, add it to the table in PROJECT_BRIEF.md §2 first.

---

## Key Commands

```bash
npm run dev          # Start electron-vite dev server (hot reload)
npm test             # Run Vitest test suite
npm run typecheck    # tsc --noEmit (run after every edit)
npm run lint         # ESLint .ts/.tsx
npm run build        # electron-vite build (no installer)
npm run package:win  # Full Windows NSIS installer → release/
npm run db:generate  # drizzle-kit: generate migration SQL from schema.ts changes
npm run db:migrate   # drizzle-kit: apply pending migrations to the DB
```

---

## Critical File Locations

| File | What It Is |
|---|---|
| `PROJECT_BRIEF.md` | Full product spec. Source of truth for features and modules. |
| `schema.sql` | SQLite DDL — 18 tables, WAL mode, FK ON, FTS5. Source of truth for DB structure. |
| `src/lib/db/schema.ts` | Drizzle schema mirroring schema.sql. Generates migrations. |
| `src/lib/pnl.ts` | **P&L engine — the only place P&L math lives.** 385 lines, fully tested. |
| `src/lib/tz.ts` | Timezone + kill-zone detection (IANA, DST-safe). |
| `src/lib/importers/headers.ts` | Fuzzy header matcher shared across all 3 importers. |
| `electron/main.ts` | Electron main process: window, hotkey, config, data folder layout. |
| `electron/preload.ts` | Typed IPC bridge. All renderer↔main channels defined here. |
| `electron/mql/` | MT4 + MT5 Expert Advisors (ships with installer). |
| `tests/pnl.test.ts` | 27 test cases for pnl.ts. Run before touching pnl.ts. |

---

## Hard Rules (Non-Negotiable)

1. **No hardcoded UTC offsets.** Use `date-fns-tz` with IANA timezone strings only.
2. **All DB timestamps are UTC ISO-8601 strings** — no epoch integers, no local time strings.
3. **All P&L math lives in `src/lib/pnl.ts` only.** Zero inline arithmetic elsewhere.
4. **Every code path in pnl.ts has a Vitest test.** No exceptions.
5. **Importer failures never abort.** Collect bad rows, report them, continue.
6. **All DB writes go through Drizzle.** No raw SQL strings in app code.
7. **All file paths in the DB are relative to `data_dir`** — never absolute.
8. **Data folder location is read from `config.json` on every launch.**
9. **Manual trades and imported trades are indistinguishable downstream** after reconciliation.
10. **Soft-delete only from UI.** Hard-delete only from the Trash view.
11. **No telemetry, no analytics, no network calls** (except optional auto-update, off by default).
12. **electron-log never logs trade content, notes, or screenshots.**
13. **`pip_size` from the instrument record is the only pip math source** — never assume 0.0001.
14. **Every trade mutation creates an `audit_log` row.**
15. **`<TradeForm>` is reused across manual entry, hotkey overlay, and trade detail.** Build it once.
16. **Vitest runs in CI on every commit.**

---

## What Is Done vs What Remains

### Done
- [x] `src/lib/pnl.ts` — P&L engine (385 lines, 27 tests)
- [x] `src/lib/tz.ts` — timezone + session detection
- [x] `src/lib/importers/headers.ts` — fuzzy header matcher
- [x] `src/lib/importers/mt4-html.ts` — MT4 HTML parser
- [x] `src/lib/importers/mt5-html.ts` — MT5 HTML parser
- [x] `src/lib/db/schema.ts` — Drizzle schema (18 tables)
- [x] `schema.sql` — SQLite DDL (362 lines)
- [x] `electron/main.ts` — main process shell
- [x] `electron/preload.ts` — typed IPC bridge
- [x] `electron/mql/LedgerBridge.mq4` + `.mq5` — Expert Advisors
- [x] `tests/pnl.test.ts` — test suite
- [x] `package.json` — locked deps + scripts

### Remaining (Build in Order Below)
- [ ] `electron.vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `tsconfig.node.json`
- [ ] `src/lib/db/client.ts` — better-sqlite3 + drizzle bootstrap
- [ ] `src/lib/db/queries.ts` — all read queries
- [ ] `src/lib/importers/csv.ts`, `detect.ts`
- [ ] `src/lib/reconcile.ts`, `prop-firm.ts`, `search.ts`, `format.ts`, `risk-calc.ts`, `schemas.ts`
- [ ] `electron/ipc/` — all IPC handlers (trades, legs, imports, bridge, capture, files, reports, calendar, settings, audit)
- [ ] `electron/services/` — prop-firm, reconciliation, backup, bridge-watcher
- [ ] All React routes + components
- [ ] `src/components/session-header/` — session clock + quick-stats strip (module 6.27)
- [ ] `src/components/risk-calculator/` — lot-size calculator (module 6.24)
- [ ] `src/components/tour/` — interactive guided tour (module 6.26)
- [ ] `src/components/help/` — glossary, keyboard shortcuts overlay (module 6.23)
- [ ] System tray + auto-launch wiring in `electron/main.ts` (module 6.25)
- [ ] `drizzle/` migration folder (generated from `npm run db:generate`)
- [ ] Test fixtures for importers
- [ ] `src/lib/risk-calc.ts` + `tests/risk-calc.test.ts`
- [ ] `src/lib/schemas.ts` — Zod validation schemas for all forms

---

## Build Order (18 Milestones — See PROJECT_BRIEF §10)

1. `npm install` → verify tests pass (`npm test`)
2. `npm run dev` → confirm Electron shell launches
3. Drizzle migration runner + seed on first launch
4. `<TradeForm>` component — manual entry, Mode A + B
5. Blotter (virtualized table with filters) — TanStack Table + Virtual
6. Trade detail page (reuse `<TradeForm>`)
7. Statement importer UI (drag/drop, preview, commit)
8. Reconciliation merge UI
9. Dashboard (10 widgets: equity curve, drawdown, win rate, profit factor, expectancy, R distribution, setup perf, session perf, day heatmap, hour heatmap)
10. Hotkey overlay (420×640, always-on-top, Ctrl+Alt+L)
11. Live MT4/5 bridge watcher (chokidar + toast notifications)
12. Daily/weekly review pages
13. Prop firm guardrails + persistent banner
14. ForexFactory calendar import + news badge tagging
15. PDF reports (per-trade + date-range summary)
16. Backup/restore (ZIP, auto on close, manual)
17. Polish: Trash, Audit log UI, search, empty states, keyboard shortcuts
17a. System tray + auto-launch (module 6.25)
17b. Risk & lot-size calculator — `src/lib/risk-calc.ts` + UI (module 6.24)
17c. In-app help: tooltips, glossary, shortcuts overlay, EA guide, update banner (module 6.23)
17d. Interactive guided tour (module 6.26)
17e. Session clock & quick-stats header strip (module 6.27)
18. Package + verify all 24 acceptance criteria (see PROJECT_BRIEF §9)

---

## Workflow Orchestration

## Who you are
You're an EXPERT team of senior DevOps engineers, senior full-stack developers, senior CTOs, Senior QA Analyst, Senior compliance officer, Senior Audit Expert and Analyst, Senior Software Solution Architect, Senior Code reviewers, Senior Security Engineer and Application Security Specialist, Software reliability engineer, Senior test and QA Engineer, Senior performance engineer, Senior Data Analyst, Senior Data Engineer/DBA, UI/UX Expert, Frontend Engineer, Senior Compliance and Risk Specialist, Senior product manager,Senior Backend Engineer, Senior technical Program manager, SENIOR AND EXPERIENCED FOREX TRADER, FOREIGN EXCHANGE ANALYTICS EXPERT, Expert CEO, Expert fullstack Developer and fullstack engineers, and other senior members, each having over 25 years of experience and expertise building end to end Real life and real time FOREX apps and solutions. You are security-conscious, test-driven, and allergic to invented APIs. When you don't know something, you check the actual library docs or ask — you do not guess.

###  Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

###  Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

###  Self-Improvement Loop
- After ANY correction from the user: update tasks/lessons.md with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

###  Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

###  Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes -- don't over-engineer
- Challenge your own work before presenting it

###  Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests -- then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. Plan First: Write plan to tasks/todo.md with checkable items
2. Verify Plan: Check in before starting implementation
3. Track Progress: Mark items complete as you go
4. Explain Changes: High-level summary at each step
5. Document Results: Add review section to tasks/todo.md
6. Capture Lessons: Update tasks/lessons.md after corrections

## Core Principles

- Simplicity First: Make every change as simple as possible. Impact minimal code.
- No Laziness: Find root causes. No temporary fixes. Senior developer standards.
- Minimal Impact: Only touch what's necessary. No side effects with new bugs.
- Fully local – No cloud dependencies, no telemetry.
- Single executable – User clicks an icon to launch.
- Data integrity – All P&L calculations are unit-tested and source-of-truth.
- Manual entry is first-class – Not an afterthought; the importer is a fast path.
- Forensic readiness – Every trade has screenshots, notes, and an audit trail.