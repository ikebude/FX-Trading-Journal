# Pre-Release Gap Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every identified gap before v1.0 public release — security, correctness, and UX completeness.

**Architecture:** All fixes are surgical edits to existing files. No new architectural layers. Each task is independently deployable. Ordered by risk: security/correctness first, UX second, test coverage third.

**Tech Stack:** Electron 34 · React 18 · TypeScript · better-sqlite3 · Drizzle ORM · Vitest · Playwright (E2E)

---

## Files Modified

| File | What Changes |
|---|---|
| `src/lib/pnl.ts` | Replace `console.warn` with `[pnl]`-prefixed warn that omits price values |
| `src/lib/db/queries.ts` | Add `clearSampleData()` export |
| `electron/ipc/trades.ts` | Register `trades:clear-sample` IPC handler |
| `electron/preload.ts` | Expose `trades.clearSample()` on `window.ledger` |
| `src/pages/SettingsPage.tsx` | Add "Clear Sample Trades" button in DataSection |
| `electron/ipc/bridge.ts` | Keep — owns IPC channels (status/pause/resume/set-watch-dir). Owns its own user-configured watch dir separate from the auto-watcher. |
| `electron/services/bridge-watcher.ts` | Keep — owns the auto-start inbox watcher. No change needed. |
| `tests/e2e/smoke.test.ts` | New: Playwright smoke test (launch → blotter loads → trade count > 0) |
| `electron.vite.config.ts` | Confirm `sandbox: false` not set (Playwright needs to launch app) |

---

## Task 1 — Fix `console.warn` in `pnl.ts` (R12 security)

**Files:**
- Modify: `src/lib/pnl.ts:206-212`

**Context:** `pnl.ts` is a pure library used in both main and renderer. It cannot import `electron-log` (renderer bundle would break). The fix is to emit only the trade ID and direction — no prices — which are not sensitive trade-content fields.

- [ ] **Step 1: Edit `src/lib/pnl.ts` line 206**

Replace:
```typescript
      console.warn(
        `[pnl] Trade ${trade.id}: inverted stop detected ` +
          `(direction=${trade.direction}, entry=${weightedAvgEntry}, ` +
          `stop=${trade.initial_stop_price}). rMultiple will be null.`,
      );
```

With:
```typescript
      console.warn(
        `[pnl] Trade ${trade.id}: inverted stop — stop is on wrong side of entry ` +
          `(direction=${trade.direction}). rMultiple will be null.`,
      );
```

- [ ] **Step 2: Verify test 33 still passes (it checks this branch)**

```bash
cd "c:\Users\3Consult\Documents\ChidiGit\mine\FX Trading Journal"
npm test -- --reporter=verbose 2>&1 | grep "inverted stop"
```
Expected: `✓ 33. Inverted stop`

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck 2>&1
```
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pnl.ts
git commit -m "fix(pnl): remove prices from inverted-stop warning to avoid logging trade data (R12)"
```

---

## Task 2 — "Clear Sample Trades" — queries layer

**Files:**
- Modify: `src/lib/db/queries.ts` (add one export after `hardDeleteTrades`)

**Context:** Sample trades have `is_sample = 1`. We need to fetch their IDs then call the existing `hardDeleteTrades` to reuse its FTS cleanup logic.

- [ ] **Step 1: Add `clearSampleData` function after `hardDeleteTrades` in `queries.ts`**

```typescript
/** Hard-delete all rows where isSample = true. Called from Settings. */
export async function clearSampleData(): Promise<number> {
  const db = getDb();
  const sampleRows = await db
    .select({ id: trades.id })
    .from(trades)
    .where(eq(trades.isSample, true));
  if (sampleRows.length === 0) return 0;
  const ids = sampleRows.map((r) => r.id);
  await hardDeleteTrades(ids);
  return ids.length;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd "c:\Users\3Consult\Documents\ChidiGit\mine\FX Trading Journal"
npm run typecheck 2>&1
```
Expected: zero errors.

---

