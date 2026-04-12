/**
 * Playwright configuration for Ledger E2E smoke tests.
 *
 * PREREQUISITES: Run `npm run build` before running `npm run test:e2e`.
 * The tests launch the packaged Electron main process from dist-electron/.
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'tests/e2e/report' }]],
  use: {
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
