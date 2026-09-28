import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import { openDatabase } from '../src/db/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';

describe('database foundation', () => {
  it('configures sqlite and applies migration 001 exactly once', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const db = openDatabase(join(paths.dataDir, 'icrlogin.db'));
      try {
        runMigrations(db);
        runMigrations(db);
        expect(String(db.pragma('journal_mode', { simple: true })).toLowerCase()).toBe('wal');
        expect(Number(db.pragma('foreign_keys', { simple: true }))).toBe(1);
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row: any) => row.name as string);
        for (const table of ['profiles', 'proxies', 'browser_versions', 'runtime_sessions', 'schema_migrations']) expect(tables).toContain(table);
        const count = db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get() as { count: number };
        expect(count.count).toBe(1);
      } finally {
        db.close();
      }
    } finally {
      await removeTempRoot(root);
    }
  });
});
