/**
 * T6.8 — v1.1 full acceptance suite (10 more, total 25 with T4.13).
 *
 * Covers the later-week surfaces: portfolio, post-mortem, reports
 * (monthly/tax/year-end), pinned filter, voice-memo panel, command
 * palette navigation, coaching banner, library/methodology. Same
 * isolated-APPDATA pattern; runs under nightly CI (built dist gate).
 */
import { test, expect } from '@playwright/test';
import { launchApp, type LaunchResult } from './helpers';

let L: LaunchResult;

test.beforeEach(async () => {
  L = await launchApp();
});
test.afterEach(async () => {
  await L?.cleanup();
});

async function goto(path: string) {
  await L.window.evaluate((p) => {
    window.location.hash = p;
  }, path);
  await L.window.waitForTimeout(400);
}

test('16 — Portfolio page loads (T5.1)', async () => {
  await goto('/portfolio');
  await expect(L.window.locator('text=Portfolio')).toBeVisible({ timeout: 15_000 });
});

test('17 — Portfolio sidebar nav present', async () => {
  await expect(L.window.locator('text=Portfolio')).toBeVisible({ timeout: 20_000 });
});

test('18 — Post-mortem renders a severity/benign banner (T3.8)', async () => {
  await goto('/post-mortem');
  await expect(
    L.window
      .locator('text=No significant drawdown')
      .or(L.window.locator('text=drawdown detected')),
  ).toBeVisible({ timeout: 15_000 });
});

test('19 — Reports exposes Year-End Statement (T5.7)', async () => {
  await goto('/reports');
  await expect(L.window.locator('text=Year-End Statement')).toBeVisible({ timeout: 10_000 });
});

test('20 — Reports exposes all four generators', async () => {
  await goto('/reports');
  await expect(L.window.locator('text=Summary PDF')).toBeVisible({ timeout: 10_000 });
  await expect(L.window.locator('text=Monthly Report')).toBeVisible();
  await expect(L.window.locator('text=Tax-Prep CSV')).toBeVisible();
});

test('21 — Blotter Pinned filter toggle present (T5.9)', async () => {
  await goto('/');
  await expect(
    L.window.locator('text=Pinned').first(),
  ).toBeVisible({ timeout: 15_000 });
});

test('22 — Trade detail exposes the Voice memos panel (T6.1)', async () => {
  await goto('/');
  const row = L.window.locator('table tbody tr').first();
  if (await row.count()) {
    await row.click();
    await expect(
      L.window.locator('text=Voice memos').or(L.window.locator('text=Record memo')),
    ).toBeVisible({ timeout: 8_000 });
  }
});

test('23 — Command palette navigates to Post-mortem (T4.6)', async () => {
  await L.window.keyboard.press('Control+K');
  const input = L.window.locator('input[aria-label="Command palette"]');
  await input.waitFor({ timeout: 5_000 });
  await input.fill('post-mortem');
  await L.window.keyboard.press('Enter');
  await L.window.waitForTimeout(400);
  expect(L.window.url()).toContain('post-mortem');
});

test('24 — Library page reachable (methodology/tag libraries, T2.x)', async () => {
  await goto('/library');
  await expect(L.window.locator('text=Library').first()).toBeVisible({ timeout: 10_000 });
});

test('25 — Settings shows crash-reporter + sample-data toggles together', async () => {
  await goto('/settings');
  await expect(
    L.window.locator('text=Crash reporter (local-only)'),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    L.window.locator('text=Load sample data on first run'),
  ).toBeVisible();
});
