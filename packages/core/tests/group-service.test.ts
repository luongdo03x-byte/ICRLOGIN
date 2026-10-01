import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppError } from '@icrlogin/shared';
import { openDatabase } from '../src/db/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { GroupRepository } from '../src/repositories/group-repository.js';
import { GroupService } from '../src/groups/group-service.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';

async function withDb(run: (db: ReturnType<typeof openDatabase>) => Promise<void> | void) {
  const root = await createTempRoot();
  const db = openDatabase(join(root, 'test.db'));
  try {
    runMigrations(db);
    await run(db);
  } finally {
    db.close();
    await removeTempRoot(root);
  }
}

function insertProfile(db: ReturnType<typeof openDatabase>, id: string, groupId: string | null): void {
  db.prepare(`
    INSERT INTO profiles(
      id, name, group_id, browser_version, language, timezone,
      window_width, window_height, screen_width, screen_height,
      webrtc_enabled, geolocation_mode, startup_urls_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    'Profile',
    groupId,
    '123',
    'en-US',
    'UTC',
    1280,
    800,
    1920,
    1080,
    1,
    'ask',
    '[]',
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T00:00:00.000Z'
  );
}

describe('GroupService', () => {
  it('creates, lists, and renames trimmed group names', async () => withDb((db) => {
    const service = new GroupService(new GroupRepository(db), {
      idFactory: () => 'g1',
      now: () => '2026-01-01T00:00:00.000Z'
    });

    expect(service.create({ name: '  Work  ' }).name).toBe('Work');
    expect(service.list()).toHaveLength(1);
    expect(service.update('g1', { name: ' Social ' }).name).toBe('Social');
  }));

  it('rejects blank and duplicate names', async () => withDb((db) => {
    const ids = ['g1', 'g2'];
    const service = new GroupService(new GroupRepository(db), {
      idFactory: () => ids.shift()!,
      now: () => '2026-01-01T00:00:00.000Z'
    });

    expect(() => service.create({ name: '   ' })).toThrow();
    service.create({ name: 'Work' });
    expect(() => service.create({ name: ' work ' })).toThrow();
  }));

  it('rejects profile assignment to an unknown group', async () => withDb((db) => {
    expect(() => insertProfile(db, 'p1', 'missing')).toThrow();
    insertProfile(db, 'p2', null);
    expect(() => db.prepare('UPDATE profiles SET group_id = ? WHERE id = ?').run('missing', 'p2')).toThrow();
  }));

  it('moves profiles to Ungrouped before deleting the group', async () => withDb(async (db) => {
    const service = new GroupService(new GroupRepository(db), {
      idFactory: () => 'g1',
      now: () => '2026-01-01T00:00:00.000Z'
    });

    service.create({ name: 'Work' });
    insertProfile(db, 'p1', 'g1');
    await service.delete('g1');

    const row = db.prepare('SELECT group_id FROM profiles WHERE id = ?').get('p1') as { group_id: string | null };
    expect(row.group_id).toBe(null);
    expect(service.list()).toHaveLength(0);
  }));

  it('does not delete or ungroup when a member profile cannot be locked as stopped', async () => withDb(async (db) => {
    const seenIds: string[][] = [];
    const service = new GroupService(new GroupRepository(db), {
      idFactory: () => 'g1',
      now: () => '2026-01-01T00:00:00.000Z',
      profileMutations: {
        async runWithStoppedProfiles(ids: readonly string[]) {
          seenIds.push([...ids]);
          throw new AppError('INVALID_REQUEST', 'Stop affected profiles before deleting group');
        }
      } as any
    });

    service.create({ name: 'Work' });
    insertProfile(db, 'p1', 'g1');
    await expect(service.delete('g1')).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(seenIds).toEqual([['p1']]);
    expect((db.prepare('SELECT group_id FROM profiles WHERE id = ?').get('p1') as { group_id: string | null }).group_id).toBe('g1');
    expect(service.list()).toHaveLength(1);
  }));
});
