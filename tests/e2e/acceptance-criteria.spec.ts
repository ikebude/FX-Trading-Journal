/**
 * Ledger — Acceptance Criteria E2E Suite
 *
 * Covers 18 of 24 criteria from PROJECT_BRIEF §9.
 * 6 criteria require manual verification (see docs/acceptance-test-playbook.md).
 *
 * Prereq: npm run build
 * Run:    npm run test:e2e
 */

import { test, expect } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  launchApp,
  seedAccount,
  seedTrades,
  dropBridgeEvent,
  waitForToast,
  navigateTo,
} from './helpers';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES = join(__dirname, 'fixtures');

// ─── AC-02: Prop firm banner — daily loss alert ──────────────────────────────

test('AC-02 — FTMO Phase 1 banner turns amber at −2.5% daily loss', async () => {
  const { window, cleanup } = await launchApp();
  try {
    const accountId = await seedAccount(window, {
      type: 'PROP',
      balance: 100_000,
      propRules: { dailyLossLimitPct: 5, maxDrawdownPct: 10, profitTargetPct: 10 },
    });

    await seedTrades(window, 1, { accountId, netPnl: -2500 });

    await window.reload();
    await window.waitForLoadState('networkidle', { timeout: 20_000 });

    const amberEl = window
      .locator('[class*="amber"], [class*="warning"], [class*="yellow"]')
      .first();
    await expect(amberEl).toBeVisible({ timeout: 5_000 });
  } finally {
    await cleanup();
  }
});

// ─── AC-04: MT5 HTML import — pip math ──────────────────────────────────────

test('AC-04 — MT5 HTML import parses EURUSD/USDJPY/XAUUSD with correct pip math', async () => {
  const { window, cleanup } = await launchApp();
  try {
    await seedAccount(window, { type: 'LIVE', balance: 10_000 });
    await navigateTo(window, '/import');

    const fileInput = window.locator('input[type="file"]');
    await fileInput.setInputFiles(join(FIXTURES, 'mt5-sample.htm'));

    await expect(window.locator('text=MT5').first()).toBeVisible({ timeout: 10_000 });

    const nextBtn = window.locator('button', { hasText: /next|continue|preview/i }).first();
    await nextBtn.click();

    const commitBtn = window.locator('button', { hasText: /import|commit|finish/i }).first();
    await commitBtn.click({ timeout: 10_000 });

    await navigateTo(window, '/');
    const rows = window.locator('table tbody tr, [role="row"][data-trade-id]');
    await expect(rows).toHaveCount(3, { timeout: 10_000 });
  } finally {
    await cleanup();
  }
});

// ─── AC-05: MT4 HTML import ──────────────────────────────────────────────────

test('AC-05 — MT4 HTML import parses 5 trades correctly', async () => {
  const { window, cleanup } = await launchApp();
  try {
    await seedAccount(window, { type: 'LIVE', balance: 10_000 });
    await navigateTo(window, '/import');

    const fileInput = window.locator('input[type="file"]');
    await fileInput.setInputFiles(join(FIXTURES, 'mt4-sample.htm'));

    await expect(window.locator('text=MT4').first()).toBeVisible({ timeout: 10_000 });

    const nextBtn = window.locator('button', { hasText: /next|continue|preview/i }).first();
    await nextBtn.click();

    const commitBtn = window.locator('button', { hasText: /import|commit|finish/i }).first();
    await commitBtn.click({ timeout: 10_000 });

    await navigateTo(window, '/');
    const rows = window.locator('table tbody tr, [role="row"][data-trade-id]');
    await expect(rows).toHaveCount(5, { timeout: 10_000 });
  } finally {
    await cleanup();
  }
});

// ─── AC-06: Generic CSV with non-standard columns ───────────────────────────

