/**
 * Shared helpers for Ledger E2E acceptance tests.
 *
 * Each test should call launchApp() in beforeAll/beforeEach and cleanup()
 * in afterAll/afterEach. Data isolation is achieved by setting APPDATA to a
 * unique temp directory — Electron reads APPDATA to compute the default
 * data dir (join(app.getPath('appData'), 'Ledger')).
 */

import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MAIN_PATH = join(__dirname, '../../dist-electron/main.cjs');

export interface LaunchResult {
  app: ElectronApplication;
  window: Page;
  dataDir: string;
  cleanup: () => Promise<void>;
}

export async function launchApp(): Promise<LaunchResult> {
  const fakeAppData = join(tmpdir(), `ledger-e2e-${randomUUID()}`);
  mkdirSync(fakeAppData, { recursive: true });

  const app = await electron.launch({
    args: [MAIN_PATH],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      APPDATA: fakeAppData,
    },
  });

  const window = await app.firstWindow();
  await window.waitForLoadState('networkidle', { timeout: 30_000 });

  const dataDir = join(fakeAppData, 'Ledger');

  const cleanup = async () => {
    await app.close().catch(() => undefined);
    rmSync(fakeAppData, { recursive: true, force: true });
  };

  return { app, window, dataDir, cleanup };
}

/** Create a trading account via IPC. Returns accountId. */
export async function seedAccount(
  window: Page,
  opts: {
    name?: string;
    type?: 'PROP' | 'LIVE' | 'DEMO';
    balance?: number;
    propRules?: {
      dailyLossLimitPct?: number;
      maxDrawdownPct?: number;
      profitTargetPct?: number;
    };
  } = {},
): Promise<string> {
  return window.evaluate(async (o) => {
    const w = window as unknown as {
      ledger: {
        accounts: {
          create: (d: unknown) => Promise<{ id: string } | string>;
        };
      };
    };
    // Randomize default name to avoid UNIQUE collisions with first-run
    // sample seed data or with other tests sharing a data folder.
    const uniq = Math.random().toString(36).slice(2, 8);
    const payload: Record<string, unknown> = {
      name: o.name ?? `E2E Account ${uniq}`,
      accountType: o.type ?? 'LIVE',
      accountCurrency: 'USD',
      initialBalance: o.balance ?? 10000,
    };
    if (o.propRules) {
      if (o.propRules.dailyLossLimitPct !== undefined)
        payload.propDailyLossPct = o.propRules.dailyLossLimitPct;
      if (o.propRules.maxDrawdownPct !== undefined)
        payload.propMaxDrawdownPct = o.propRules.maxDrawdownPct;
      if (o.propRules.profitTargetPct !== undefined)
        payload.propProfitTargetPct = o.propRules.profitTargetPct;
      payload.accountType = 'PROP';
      payload.propPhase = 'PHASE_1';
      payload.propDrawdownType = 'STATIC';
    }
    const result = await w.ledger.accounts.create(payload);
    return typeof result === 'string' ? result : result.id;
  }, opts);
}

/** Create N closed trades via IPC. All trades are simple EURUSD LONG. */
export async function seedTrades(
  window: Page,
  count: number,
  opts: { accountId: string; symbol?: string; netPnl?: number } = { accountId: '' },
): Promise<void> {
  await window.evaluate(
    async ([accountId, symbol, netPnl, count]) => {
      const w = window as unknown as {
        ledger: {
          trades: { create: (d: unknown) => Promise<{ id: string }> };
          legs: { create: (d: unknown) => Promise<unknown> };
        };
      };
      for (let i = 0; i < (count as number); i++) {
        const base = new Date('2024-01-15T09:00:00Z');
        base.setHours(base.getHours() + i);
        const open = base.toISOString();
        base.setHours(base.getHours() + 2);
        const close = base.toISOString();
        const exitPrice =
          (netPnl as number) < 0 ? 1.08200 : 1.09100;
        // Step 1: create OPEN trade with entry leg (schema: CreateTradeSchema)
        const created = await w.ledger.trades.create({
          accountId,
          symbol: symbol ?? 'EURUSD',
          direction: 'LONG',
          source: 'MANUAL',
          initialStopPrice: 1.08200,
          entryLeg: {
            timestampUtc: open,
            price: 1.08500,
            volumeLots: 0.10,
            commission: -3.50,
            swap: 0.0,
          },
        });
        // Step 2: post EXIT leg — recompute closes the trade automatically
        await w.ledger.legs.create({
          tradeId: created.id,
          legType: 'EXIT',
          timestampUtc: close,
          price: exitPrice,
          volumeLots: 0.10,
          commission: -3.50,
          swap: 0.0,
        });
      }
    },
    [opts.accountId, opts.symbol ?? 'EURUSD', opts.netPnl ?? 60, count] as const,
  );
}

/** Drop a bridge event JSON file into the app's bridge/inbox dir. */
export function dropBridgeEvent(dataDir: string, fixturePath: string): void {
  const inboxDir = join(dataDir, 'bridge', 'inbox');
  mkdirSync(inboxDir, { recursive: true });
  const dest = join(inboxDir, `${randomUUID()}.json`);
  copyFileSync(fixturePath, dest);
}

/** Wait for a toast notification containing the given text. */
export async function waitForToast(
  window: Page,
  substring: string,
  timeoutMs = 10_000,
): Promise<void> {
  await window
    .locator('[data-radix-toast-viewport] li, [role="status"]', { hasText: substring })
    .waitFor({ state: 'visible', timeout: timeoutMs });
}

/** Navigate via sidebar link. path must match an href. */
export async function navigateTo(window: Page, path: string): Promise<void> {
  await window.click(`a[href="${path}"]`, { timeout: 10_000 });
  await window.waitForLoadState('networkidle', { timeout: 10_000 });
}
