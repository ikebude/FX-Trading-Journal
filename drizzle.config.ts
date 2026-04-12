import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration.
 *
 * - schema:    where our Drizzle table definitions live
 * - out:       where generated migration SQL files are written
 * - dialect:   SQLite (via better-sqlite3 at runtime)
 * - dbCredentials.url: path used only for drizzle-kit introspection
 *   (at runtime the actual path comes from config.json data_dir)
 */
export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: './ledger.db',
  },
});