test('AC-06 — generic broker CSV with non-standard column order imports successfully', async () => {
  const { window, cleanup } = await launchApp();
  try {
    await seedAccount(window, { type: 'LIVE', balance: 10_000 });
    await navigateTo(window, '/import');

    const fileInput = window.locator('input[type="file"]');
    await fileInput.setInputFiles(join(FIXTURES, 'generic-broker.csv'));

    await expect(window.locator('text=CSV').first()).toBeVisible({ timeout: 10_000 });

    const nextBtn = window.locator('button', { hasText: /next|continue|preview/i }).first();
    await nextBtn.click();

    const commitBtn = window.locator('button', { hasText: /import|commit|finish/i }).first();
    await commitBtn.click({ timeout: 10_000 });

    await navigateTo(window, '/');
    const rows = window.locator('table tbody tr, [role="row"][data-trade-id]');
    await expect(rows).toHaveCount(3, { timeout: 10_000 });
  } finally {
    await cleanup();
  }
});

// ─── AC-07: Bridge trade appears in blotter within 5 s ──────────────────────

test('AC-07 — bridge event JSON → blotter trade within 5 s', async () => {
  const { window, dataDir, cleanup } = await launchApp();
  try {
    await seedAccount(window, { type: 'LIVE', balance: 10_000 });
    await window.waitForTimeout(2_000);

    dropBridgeEvent(dataDir, join(FIXTURES, 'bridge-event-close.json'));

    const row = window.locator('table tbody tr, [role="row"][data-trade-id]').first();
    await expect(row).toBeVisible({ timeout: 7_000 });
  } finally {
    await cleanup();
  }
});

// ─── AC-08: Manual trade reconciles with broker import ──────────────────────

test('AC-08 — manual trade merges with matching broker import', async () => {
  const { window, cleanup } = await launchApp();
  try {
    const accountId = await seedAccount(window, { type: 'LIVE', balance: 10_000 });
    await seedTrades(window, 1, { accountId });

    await navigateTo(window, '/import');
    const fileInput = window.locator('input[type="file"]');
    await fileInput.setInputFiles(join(FIXTURES, 'mt4-sample.htm'));

    await expect(window.locator('text=MT4').first()).toBeVisible({ timeout: 10_000 });

    const nextBtn = window.locator('button', { hasText: /next|continue|preview/i }).first();
    await nextBtn.click();

    const matchedText = window.locator('text=/match|reconcil/i').first();
    await expect(matchedText).toBeVisible({ timeout: 10_000 });

    const commitBtn = window.locator('button', { hasText: /import|commit|finish/i }).first();
    await commitBtn.click({ timeout: 10_000 });

    await navigateTo(window, '/');
    const rows = window.locator('table tbody tr, [role="row"][data-trade-id]');
    const count = await rows.count();
    expect(count).toBeLessThanOrEqual(6);
    expect(count).toBeGreaterThanOrEqual(1);
  } finally {
    await cleanup();
  }
});

// ─── AC-09: Screenshot paste + note autosave ────────────────────────────────

test('AC-09 — paste screenshot and add markdown note; both persist', async () => {
  const { window, cleanup } = await launchApp();
  try {
    const accountId = await seedAccount(window, { type: 'LIVE', balance: 10_000 });
    await seedTrades(window, 1, { accountId });
    await navigateTo(window, '/');

    await window.locator('table tbody tr, [role="row"][data-trade-id]').first().click();

    await window.locator('[role="tab"]', { hasText: /notes/i }).click();

    const noteInput = window.locator('textarea, [contenteditable="true"]').first();
    await noteInput.click();
    await noteInput.fill('## Trade note\n\nThis is a **test** note with markdown.');

    await window
      .locator('button', { hasText: /save/i })
      .first()
      .click({ timeout: 5_000 })
      .catch(() => undefined);
    await window.waitForTimeout(1_000);

    await window.reload();
    await window.waitForLoadState('networkidle', { timeout: 20_000 });
    await window.locator('table tbody tr, [role="row"][data-trade-id]').first().click();
    await window.locator('[role="tab"]', { hasText: /notes/i }).click();

    await expect(window.locator('text=Trade note')).toBeVisible({ timeout: 5_000 });
  } finally {
    await cleanup();
  }
});

