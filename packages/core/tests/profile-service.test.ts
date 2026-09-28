import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Profile } from '../../shared/src/profile.js';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import { openDatabase } from '../src/db/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { ProfileFiles } from '../src/profiles/profile-files.js';
import { ProfileService } from '../src/profiles/profile-service.js';
import { ProfileRepository } from '../src/repositories/profile-repository.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';

const profileFixture = (id: string): Profile => ({
  id,
  name: 'QA profile',
  description: 'phase 1',
  groupId: null,
  browserVersion: '143.0.0',
  proxyId: null,
  userAgent: null,
  language: 'en-US',
  timezone: 'UTC',
  windowWidth: 1280,
  windowHeight: 800,
  screenWidth: 1920,
  screenHeight: 1080,
  webrtcEnabled: true,
  geolocationMode: 'ask',
  startupUrls: ['https://example.test/'],
  createdAt: '2026-09-28T00:00:00.000Z',
  updatedAt: '2026-09-28T00:00:00.000Z',
  lastUsedAt: null,
  deletedAt: null
});

describe('profile repository and files', () => {
  it('round-trips all phase-1 profile fields and persists startup URLs as an array', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const db = openDatabase(join(paths.dataDir, 'icrlogin.db'));
      try {
        runMigrations(db);
        const repository = new ProfileRepository(db);
        const expected = profileFixture('11111111-1111-4111-8111-111111111111');
        repository.create(expected);
        expect(JSON.stringify(repository.getById(expected.id))).toBe(JSON.stringify(expected));

        const updated = repository.update(expected.id, {
          name: 'Updated QA',
          startupUrls: ['https://example.test/a', 'https://example.test/b']
        });
        expect(updated?.name).toBe('Updated QA');
        expect(JSON.stringify(updated?.startupUrls)).toBe(JSON.stringify(['https://example.test/a', 'https://example.test/b']));

        repository.softDelete(expected.id, '2026-09-28T01:00:00.000Z');
        expect(repository.getById(expected.id)).toBe(null);
        expect(repository.getById(expected.id, { includeDeleted: true })?.deletedAt).toBe('2026-09-28T01:00:00.000Z');
      } finally {
        db.close();
      }
    } finally {
      await removeTempRoot(root);
    }
  });

  it('creates profile storage via staging and supports trash/restore', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const files = new ProfileFiles(paths);
      const id = '22222222-2222-4222-8222-222222222222';
      await files.create(id);

      await access(join(paths.profilesDir, id, 'user-data'));
      await access(join(paths.profilesDir, id, 'runtime'));
      expect(JSON.parse(await readFile(join(paths.profilesDir, id, 'metadata.json'), 'utf8')).profileId).toBe(id);

      await files.moveToTrash(id);
      await access(join(paths.trashDir, id, 'user-data'));
      await files.restoreFromTrash(id);
      await access(join(paths.profilesDir, id, 'user-data'));
    } finally {
      await removeTempRoot(root);
    }
  });

  it('cleans staging and never promotes a profile when staging fails', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const id = '33333333-3333-4333-8333-333333333333';
      const files = new ProfileFiles(paths, {
        afterStagingCreated: async () => {
          throw new Error('simulated staging failure');
        }
      });

      let failed = false;
      try {
        await files.create(id);
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);

      let finalExists = true;
      try {
        await access(join(paths.profilesDir, id));
      } catch {
        finalExists = false;
      }
      expect(finalExists).toBe(false);
    } finally {
      await removeTempRoot(root);
    }
  });
});


describe('profile service', () => {
  it('applies deterministic defaults and creates profile storage', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const db = openDatabase(join(paths.dataDir, 'icrlogin.db'));
      try {
        runMigrations(db);
        const repository = new ProfileRepository(db);
        const service = new ProfileService(repository, new ProfileFiles(paths), {
          idFactory: () => '44444444-4444-4444-8444-444444444444',
          now: () => '2026-09-28T02:00:00.000Z'
        });
        const created = await service.create({ name: 'QA', browserVersion: '143.0.0' });
        expect(created.language).toBe('en-US');
        expect(created.timezone).toBe('UTC');
        expect(created.windowWidth).toBe(1280);
        expect(created.screenWidth).toBe(1920);
        await access(join(paths.profilesDir, created.id, 'user-data'));
      } finally {
        db.close();
      }
    } finally {
      await removeTempRoot(root);
    }
  });

  it('turns invalid profile input into INVALID_REQUEST', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const db = openDatabase(join(paths.dataDir, 'icrlogin.db'));
      try {
        runMigrations(db);
        const service = new ProfileService(new ProfileRepository(db), new ProfileFiles(paths));
        let code: string | undefined;
        try {
          await service.create({ name: '', browserVersion: '143.0.0' });
        } catch (error: any) {
          code = error.code;
        }
        expect(code).toBe('INVALID_REQUEST');
      } finally {
        db.close();
      }
    } finally {
      await removeTempRoot(root);
    }
  });

  it('soft-deletes and restores both metadata and profile files', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const db = openDatabase(join(paths.dataDir, 'icrlogin.db'));
      try {
        runMigrations(db);
        const service = new ProfileService(new ProfileRepository(db), new ProfileFiles(paths), {
          idFactory: () => '55555555-5555-4555-8555-555555555555',
          now: () => '2026-09-28T03:00:00.000Z'
        });
        const created = await service.create({ name: 'QA', browserVersion: '143.0.0' });
        await service.softDelete(created.id);
        expect(await service.get(created.id)).toBe(null);
        const restored = await service.restore(created.id);
        expect(restored.id).toBe(created.id);
        await access(join(paths.profilesDir, created.id, 'user-data'));
      } finally {
        db.close();
      }
    } finally {
      await removeTempRoot(root);
    }
  });

  it('removes the inserted row when filesystem creation fails', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const db = openDatabase(join(paths.dataDir, 'icrlogin.db'));
      try {
        runMigrations(db);
        const repository = new ProfileRepository(db);
        const files = new ProfileFiles(paths, { afterStagingCreated: async () => { throw new Error('disk failure'); } });
        const service = new ProfileService(repository, files, {
          idFactory: () => '66666666-6666-4666-8666-666666666666',
          now: () => '2026-09-28T04:00:00.000Z'
        });
        let failed = false;
        try {
          await service.create({ name: 'QA', browserVersion: '143.0.0' });
        } catch {
          failed = true;
        }
        expect(failed).toBe(true);
        expect(repository.getById('66666666-6666-4666-8666-666666666666', { includeDeleted: true })).toBe(null);
      } finally {
        db.close();
      }
    } finally {
      await removeTempRoot(root);
    }
  });
});
