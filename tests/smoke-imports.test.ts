/**
 * Smoke-import regression suite.
 *
 * Iterates every file in `tests/fixtures/` and feeds it through
 * `detectAndParse` via the same code path used by the Electron IPC
 * handler (raw buffer → `decodeImportBuffer` → parser). The goal is to
 * catch broker-format regressions the moment a fixture is added, before
 * users hit them.
 *
 * Contract per fixture:
 *   1. Format must NOT be detected as UNKNOWN.
 *   2. At least one trade must be parsed.
 *   3. `result.failed.length` must stay ≤ `result.trades.length`
 *      (i.e. we must not be silently dropping more than we keep).
 *
 * Add new fixtures simply by dropping them into `tests/fixtures/` — no
 * test code changes required.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { detectAndParse } from '../src/lib/importers/detect';
import { decodeImportBuffer } from '../src/lib/importers/encoding';

const FIXTURES_DIR = join(__dirname, 'fixtures');

function listFixtureFiles(): string[] {
  try {
    return readdirSync(FIXTURES_DIR)
      .filter((name) => {
        const p = join(FIXTURES_DIR, name);
        return statSync(p).isFile();
      });
  } catch {
    return [];
  }
}

const fixtures = listFixtureFiles();

describe('Smoke imports — every fixture parses through detectAndParse', () => {
  if (fixtures.length === 0) {
    it.skip('no fixtures present', () => {});
    return;
  }

  for (const name of fixtures) {
    it(`parses fixture "${name}" without UNKNOWN format and with ≥1 trade`, () => {
      const buf = readFileSync(join(FIXTURES_DIR, name));
      const content = decodeImportBuffer(buf);
      const { format, result } = detectAndParse(content, name);

      expect(format, `format for ${name}`).not.toBe('UNKNOWN');
      expect(result.trades.length, `trades parsed from ${name}`).toBeGreaterThan(0);
      // Never silently drop more than we keep.
      expect(
        result.failed.length,
        `failed rows should not exceed parsed trades for ${name}`,
      ).toBeLessThanOrEqual(result.trades.length);
    });
  }
});