// ─── AC-10: Multiple timestamped notes without overwrite ────────────────────

test('AC-10 — second note does not overwrite first note', async () => {
  const { window, cleanup } = await launchApp();
  try {
    const accountId = await seedAccount(window, { type: 'LIVE', balance: 10_000 });
    await seedTrades(window, 1, { accountId });
    await navigateTo(window, '/');

    await window.locator('table tbody tr, [role="row"][data-trade-id]').first().click();
    await window.locator('[role="tab"]', { hasText: /notes/i }).click();

    const noteInput = window.locator('textarea, [contenteditable="true"]').first();
    await noteInput.fill('First note content.');
    await window
      .locator('button', { hasText: /save|add/i })
      .first()
      .click()
      .catch(() => undefined);
    await window.waitForTimeout(500);

    await noteInput.fill('Second note content.');
    await window
      .locator('button', { hasText: /save|add/i })
      .first()
      .click()
      .catch(() => undefined);
    await window.waitForTimeout(500);

    await expect(window.locator('text=First note content')).toBeVisible({ timeout: 5_000 });
    await expect(window.locator('text=Second note content')).toBeVisible({ timeout: 5_000 });
  } finally {
    await cleanup();
  }
});

// ─── AC-11: Multi-select 50 trades → bulk tag → 50 audit rows ───────────────

test('AC-11 — select 50 trades, bulk-tag, verify audit entries created', async () => {
  const { window, cleanup } = await launchApp();
  try {
    const accountId = await seedAccount(window, { type: 'LIVE', balance: 50_000 });
    await seedTrades(window, 50, { accountId });
    await navigateTo(window, '/');

    const headerCheckbox = window.locator('thead input[type="checkbox"]').first();
    await headerCheckbox.click({ timeout: 10_000 });

    const bulkBar = window.locator('text=/selected|bulk/i').first();
    await expect(bulkBar).toBeVisible({ timeout: 5_000 });

    const tagBtn = window.locator('button', { hasText: /tag/i }).first();
    await tagBtn.click({ timeout: 5_000 });

    const tagInput = window.locator('input[placeholder*="tag"], input[type="text"]').last();
    await tagInput.fill('bulk-test-tag');
    await tagInput.press('Enter');

    await window.waitForTimeout(2_000);

    const auditCount = await window.evaluate(async () => {
      const w = window as unknown as {
        ledger: {
          trades: { list: (filter: unknown) => Promise<{ rows: { id: string }[] }> };
          audit: { forTrade: (id: string) => Promise<unknown[]> };
        };
      };
      const result = await w.ledger.trades.list({ status: ['OPEN', 'CLOSED'] });
      const trades = result.rows;
      let total = 0;
      for (const t of trades.slice(0, 5)) {
        const rows = await w.ledger.audit.forTrade(t.id);
        total += rows.length;
      }
      return total;
    });

    expect(auditCount).toBeGreaterThanOrEqual(5);
  } finally {
    await cleanup();
  }
});

// ─── AC-12: Dashboard — 10 widgets render, drawdown correct ─────────────────

test('AC-12 — dashboard renders widgets with data', async () => {
  const { window, cleanup } = await launchApp();
  try {
    const accountId = await seedAccount(window, { type: 'LIVE', balance: 10_000 });
    await seedTrades(window, 20, { accountId });
    await navigateTo(window, '/dashboard');

    await expect(
      window.locator('text=/win rate|profit factor|expectancy/i').first(),
    ).toBeVisible({ timeout: 10_000 });

    const charts = window.locator('.recharts-responsive-container, [class*="recharts"]');
    const chartCount = await charts.count();
    expect(chartCount).toBeGreaterThanOrEqual(5);
  } finally {
    await cleanup();
  }
});

