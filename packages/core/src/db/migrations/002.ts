import type { Database } from '../database.js';

export const migration002 = {
  version: 2,
  up(db: Database): void {
    db.exec(`
      CREATE TABLE groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      UPDATE profiles SET group_id = NULL WHERE group_id IS NOT NULL;

      CREATE TRIGGER profiles_group_id_insert
      BEFORE INSERT ON profiles
      WHEN NEW.group_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM groups WHERE id = NEW.group_id)
      BEGIN
        SELECT RAISE(ABORT, 'invalid group_id');
      END;

      CREATE TRIGGER profiles_group_id_update
      BEFORE UPDATE OF group_id ON profiles
      WHEN NEW.group_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM groups WHERE id = NEW.group_id)
      BEGIN
        SELECT RAISE(ABORT, 'invalid group_id');
      END;

      CREATE INDEX idx_profiles_group_id ON profiles(group_id);
      CREATE INDEX idx_groups_sort_order ON groups(sort_order, name);
    `);
  }
} as const;