## Task 3 — "Clear Sample Trades" — IPC handler

**Files:**
- Modify: `electron/ipc/trades.ts` (add one handler at the bottom of `registerTradeHandlers`)

- [ ] **Step 1: Add import of `clearSampleData` at top of `electron/ipc/trades.ts`**

Find the existing import line:
```typescript
import { ..., hardDeleteTrades, ... } from '../../src/lib/db/queries';
```
Add `clearSampleData` to that import.

- [ ] **Step 2: Register the handler inside `registerTradeHandlers()`**

Add at the end of the function body, before the closing `}`:
```typescript
  ipcMain.removeHandler('trades:clear-sample');
  ipcMain.handle('trades:clear-sample', async () => {
    try {
      const count = await clearSampleData();
      log.info(`trades:clear-sample: removed ${count} sample trades`);
      return { count };
    } catch (err) {
      log.error('trades:clear-sample', err);
      throw err;
    }
  });
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck 2>&1
```
Expected: zero errors.

---

## Task 4 — "Clear Sample Trades" — preload bridge

**Files:**
- Modify: `electron/preload.ts` — add to `trades` object

- [ ] **Step 1: Add `clearSample` to the `trades` object in `electron/preload.ts`**

Find:
```typescript
    aggregate: (filters: unknown) =>
      ipcRenderer.invoke('trades:aggregate', filters),
  },
```

Add after the `aggregate` line, inside the `trades` block:
```typescript
    clearSample: () => ipcRenderer.invoke('trades:clear-sample'),
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck 2>&1
```
Expected: zero errors.

---

## Task 5 — "Clear Sample Trades" — Settings UI

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

**Context:** Add a "Clear Sample Trades" row inside the existing `DataSection` component. Use the `useMutation` + `useQueryClient` pattern already present in the file.

- [ ] **Step 1: Add `useState` import check — it's already imported, no change needed**

- [ ] **Step 2: Add `useMutation` and `useQueryClient` to the `DataSection` component**

Find `function DataSection()` in `SettingsPage.tsx`. Add at the top of its function body:
```typescript
  const qc = useQueryClient();
  const clearSample = useMutation({
    mutationFn: () => window.ledger.trades.clearSample() as Promise<{ count: number }>,
    onSuccess: ({ count }) => {
      qc.invalidateQueries({ queryKey: ['trades'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast(
        count > 0
          ? `Cleared ${count} sample trade${count !== 1 ? 's' : ''}`
          : 'No sample trades to clear',
        { variant: count > 0 ? 'default' : 'default' },
      );
    },
    onError: () => toast('Failed to clear sample trades', { variant: 'error' }),
  });
```

- [ ] **Step 3: Add the `useToast` import and hook call**

At the top of `DataSection`, add:
```typescript
  const { toast } = useToast();
```

Check the import line at the top of the file — `useToast` should already be imported from `@/components/ui/toast`. If not, add it.

- [ ] **Step 4: Add the button row inside `DataSection` JSX**

Find the last `<Row>` inside `DataSection` (the one with "Open Folder" button). Insert a new row after it, still inside `<Section>`:
```tsx
      <Row label="Sample Data" description="Remove the demo trades loaded on first launch.">
        <Button
          size="xs"
          variant="destructive"
          disabled={clearSample.isPending}
          onClick={() => clearSample.mutate()}
        >
          {clearSample.isPending ? 'Clearing…' : 'Clear Sample Trades'}
        </Button>
      </Row>
```

- [ ] **Step 5: Verify `useMutation` and `useQueryClient` are imported**

