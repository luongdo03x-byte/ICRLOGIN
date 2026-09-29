import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import { openDatabase } from '../src/db/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';

describe('database foundation', () => {
  it('configures sqlite and applies migrations exactly once', async () => {
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

        const tables = db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all()
          .map((row: any) => row.name as string);
        for (const table of [
          'profiles', 'proxies', 'browser_versions', 'runtime_sessions', 'groups',
          'tags', 'profile_tags', 'extensions', 'profile_extensions', 'group_extensions',
          'profile_templates', 'schema_migrations'
        ]) expect(tables).toContain(table);

        const versions = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{ version: number }>;
        expect(versions.map((row) => Number(row.version))).toEqual([1, 2, 3]);

        db.prepare(`INSERT INTO profiles(
          id,name,description,group_id,browser_version,proxy_id,user_agent,language,timezone,
          window_width,window_height,screen_width,screen_height,webrtc_enabled,geolocation_mode,
          startup_urls_json,created_at,updated_at,last_used_at,deleted_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          'p1','P1',null,null,'144',null,null,'en-US','UTC',1280,800,1920,1080,1,'ask','[]','x','x',null,null
        );
        db.prepare("INSERT INTO tags(id,name,created_at,updated_at) VALUES ('t1','Social','x','x')").run();
        db.prepare("INSERT INTO profile_tags(profile_id,tag_id) VALUES ('p1','t1')").run();
        expect(() => db.prepare("INSERT INTO profile_tags(profile_id,tag_id) VALUES ('p1','t1')").run()).toThrow();

        db.prepare("INSERT INTO extensions(id,name,version,source_type,source_path,enabled,created_at,updated_at) VALUES ('e1','Ext','1.0','unpacked','internal/e1',1,'x','x')").run();
        expect(() => db.prepare("INSERT INTO profile_extensions(profile_id,extension_id) VALUES ('missing','e1')").run()).toThrow();
        expect(() => db.prepare("INSERT INTO group_extensions(group_id,extension_id) VALUES ('missing','e1')").run()).toThrow();
      } finally {
        db.close();
      }
    } finally {
      await removeTempRoot(root);
    }
  });
});
