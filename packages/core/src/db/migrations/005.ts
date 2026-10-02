import type { Database } from '../database.js';

export const migration005 = {
  version: 5,
  up(db: Database): void {
    db.exec(`
      ALTER TABLE profiles ADD COLUMN environment_mode TEXT NOT NULL DEFAULT 'auto'
        CHECK (environment_mode IN ('auto', 'manual'));
      ALTER TABLE profiles ADD COLUMN latitude REAL;
      ALTER TABLE profiles ADD COLUMN longitude REAL;
      ALTER TABLE profiles ADD COLUMN accuracy REAL CHECK (accuracy IS NULL OR accuracy >= 0);

      CREATE TABLE network_identity_cache (
        route_key TEXT PRIMARY KEY,
        public_ip TEXT NOT NULL,
        country_iso TEXT,
        city_name TEXT,
        timezone TEXT,
        latitude REAL,
        longitude REAL,
        accuracy REAL CHECK (accuracy IS NULL OR accuracy >= 0),
        resolved_at TEXT NOT NULL,
        source_db_version TEXT
      );

      CREATE INDEX idx_network_identity_cache_resolved_at
        ON network_identity_cache(resolved_at);
    `);
  }
} as const;