Check that the file already imports these from `@tanstack/react-query`. If not, add them to the existing import line.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck 2>&1
```
Expected: zero errors.

- [ ] **Step 7: Run tests**

```bash
npm test 2>&1 | tail -6
```
Expected: 165 passed.

- [ ] **Step 8: Commit Tasks 2–5 together**

```bash
git add src/lib/db/queries.ts electron/ipc/trades.ts electron/preload.ts src/pages/SettingsPage.tsx
git commit -m "feat(settings): add Clear Sample Trades button in Data section"
```

---

## Task 6 — Verify `bridge.ts` vs `bridge-watcher.ts` separation

**Context:** The audit found two bridge implementations. Investigation shows they serve **different purposes**:
- `bridge-watcher.ts` — auto-watches the `<data_dir>/bridge/inbox/` folder on startup. Handles the automatic EA file pickup.
- `bridge.ts` (IPC) — watches a **user-configured** MQL files folder (different path). Handles the Settings → Bridge → Watch Directory flow with pause/resume/status.

They are NOT duplicates. However, both have their own `processFile` implementations that may diverge. This task consolidates the file-processing logic.

- [ ] **Step 1: Read `bridge.ts` processFile (lines 200–430) and `bridge-watcher.ts` processFile**

```bash
sed -n '200,430p' "c:/Users/3Consult/Documents/ChidiGit/mine/FX Trading Journal/electron/ipc/bridge.ts"
```

- [ ] **Step 2: Compare for logic divergence**

Key differences to look for:
- Does `bridge.ts` also populate `bridge_files` table? (bridge-watcher does since our fix)
- Does `bridge.ts` use `withAsyncTransaction`? (bridge-watcher does)
- Does `bridge.ts` call `refreshTradeFts`? (queries.ts `createTrade` does, so yes indirectly)

- [ ] **Step 3: If `bridge.ts` does NOT populate `bridge_files`, add the same insert logic**

The same PROCESSED/FAILED insert pattern from `bridge-watcher.ts` lines 509-556 should be added to `bridge.ts processFile()` success and catch paths.

- [ ] **Step 4: If `bridge.ts` does NOT use `withAsyncTransaction`, wrap its inserts**

Import `withAsyncTransaction` from `../../src/lib/db/client` and wrap the trade + leg inserts identically to `bridge-watcher.ts`.

- [ ] **Step 5: Typecheck + tests**

```bash
npm run typecheck 2>&1 && npm test 2>&1 | tail -6
```
Expected: 0 errors, 165 passed.

- [ ] **Step 6: Commit**

```bash
git add electron/ipc/bridge.ts
git commit -m "fix(bridge): align bridge.ts processFile with bridge-watcher (atomic inserts, bridge_files logging)"
```

---

## Task 7 — E2E smoke test with Playwright

**Files:**
- Create: `tests/e2e/smoke.test.ts`
- Modify: `package.json` (add `test:e2e` script)
- Modify: `electron.vite.config.ts` if needed (confirm E2E entry point)

**Context:** Playwright's `@playwright/test` can launch Electron apps. The test verifies the app boots, the blotter renders the sample trades, and the dashboard page loads without crash. This catches regressions that unit tests cannot.

- [ ] **Step 1: Install `@playwright/test` as devDependency**

```bash
cd "c:\Users\3Consult\Documents\ChidiGit\mine\FX Trading Journal"
npm install --save-dev @playwright/test 2>&1 | tail -5
```

- [ ] **Step 2: Create `tests/e2e/smoke.test.ts`**

```typescript
/**
 * Ledger — E2E smoke test
 *
 * Launches the packaged Electron app (via electron-vite dev build),
 * verifies the blotter renders with sample data, and navigates to the dashboard.
 *
 * Run with: npm run test:e2e
 * Requires: npm run build first (or electron-vite dev server)
 */
import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';

const APP_ENTRY = join(__dirname, '../../dist-electron/main.cjs');