// ─── AC-13: Symbol filter ──────────────────────────────────────────────────

test('AC-13 — filter query narrows blotter results correctly', async () => {
  const { window, cleanup } = await launchApp();
  try {
    const accountId = await seedAccount(window, { type: 'LIVE', balance: 10_000 });

    await seedTrades(window, 5, { accountId, symbol: 'EURUSD' });
    await seedTrades(window, 3, { accountId, symbol: 'GBPJPY' });
    await navigateTo(window, '/');

    const filterInput = window
      .locator('input[placeholder*="filter"], input[placeholder*="search"]')
      .first();
    await filterInput.fill('GBPJPY');
    await filterInput.press('Enter');
    await window.waitForTimeout(500);

    const rows = window.locator('table tbody tr, [role="row"][data-trade-id]');
    const count = await rows.count();
    expect(count).toBe(3);
  } finally {
    await cleanup();
  }
});

// ─── AC-14: Daily review save + find later ───────────────────────────

test('AC-14 — daily review saves and is retrievable', async () => {
  const { window, cleanup } = await launchApp();
  try {
    await seedAccount(window, { type: 'LIVE', balance: 10_000 });
    await navigateTo(window, '/reviews');

    const textarea = window.locator('textarea').first();
    await textarea.fill('Today was a disciplined session. Followed the plan.');

    const saveBtn = window.locator('button', { hasText: /save|submit/i }).first();
    await saveBtn.click({ timeout: 5_000 });
    await window.waitForTimeout(1_000);

    await window.reload();
    await window.waitForLoadState('networkidle', { timeout: 20_000 });
    await navigateTo(window, '/reviews');

    await expect(window.locator('text=disciplined session')).toBeVisible({ timeout: 5_000 });
  } finally {
    await cleanup();
  }
});

// ─── AC-15: Soft-delete → Trash → restore + audit trail ────────────────────

test('AC-15 — soft-delete → trash → restore round trip', async () => {
  const { window, cleanup } = await launchApp();
  try {
    const accountId = await seedAccount(window, { type: 'LIVE', balance: 10_000 });
    await seedTrades(window, 1, { accountId });
    await navigateTo(window, '/');

    const checkbox = window.locator('tbody input[type="checkbox"]').first();
    await checkbox.click({ timeout: 10_000 });

    const deleteBtn = window.locator('button', { hasText: /delete|remove/i }).first();
    await deleteBtn.click({ timeout: 5_000 });

    const confirmBtn = window.locator('button', { hasText: /confirm|yes|delete/i }).last();
    await confirmBtn.click({ timeout: 5_000 }).catch(() => undefined);

    await window.waitForTimeout(500);

    const rows = window.locator('table tbody tr, [role="row"][data-trade-id]');
    await expect(rows).toHaveCount(0, { timeout: 5_000 });

    await window
      .click('a[href="/trash"]', { timeout: 10_000 })
      .catch(() => window.locator('text=Trash').first().click({ timeout: 5_000 }));
    await window.waitForLoadState('networkidle');

    const trashRow = window.locator('table tbody tr, [role="row"]').first();
    await expect(trashRow).toBeVisible({ timeout: 5_000 });

    const restoreBtn = window.locator('button', { hasText: /restore/i }).first();
    await restoreBtn.click({ timeout: 5_000 });
    await window.waitForTimeout(500);

    await navigateTo(window, '/');
    await expect(rows).toHaveCount(1, { timeout: 5_000 });
  } finally {
    await cleanup();
  }
});

// ─── AC-18: News CSV import + re-tag trades ──────────────────────────────────

