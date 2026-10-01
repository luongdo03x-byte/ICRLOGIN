import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import { openDatabase } from '../src/db/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { migration001 } from '../src/db/migrations/001.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';

const now = '2026-09-27T00:00:00.000Z';

describe('migration fixture from schema v1', () => {
  it('preserves profile/proxy/runtime data and invokes safety backup only when migrations are pending', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const db = openDatabase(join(paths.dataDir, 'icrlogin.db'));
      try {
        db.exec(`CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);`);
        migration001.up(db);
        db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(1, now);

        const proxyId = '11111111-1111-4111-8111-111111111111';
        const profileId = '22222222-2222-4222-8222-222222222222';
        db.prepare(`INSERT INTO proxies(id,name,type,host,port,username,encrypted_password,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`).run(
          proxyId, 'Legacy Proxy', 'http', '127.0.0.1', 8080, null, null, now, now
        );
        db.prepare(`INSERT INTO profiles(id,name,description,group_id,browser_version,proxy_id,user_agent,language,timezone,window_width,window_height,screen_width,screen_height,webrtc_enabled,geolocation_mode,startup_urls_json,created_at,updated_at,last_used_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          profileId, 'Legacy Profile', null, 'legacy-group-without-table', '143.0.0', proxyId, null, 'en-US', 'UTC', 1280, 800, 1920, 1080, 1, 'ask', '[]', now, now, null, null
        );
        db.prepare(`INSERT INTO runtime_sessions(profile_id,pid,browser_version,executable_path,user_data_dir,debugging_port,state,websocket_debugger_url,started_at) VALUES (?,?,?,?,?,?,?,?,?)`).run(
          profileId, 6262, '143.0.0', 'C:/ICRLogin/chrome.exe', 'C:/ICRLogin/profiles/p/user-data', 43127, 'running', 'ws://127.0.0.1:43127/devtools/browser/x', now
        );

        let backupCalls = 0;
        await runMigrations(db, { beforeMigration: () => { backupCalls += 1; } });
        expect(backupCalls).toBe(1);

        const versions = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{ version: number }>;
        expect(versions.map((row) => row.version)).toEqual([1, 2, 3, 4]);
        const migrated = db.prepare('SELECT name, group_id, proxy_id, browser_version FROM profiles WHERE id = ?').get(profileId) as any;
        expect(migrated).toEqual({ name: 'Legacy Profile', group_id: null, proxy_id: proxyId, browser_version: '143.0.0' });
        expect((db.prepare('SELECT pid, debugging_port FROM runtime_sessions WHERE profile_id = ?').get(profileId) as any)).toEqual({ pid: 6262, debugging_port: 43127 });
        expect((db.prepare('SELECT COUNT(*) AS count FROM proxies WHERE id = ?').get(proxyId) as any).count).toBe(1);

        const requiredTables = ['groups', 'tags', 'extensions', 'profile_tags', 'profile_extensions', 'group_extensions', 'profile_templates', 'backup_history'];
        const tableRows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
        const tables = new Set(tableRows.map((row) => row.name));
        for (const table of requiredTables) expect(tables.has(table)).toBe(true);

        await runMigrations(db, { beforeMigration: () => { backupCalls += 1; } });
        expect(backupCalls).toBe(1);
      } finally {
        db.close();
      }
    } finally {
      await removeTempRoot(root);
    }
  });
});
