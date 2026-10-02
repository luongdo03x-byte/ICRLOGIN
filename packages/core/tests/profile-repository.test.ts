import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Profile } from '../../shared/src/profile.js';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import { openDatabase } from '../src/db/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { ProfileRepository } from '../src/repositories/profile-repository.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';

const fixture = (): Profile => ({
  id: '99999999-9999-4999-8999-999999999999',
  name: 'Runtime profile',
  description: null,
  groupId: null,
  browserVersion: '143.0.0',
  proxyId: null,
  userAgent: null,
  language: 'vi-VN',
  timezone: 'Asia/Bangkok',
  environmentMode: 'manual',
  latitude: 21.0285,
  longitude: 105.8542,
  accuracy: 25,
  windowWidth: 1280,
  windowHeight: 800,
  screenWidth: 1920,
  screenHeight: 1080,
  webrtcEnabled: false,
  geolocationMode: 'allow',
  startupUrls: [],
  createdAt: '2026-10-02T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
  lastUsedAt: null,
  deletedAt: null
});

describe('ProfileRepository runtime environment fields', () => {
  it('round-trips and updates environment configuration', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const db = openDatabase(join(paths.dataDir, 'icrlogin.db'));
      try {
        await runMigrations(db);
        const repository = new ProfileRepository(db);
        const expected = fixture();
        repository.create(expected);
        expect(repository.getById(expected.id)).toEqual(expected);

        const updated = repository.update(expected.id, {
          environmentMode: 'auto',
          latitude: null,
          longitude: null,
          accuracy: null
        });
        expect(updated?.environmentMode).toBe('auto');
        expect(updated?.latitude).toBeNull();
        expect(updated?.longitude).toBeNull();
        expect(updated?.accuracy).toBeNull();
      } finally {
        db.close();
      }
    } finally {
      await removeTempRoot(root);
    }
  });
});