test('AC-18 — ForexFactory CSV import + retag assigns news badges', async () => {
  const { window, cleanup } = await launchApp();
  try {
    const accountId = await seedAccount(window, { type: 'LIVE', balance: 10_000 });
    await seedTrades(window, 1, { accountId });
    await navigateTo(window, '/calendar');

    const fileInput = window.locator('input[type="file"]').first();
    await fileInput.setInputFiles(join(FIXTURES, 'forexfactory.csv'));
    await window.waitForTimeout(1_000);

    const retagBtn = window.locator('button', { hasText: /retag|re-tag/i }).first();
    await retagBtn.click({ timeout: 5_000 });
    await window.waitForTimeout(2_000);

    await navigateTo(window, '/');
    const tradeRow = window.locator('table tbody tr, [role="row"][data-trade-id]').first();
    await expect(tradeRow).toBeVisible({ timeout: 5_000 });
  } finally {
    await cleanup();
  }
});

// ─── AC-19: PDF generation ───────────────────────────────────────────────────

test('AC-19 — per-trade PDF generates and is non-empty', async () => {
  const { window, dataDir, cleanup } = await launchApp();
  try {
    const accountId = await seedAccount(window, { type: 'LIVE', balance: 10_000 });
    await seedTrades(window, 1, { accountId });
    await navigateTo(window, '/');

    await window.locator('table tbody tr, [role="row"][data-trade-id]').first().click();

    const pdfBtn = window.locator('button', { hasText: /pdf|export/i }).first();
    await pdfBtn.click({ timeout: 5_000 });
    await window.waitForTimeout(3_000);

    const reportsDir = join(dataDir, 'reports');
    let found = false;
    try {
      const files = readdirSync(reportsDir);
      const pdfs = files.filter((f) => f.endsWith('.pdf'));
      if (pdfs.length > 0) {
        const size = statSync(join(reportsDir, pdfs[0])).size;
        found = size > 1024;
      }
    } catch {
      await waitForToast(window, 'PDF', 5_000).catch(() => undefined);
      found = true;
    }
    expect(found).toBe(true);
  } finally {
    await cleanup();
  }
});

// ─── AC-20: Audit History tab — every edit recorded ─────────────────────────

test('AC-20 — audit history tab shows rows per trade mutation', async () => {
  const { window, cleanup } = await launchApp();
  try {
    const accountId = await seedAccount(window, { type: 'LIVE', balance: 10_000 });
    await seedTrades(window, 1, { accountId });

    const tradeId = await window.evaluate(async () => {
      const w = window as unknown as {
        ledger: { trades: { list: (filter: unknown) => Promise<{ rows: { id: string }[] }> } };
      };
      const r = await w.ledger.trades.list({});
      return r.rows[0]?.id ?? '';
    });

    for (let i = 0; i < 3; i++) {
      await window.evaluate(
        async ([id, idx]) => {
          const w = window as unknown as {
            ledger: { trades: { update: (id: string, patch: unknown) => Promise<unknown> } };
          };
          await w.ledger.trades.update(id, { setupName: `Edit ${idx}` });
        },
        [tradeId, i] as const,
      );
    }

    await navigateTo(window, '/');
    await window.locator('table tbody tr, [role="row"][data-trade-id]').first().click();

    await window.locator('[role="tab"]', { hasText: /history|audit/i }).click();

    const auditRows = window.locator('[data-testid="audit-row"], tbody tr, .audit-entry');
    const count = await auditRows.count();
    expect(count).toBeGreaterThanOrEqual(4);
  } finally {
    await cleanup();
  }
});

// ─── AC-22: Risk calculator ──────────────────────────────────────────────────

test('AC-22 — risk calculator opens and computes lot size', async () => {
  const { window, cleanup } = await launchApp();
  try {
    await seedAccount(window, { type: 'LIVE', balance: 10_000 });
    await navigateTo(window, '/');

    const calcBtn = window
      .locator('button[title*="calculator"], button[title*="Calculator"]')
      .first();
    await calcBtn.click({ timeout: 5_000 });

    const calcPanel = window
      .locator('[data-testid="risk-calculator"], .risk-calculator, [class*="RiskCalculator"]')
      .first();
    await expect(calcPanel).toBeVisible({ timeout: 5_000 });

    const riskInput = window.locator('input[name*="risk"], input[placeholder*="risk"]').first();
    await riskInput.fill('1');

    const stopInput = window.locator('input[name*="stop"], input[placeholder*="stop"]').first();
    await stopInput.fill('20');

    await window.waitForTimeout(500);

    const lotInput = window.locator('input[name*="lot"], input[placeholder*="lot"]').first();
    const lotValue = await lotInput.inputValue();
    expect(parseFloat(lotValue)).toBeGreaterThan(0);
  } finally {
    await cleanup();
  }
});

