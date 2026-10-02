import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import { openDatabase } from '../src/db/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { NetworkIdentityCacheRepository } from '../src/repositories/network-identity-cache-repository.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';

describe('NetworkIdentityCacheRepository', () => {
  it('upserts, reads and deletes route identity data', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const db = openDatabase(join(paths.dataDir, 'icrlogin.db'));
      try {
        await runMigrations(db);
        const repository = new NetworkIdentityCacheRepository(db);
        const record = {
          routeKey: 'direct',
          publicIp: '203.0.113.10',
          countryIso: 'VN',
          cityName: 'Hanoi',
          timezone: 'Asia/Bangkok',
          latitude: 21.0285,
          longitude: 105.8542,
          accuracy: 25,
          resolvedAt: '2026-10-02T00:00:00.000Z',
          sourceDbVersion: '2026-09-30'
        };
        repository.upsert(record);
        expect(repository.get('direct')).toEqual(record);
        repository.delete('direct');
        expect(repository.get('direct')).toBeNull();
      } finally {
        db.close();
      }
    } finally {
      await removeTempRoot(root);
    }
  });
});
