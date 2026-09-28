import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import { InMemoryBrowserArtifactProvider } from '../src/browsers/artifact-provider.js';
import { BrowserVersionService } from '../src/browsers/browser-version-service.js';
import { openDatabase } from '../src/db/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { BrowserVersionRepository } from '../src/repositories/browser-version-repository.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';

const manifest = {
  schemaVersion: 1,
  platform: 'win64',
  stable: '143.0.0',
  versions: [{
    version: '143.0.0',
    url: 'https://example.test/chromium.zip',
    sha256: 'a'.repeat(64),
    size: 12,
    executableRelativePath: 'chrome.exe'
  }]
};

describe('BrowserVersionService.download', () => {
  it('does not create installed record after installer failure', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const db = openDatabase(join(paths.dataDir, 'db.sqlite'));
      try {
        runMigrations(db);
        const repository = new BrowserVersionRepository(db);
        const service = new BrowserVersionService(
          new InMemoryBrowserArtifactProvider(manifest),
          repository,
          async () => { throw new Error('failed'); }
        );
        await expect(service.download('143.0.0')).rejects.toThrow();
        expect(repository.get('143.0.0')).toBe(null);
      } finally {
        db.close();
      }
    } finally {
      await removeTempRoot(root);
    }
  });

  it('marks installed only after download installer succeeds', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const db = openDatabase(join(paths.dataDir, 'db.sqlite'));
      try {
        runMigrations(db);
        const repository = new BrowserVersionRepository(db);
        const service = new BrowserVersionService(
          new InMemoryBrowserArtifactProvider(manifest),
          repository,
          async (entry) => ({
            version: entry.version,
            executablePath: 'C:/chrome.exe',
            sha256: entry.sha256,
            artifactSize: entry.size,
            installedAt: '2026-01-01T00:00:00.000Z'
          })
        );
        expect(repository.get('143.0.0')).toBe(null);
        const installed = await service.download('143.0.0');
        expect(installed.version).toBe('143.0.0');
        expect(repository.get('143.0.0')?.version).toBe('143.0.0');
      } finally {
        db.close();
      }
    } finally {
      await removeTempRoot(root);
    }
  });
});
