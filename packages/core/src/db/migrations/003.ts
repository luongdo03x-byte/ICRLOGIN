import type { Database } from '../database.js';

export const migration003 = {
  version: 3,
  up(db: Database): void {
    db.exec(`
      CREATE TABLE tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE profile_tags (
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (profile_id, tag_id)
      );

      CREATE TABLE extensions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK (source_type IN ('unpacked', 'crx')),
        source_path TEXT NOT NULL UNIQUE,
        enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE profile_extensions (
        profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        extension_id TEXT NOT NULL REFERENCES extensions(id) ON DELETE CASCADE,
        PRIMARY KEY (profile_id, extension_id)
      );

      CREATE TABLE group_extensions (
        group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        extension_id TEXT NOT NULL REFERENCES extensions(id) ON DELETE CASCADE,
        PRIMARY KEY (group_id, extension_id)
      );

      CREATE TABLE profile_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        config_json TEXT NOT NULL,
        tag_ids_json TEXT NOT NULL DEFAULT '[]',
        extension_ids_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX idx_profile_tags_tag_id ON profile_tags(tag_id);
      CREATE INDEX idx_profile_extensions_extension_id ON profile_extensions(extension_id);
      CREATE INDEX idx_group_extensions_extension_id ON group_extensions(extension_id);
      CREATE INDEX idx_extensions_enabled ON extensions(enabled);
      CREATE INDEX idx_profile_templates_name ON profile_templates(name);
    `);
  }
} as const;