test.describe('Ledger smoke tests', () => {
  test('app launches and blotter renders', async () => {
    const app = await electron.launch({
      args: [APP_ENTRY],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ELECTRON_IS_TEST: '1',
      },
    });

    try {
      // Wait for first window
      const page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');

      // App shell should render — sidebar with "Blotter" nav item
      await expect(page.locator('text=Blotter')).toBeVisible({ timeout: 15000 });

      // Blotter table should render (sample trades exist)
      await expect(page.locator('[data-testid="blotter-table"]').or(
        page.locator('table')
      )).toBeVisible({ timeout: 10000 });
    } finally {
      await app.close();
    }
  });

  test('dashboard page loads without crash', async () => {
    const app = await electron.launch({
      args: [APP_ENTRY],
      env: { ...process.env, NODE_ENV: 'test', ELECTRON_IS_TEST: '1' },
    });

    try {
      const page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');

      // Navigate to dashboard via sidebar
      const dashboardLink = page.locator('text=Dashboard').first();
      await dashboardLink.waitFor({ timeout: 15000 });
      await dashboardLink.click();

      // Dashboard should render at least one widget card
      await expect(
        page.locator('text=Equity').or(page.locator('text=Net P&L'))
      ).toBeVisible({ timeout: 10000 });
    } finally {
      await app.close();
    }
  });

  test('trade form opens and closes', async () => {
    const app = await electron.launch({
      args: [APP_ENTRY],
      env: { ...process.env, NODE_ENV: 'test', ELECTRON_IS_TEST: '1' },
    });

    try {
      const page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');

      // Find and click the "New Trade" button
      const newTradeBtn = page.locator('text=New Trade').or(
        page.locator('[data-testid="new-trade-btn"]')
      ).first();
      await newTradeBtn.waitFor({ timeout: 15000 });
      await newTradeBtn.click();

      // Dialog should open
      await expect(
        page.locator('text=Log a Trade').or(page.locator('[role="dialog"]'))
      ).toBeVisible({ timeout: 5000 });

      // Close it
      await page.keyboard.press('Escape');
      await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 3000 });
    } finally {
      await app.close();
    }
  });
});
```

- [ ] **Step 3: Add `test:e2e` script to `package.json`**

Find `"scripts"` in `package.json`. Add after `"test:watch"`:
```json
"test:e2e": "npm run build && playwright test tests/e2e/",
```

- [ ] **Step 4: Create `playwright.config.ts` at project root**

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  retries: 0,
  reporter: 'list',
  use: {
    headless: false, // Electron doesn't support headless mode
  },
});
```

- [ ] **Step 5: Run the E2E tests**

```bash
cd "c:\Users\3Consult\Documents\ChidiGit\mine\FX Trading Journal"
npm run build 2>&1 | tail -5
npx playwright test tests/e2e/ 2>&1
```

Expected: All 3 tests pass. If tests fail due to timing, increase `timeout` values.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck 2>&1
```

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/smoke.test.ts package.json playwright.config.ts
git commit -m "test(e2e): add Playwright smoke tests for launch, blotter, dashboard, trade form"
```

---

## Task 8 — Final pre-release verification

- [ ] **Step 1: Full test suite**

```bash
cd "c:\Users\3Consult\Documents\ChidiGit\mine\FX Trading Journal"
npm test 2>&1 | tail -8
```
Expected: 165 tests pass (all 6 unit test files).

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck 2>&1
```
Expected: zero errors.

- [ ] **Step 3: Lint**

```bash
npm run lint 2>&1
```
Expected: zero errors.

- [ ] **Step 4: Build**

```bash
npm run build 2>&1 | tail -5
```
Expected: builds cleanly, no errors.

- [ ] **Step 5: Package installer**

```bash
npm run package:win 2>&1 | tail -10
```
Expected: `release/Ledger Setup 1.0.0.exe` produced (~100 MB).

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: pre-release verification — all tests pass, installer builds"
```

---

## Self-Review Checklist

- [x] R12 (no trade data in logs): Task 1 removes prices from console.warn
- [x] Clear Sample Data: Tasks 2–5 cover queries → IPC → preload → UI
- [x] Bridge duplication: Task 6 verifies and aligns bridge.ts with bridge-watcher.ts
- [x] E2E coverage: Task 7 adds Playwright smoke tests for 3 critical flows
- [x] Full pre-release gate: Task 8 runs all checks before packaging
- [x] No placeholders: all code shown in full
- [x] Type consistency: `clearSampleData` used consistently across all layers
