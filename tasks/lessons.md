# Lessons Learned

Rules derived from mistakes and corrections during development.
Update this file after every correction so the same mistake never happens twice.

---

## L-001: MQL FileMove — second/fourth params are common_flag, not file type flags

**Mistake:** Assumed `FileMove(src, 0, dst, 0)` was wrong because `0` is "not a valid file mode".
**Reality:** Parameters 2 and 4 are `common_flag` (0 = local files folder, FILE_COMMON = terminal common data folder). `0` is entirely valid. The real bug was the missing error check on the return value.
**Rule:** Always check the MQL documentation before assuming a flag value is wrong. The return value error check is what was missing, not the flag value.

---

## L-002: Drizzle partial (filtered) unique indexes

**Pattern:** Drizzle's `uniqueIndex()` builder does not support WHERE clauses. For soft-delete-aware deduplication, partial unique indexes MUST be created as raw SQL in the migration runner (or in schema.sql). Always add a comment in schema.ts pointing to the raw SQL location.
**Rule:** If you need `CREATE UNIQUE INDEX ... WHERE condition`, write it in schema.sql and add a Drizzle comment. Do not try to express it through the ORM builder.

---

## L-003: Instrument type — single source of truth

**Mistake:** pnl.ts had its own hand-written `Instrument` interface using snake_case field names (`pip_size`, `contract_size`). The Drizzle-inferred type uses camelCase (`pipSize`, `contractSize`). Two interfaces for the same entity will inevitably diverge.
**Rule:** Never re-define a type that is already inferred from the Drizzle schema. Import `Instrument` from `src/lib/db/schema.ts`. All downstream code (pnl.ts, tests, IPC handlers) follows that single definition.

---

## L-004: MT5 broker_profit only on EXIT legs

**Pattern:** MT5 statements supply `broker_profit` on exit deals only. Entry deals have `null`. The old `sumNullable(ALL legs)` check returned null as soon as any entry leg was null, causing silent fallback to computed P&L and discarding the broker-supplied figure.
**Rule:** When checking for broker-supplied profit, filter to EXIT legs only before checking for nulls. Exit legs are the only ones that can carry a non-null profit in the MT5 model.

---

## L-005: Timestamp parsing — replace ALL whitespace, strip UTC suffix first

**Pattern:** `.replace(' ', 'T')` only replaces the FIRST space in a string. Timestamps like `"2024.01.15 12:34:56 UTC"` produce `"2024-01-15T12:34:56 UTC"` (still has a space and trailing UTC) → invalid ISO-8601.
**Rule:** Always use `/\s+/g` for whitespace replacement in timestamp strings, strip any trailing `UTC` marker BEFORE the replacement, then append `Z` if no timezone info is present.

---

## L-006: JSON EscapeJson — order of operations matters

**Pattern:** If you escape `"` before `\`, then a literal `\"` in input becomes `\\"` after quote escaping, and then `\\\\"` after backslash escaping — double-escaped. Backslash must always be escaped first.
**Rule:** In any JSON string escaper, process `\` → `\\` FIRST, then `"` → `\"`, then control characters. Never change this order.

---

## L-007: sandbox: true is safe in Electron with contextIsolation

**Misconception:** `sandbox: false` was left in because "preload needs Node.js modules". In modern Electron (v20+), `contextBridge` and `ipcRenderer` are available in sandboxed preloads — the sandbox only prevents bare `require()` in the renderer. If the preload only uses `contextBridge` and `ipcRenderer`, `sandbox: true` works and is the recommended security setting.
**Rule:** Default to `sandbox: true`. Only set `sandbox: false` if the preload genuinely needs bare Node `require()` (which it should not if it follows the contextBridge pattern).
