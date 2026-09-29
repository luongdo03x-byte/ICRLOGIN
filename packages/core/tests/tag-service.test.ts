import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { ProfileRepository } from '../src/repositories/profile-repository.js';
import { TagRepository } from '../src/repositories/tag-repository.js';
import { TagService } from '../src/tags/tag-service.js';
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

function insertProfile(db: ReturnType<typeof openDatabase>, id: string): void {
  db.prepare(`
    INSERT INTO profiles(
      id, name, browser_version, language, timezone,
      window_width, window_height, screen_width, screen_height,
      webrtc_enabled, geolocation_mode, startup_urls_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, 'Profile', '144', 'en-US', 'UTC', 1280, 800, 1920, 1080,
    1, 'ask', '[]', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
  );
}

function createService(db: ReturnType<typeof openDatabase>) {
  const ids = ['t1', 't2', 't3'];
  return new TagService(new TagRepository(db), new ProfileRepository(db), {
    idFactory: () => ids.shift()!,
    now: () => '2026-01-01T00:00:00.000Z'
  });
}

describe('TagService', () => {
  it('creates and renames trimmed unique names', async () => withDb((db) => {
    const service = createService(db);
    expect(service.create({ name: '  Social  ' }).name).toBe('Social');
    expect(() => service.create({ name: ' social ' })).toThrow();
    const work = service.create({ name: 'Work' });
    expect(() => service.rename(work.id, { name: 'SOCIAL' })).toThrow();
    expect(service.rename(work.id, { name: ' Office ' }).name).toBe('Office');
  }));

  it('sets, adds, and removes profile tags idempotently', async () => withDb((db) => {
    insertProfile(db, 'p1');
    const service = createService(db);
    const a = service.create({ name: 'A' });
    const b = service.create({ name: 'B' });
    service.setProfileTags('p1', [a.id, a.id, b.id]);
    expect(service.listProfileTagIds('p1')).toEqual([a.id, b.id]);
    service.addProfileTags('p1', [a.id]);
    service.removeProfileTags('p1', [a.id, a.id]);
    expect(service.listProfileTagIds('p1')).toEqual([b.id]);
  }));

  it('rejects unknown profile and tag references', async () => withDb((db) => {
    insertProfile(db, 'p1');
    const service = createService(db);
    const tag = service.create({ name: 'A' });
    expect(() => service.setProfileTags('missing', [tag.id])).toThrowError(expect.objectContaining({ code: 'INVALID_REQUEST' }));
    expect(() => service.setProfileTags('p1', ['missing'])).toThrowError(expect.objectContaining({ code: 'INVALID_REQUEST' }));
  }));

  it('cascades deleted tag assignments and batch-projects profile tags', async () => withDb((db) => {
    insertProfile(db, 'p1');
    insertProfile(db, 'p2');
    const service = createService(db);
    const a = service.create({ name: 'A' });
    const b = service.create({ name: 'B' });
    service.setProfileTags('p1', [a.id, b.id]);
    service.setProfileTags('p2', [b.id]);
    expect(service.listTagIdsByProfileIds(['p1', 'p2'])).toEqual({ p1: [a.id, b.id], p2: [b.id] });
    service.delete(b.id);
    expect(service.listProfileTagIds('p1')).toEqual([a.id]);
    expect(service.listProfileTagIds('p2')).toEqual([]);
  }));
});
