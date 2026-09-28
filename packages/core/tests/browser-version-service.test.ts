import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import {
  InMemoryBrowserArtifactProvider,
  type InstalledBrowser
} from '../src/browsers/artifact-provider.js';
import { BrowserVersionService } from '../src/browsers/browser-version-service.js';
import { installBrowserArtifact } from '../src/browsers/zip-installer.js';
import { openDatabase } from '../src/db/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { BrowserVersionRepository } from '../src/repositories/browser-version-repository.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';
import { writeStoredZip } from './helpers/zip-fixture.js';

const manifest = {
  schemaVersion: 1,
  platform: 'win64',
  stable: '143.0.0',
  versions: [
    {
      version: '143.0.0',
      url: 'https://example.test/chromium-143.zip',
      sha256: 'a'.repeat(64),
      size: 123,
      executableRelativePath: 'chrome.exe'
    },
    {
      version: '142.0.0',
      url: 'https://example.test/chromium-142.zip',
      sha256: 'b'.repeat(64),
      size: 100,
      executableRelativePath: 'chrome.exe'
    }
  ]
};

async function withVersionService(
  run: (service: BrowserVersionService, repository: BrowserVersionRepository) => Promise<void>,
  provider: InMemoryBrowserArtifactProvider = new InMemoryBrowserArtifactProvider(manifest),
  installer?: (entry: any) => Promise<InstalledBrowser>
) {
  const root = await createTempRoot();
  try {
    const paths = createAppPaths(root);
    await ensureAppPaths(paths);
    const db = openDatabase(join(paths.dataDir, 'icrlogin.db'));
    try {
      runMigrations(db);
      const repository = new BrowserVersionRepository(db);
      const service = new BrowserVersionService(provider, repository, installer);
      await run(service, repository);
    } finally {
      db.close();
    }
  } finally {
    await removeTempRoot(root);
  }
}

describe('browser version service', () => {
  it('rejects invalid schema and non-win64 manifests', async () => {
    for (const invalid of [
      { ...manifest, schemaVersion: 2 },
      { ...manifest, platform: 'linux64' }
    ]) {
      let failed = false;
      try {
        await new InMemoryBrowserArtifactProvider(invalid).getManifest();
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);
    }
  });

  it('resolves stable to the exact manifest entry', async () => {
    await withVersionService(async (service) => {
      const stable = await service.getStable();
      expect(stable.version).toBe('143.0.0');
      expect(stable.executableRelativePath).toBe('chrome.exe');
    });
  });

  it('returns an installed pinned version without invoking install', async () => {
    let installCalls = 0;
    await withVersionService(async (service, repository) => {
      repository.markInstalled({
        version: '142.0.0',
        executablePath: 'C:/ICRLogin/browsers/142.0.0/chrome.exe',
        sha256: 'b'.repeat(64),
        artifactSize: 100,
        installedAt: '2026-09-28T06:00:00.000Z'
      });
      const installed = await service.ensureInstalled('142.0.0');
      expect(installed.version).toBe('142.0.0');
      expect(installCalls).toBe(0);
    }, new InMemoryBrowserArtifactProvider(manifest), async () => {
      installCalls += 1;
      throw new Error('should not install');
    });
  });

  it('does not silently substitute stable for an unknown pinned version', async () => {
    await withVersionService(async (service) => {
      let code: string | undefined;
      try {
        await service.ensureInstalled('999.0.0');
      } catch (error: any) {
        code = error.code;
      }
      expect(code).toBe('BROWSER_NOT_INSTALLED');
    });
  });

  it('marks a version installed only after verified installation succeeds', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const zipPath = join(root, 'browser.zip');
      await writeStoredZip(zipPath, [{ name: 'chrome.exe', content: 'managed chromium' }]);
      const bytes = await readFile(zipPath);
      const manifestWithArtifact = {
        schemaVersion: 1,
        platform: 'win64',
        stable: '143.0.0',
        versions: [{
          version: '143.0.0',
          url: 'https://example.test/chromium.zip',
          sha256: createHash('sha256').update(bytes).digest('hex'),
          size: bytes.length,
          executableRelativePath: 'chrome.exe'
        }]
      };
      const db = openDatabase(join(paths.dataDir, 'icrlogin.db'));
      try {
        runMigrations(db);
        const repository = new BrowserVersionRepository(db);
        const service = new BrowserVersionService(
          new InMemoryBrowserArtifactProvider(manifestWithArtifact),
          repository,
          (entry) => installBrowserArtifact(entry, zipPath, paths)
        );
        expect(repository.get('143.0.0')).toBe(null);
        const installed = await service.ensureInstalled('143.0.0');
        expect(installed.version).toBe('143.0.0');
        expect(repository.get('143.0.0')?.executablePath).toBe(installed.executablePath);
      } finally {
        db.close();
      }
    } finally {
      await removeTempRoot(root);
    }
  });

});
