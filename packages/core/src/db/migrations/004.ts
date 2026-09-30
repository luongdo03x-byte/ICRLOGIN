import type { Database } from '../database.js';

export const migration004 = {
  version: 4,
  up(db: Database): void {
    db.exec(`
      CREATE TABLE backup_history (
        id TEXT PRIMARY KEY,
        profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
        mode TEXT NOT NULL CHECK (mode IN ('metadata', 'full')),
        file_name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
        created_at TEXT NOT NULL
      );

      CREATE INDEX idx_backup_history_profile_id ON backup_history(profile_id);
      CREATE INDEX idx_backup_history_created_at ON backup_history(created_at);
    `);
  }
} as const;
