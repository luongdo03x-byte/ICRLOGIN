import { join } from 'node:path';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import { GeoIpUpdater } from '../src/network/geoip-updater.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';

describe('GeoIpUpdater', () => {
  it('keeps a fresh database without downloading', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      await mkdir(paths.geoIpDir, { recursive: true });
      await writeFile(join(paths.geoIpDir, 'GeoLite2-City.mmdb'), 'old');
      let downloads = 0;
      const updater = new GeoIpUpdater(paths, {
        licenseKey: async () => 'key',
        now: () => Date.now(),
        download: async () => { downloads += 1; return Buffer.from('zip'); },
        extract: async () => undefined
      });
      await expect(updater.ensureFresh()).resolves.toMatchObject({ status: 'current' });
      expect(downloads).toBe(0);
    } finally { await removeTempRoot(root); }
  });

  it('replaces the active database after a successful update', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const updater = new GeoIpUpdater(paths, {
        licenseKey: async () => 'key',
        now: () => Date.now(),
        download: async () => Buffer.from('archive'),
        extract: async (_archive, destination) => writeFile(destination, 'new-db')
      });
      await expect(updater.ensureFresh()).resolves.toMatchObject({ status: 'updated' });
      expect(await readFile(join(paths.geoIpDir, 'GeoLite2-City.mmdb'), 'utf8')).toBe('new-db');
      expect((await stat(join(paths.geoIpDir, 'GeoLite2-City.mmdb'))).isFile()).toBe(true);
    } finally { await removeTempRoot(root); }
  });

  it('preserves an existing database when refresh fails', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      await mkdir(paths.geoIpDir, { recursive: true });
      const active = join(paths.geoIpDir, 'GeoLite2-City.mmdb');
      await writeFile(active, 'old-db');
      const updater = new GeoIpUpdater(paths, {
        licenseKey: async () => 'key',
        now: () => Date.now() + 8 * 24 * 60 * 60 * 1000,
        download: async () => { throw new Error('offline'); },
        extract: async () => undefined
      });
      await expect(updater.ensureFresh()).resolves.toMatchObject({ status: 'failed' });
      expect(await readFile(active, 'utf8')).toBe('old-db');
    } finally { await removeTempRoot(root); }
  });
});