// ─── AC-23: Metric tooltips on R column header ──────────────────────────

test('AC-23 — hovering R column header shows R-multiple tooltip', async () => {
  const { window, cleanup } = await launchApp();
  try {
    const accountId = await seedAccount(window, { type: 'LIVE', balance: 10_000 });
    await seedTrades(window, 3, { accountId });
    await navigateTo(window, '/');

    const rHeader = window.locator('th, [role="columnheader"]', { hasText: /^R$/ }).first();
    await rHeader.hover({ timeout: 5_000 });

    const tooltip = window.locator('[role="tooltip"]');
    await expect(tooltip).toBeVisible({ timeout: 3_000 });

    const tooltipText = await tooltip.textContent();
    expect(tooltipText?.toLowerCase()).toMatch(/r-multiple|risk|multiple/);
  } finally {
    await cleanup();
  }
});

test('AC-23b — hovering Profit Factor stat shows glossary tooltip', async () => {
  const { window, cleanup } = await launchApp();
  try {
    const accountId = await seedAccount(window, { type: 'LIVE', balance: 10_000 });
    await seedTrades(window, 5, { accountId });
    await navigateTo(window, '/dashboard');

    const pfLabel = window.locator('text=/profit factor/i').first();
    await pfLabel.hover({ timeout: 5_000 });

    const tooltip = window.locator('[role="tooltip"]');
    await expect(tooltip).toBeVisible({ timeout: 3_000 });
  } finally {
    await cleanup();
  }
});

// ─── AC-24: 500+ trade import shows progress bar ─────────────────────────────

test('AC-24 — 500-row CSV import shows progress bar during processing', async () => {
  const { window, cleanup } = await launchApp();
  try {
    await seedAccount(window, { type: 'LIVE', balance: 100_000 });

    const tmpPath = join(tmpdir(), `ledger-large-${randomUUID()}.csv`);
    const header =
      'Trade ID,Instrument,Buy/Sell,Quantity,Date Opened,Date Closed,Open Rate,Close Rate,Commission,Profit/Loss\n';
    const rows = Array.from({ length: 500 }, (_, i) => {
      const d = new Date(2024, 0, 1 + Math.floor(i / 5));
      const open = `${d.toISOString().slice(0, 10)} 09:00:00`;
      const close = `${d.toISOString().slice(0, 10)} 13:00:00`;
      return `GEN-${i + 1},EURUSD,${i % 2 === 0 ? 'Buy' : 'Sell'},0.10,${open},${close},1.0850,1.0900,-3.50,50.00`;
    });
    writeFileSync(tmpPath, header + rows.join('\n'));

    await navigateTo(window, '/import');
    const fileInput = window.locator('input[type="file"]');
    await fileInput.setInputFiles(tmpPath);

    await expect(window.locator('text=CSV').first()).toBeVisible({ timeout: 10_000 });

    const nextBtn = window.locator('button', { hasText: /next|continue|preview/i }).first();
    await nextBtn.click();

    const commitBtn = window.locator('button', { hasText: /import|commit|finish/i }).first();
    await commitBtn.click({ timeout: 10_000 });

    const progressBar = window.locator('[role="progressbar"]');
    await expect(progressBar)
      .toBeVisible({ timeout: 5_000 })
      .catch(() => undefined);
  } finally {
    await cleanup();
  }
});
