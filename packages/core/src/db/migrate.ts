import type { Database } from './database.js';
import { migration001 } from './migrations/001.js';
import { migration002 } from './migrations/002.js';
import { migration003 } from './migrations/003.js';
import { migration004 } from './migrations/004.js';

interface Migration {
  readonly version: number;
  up(db: Database): void;
}

export interface MigrationOptions {
  beforeMigration?: () => Promise<void> | void;
}

const MIGRATIONS: readonly Migration[] = [migration001, migration002, migration003, migration004];

export async function runMigrations(db: Database, options: MigrationOptions = {}): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const rows = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{ version: number }>;
  const applied = new Set(rows.map((row) => Number(row.version)));
  const pending = MIGRATIONS.filter((migration) => !applied.has(migration.version));
  if (pending.length === 0) return;
  if (options.beforeMigration) await options.beforeMigration();

  for (const migration of pending) {
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(
        migration.version,
        new Date().toISOString()
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
