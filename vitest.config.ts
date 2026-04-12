import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Exclude Playwright E2E tests — those are run via `npm run test:e2e`, not vitest
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
  },
});
