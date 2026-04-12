/**
 * Ledger — E2E smoke tests (Playwright + Electron)
 *
 * Prerequisites: `npm run build` must be run before these tests.
 * The suite launches the Electron app from dist-electron/main.cjs and
 * verifies the three most critical render paths:
 *   1. App launches without crashing and a window appears
 *   2. The dashboard route loads without renderer console errors
 *   3. The settings page shows the "Clear Sample Trades" button
 *
 * Run: npm run test:e2e
 */

import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const MAIN_PATH = join(__dirname, '../../dist-electron/main.cjs');

test.beforeAll(() => {
  if (!existsSync(MAIN_PATH)) {
    throw new Error(
      `E2E: built Electron main not found at ${MAIN_PATH}. ` +
        'Run "npm run build" before running test:e2e.',
    );
  }
});

// Each test gets its own Electron instance so tests are fully isolated.

test('1 — app launches and main window appears', async () => {
  const app = await electron.launch({
    args: [MAIN_PATH],
    env: { ...process.env, NODE_ENV: 'test' },
  });

  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const title = await window.title();
    // Title may be empty string in Electron before the renderer sets it,
    // but the window must exist and not crash.
    expect(typeof title).toBe('string');

    // Check the renderer loaded React (root element should be populated).
    const root = window.locator('#root');
    await expect(root).not.toBeEmpty({ timeout: 15_000 });
  } finally {
    await app.close();
  }
});

test('2 — dashboard route renders without console errors', async () => {
  const app = await electron.launch({
    args: [MAIN_PATH],
    env: { ...process.env, NODE_ENV: 'test' },
  });

  try {
    const window = await app.firstWindow();

    const consoleErrors: string[] = [];
    window.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await window.waitForLoadState('networkidle', { timeout: 20_000 });

    // Dashboard is the default route — check a dashboard-specific element exists.
    // The sidebar "Dashboard" link is always rendered.
    const sidebar = window.locator('[data-tour="sidebar-dashboard"], a[href="/dashboard"]');
    await expect(sidebar).toBeVisible({ timeout: 15_000 });

    expect(
      consoleErrors.filter(
        // Ignore known benign Electron/Chromium messages
        (e) => !e.includes('DevTools') && !e.includes('autofill'),
      ),
    ).toHaveLength(0);
  } finally {
    await app.close();
  }
});

test('3 — settings page shows Clear Sample Trades button', async () => {
  const app = await electron.launch({
    args: [MAIN_PATH],
    env: { ...process.env, NODE_ENV: 'test' },
  });

  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('networkidle', { timeout: 20_000 });

    // Click the Settings link in the sidebar
    await window.click('[data-tour="sidebar-settings"], a[href="/settings"]', {
      timeout: 15_000,
    });

    // The "Clear Sample Trades" button must be visible in the Data section
    const btn = window.locator('button', { hasText: 'Clear Sample Trades' });
    await expect(btn).toBeVisible({ timeout: 10_000 });
  } finally {
    await app.close();
  }
});
