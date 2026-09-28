import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppError, type BrowserManifestEntry } from '@icrlogin/shared';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import { HttpBrowserArtifactProvider } from '../src/browsers/artifact-provider.js';
import { BrowserDownloadInstaller } from '../src/browsers/browser-download-installer.js';
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
const entry = manifest.versions[0] as BrowserManifestEntry;

describe('desktop browser artifacts', () => {
  it('caches a remote manifest and falls back to it offline', async () => {
    const root = await createTempRoot();
    try {
      const cache = join(root, 'manifest.json');
      const online = new HttpBrowserArtifactProvider(
        'https://example.test/manifest.json',
        cache,
        async () => new Response(JSON.stringify(manifest), { status: 200 })
      );
      expect((await online.getManifest()).stable).toBe('143.0.0');
      expect(JSON.parse(await readFile(cache, 'utf8')).stable).toBe('143.0.0');

      const offline = new HttpBrowserArtifactProvider(
        'https://example.test/manifest.json',
        cache,
        async () => { throw new Error('offline'); }
      );
      expect((await offline.getManifest()).stable).toBe('143.0.0');
    } finally {
      await removeTempRoot(root);
    }
  });

  it('streams a download and reports progress', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const bytes = new TextEncoder().encode('hello-browser');
      const received: number[] = [];
      const installer = new BrowserDownloadInstaller(
        paths,
        async () => new Response(bytes, {
          status: 200,
          headers: { 'content-length': String(bytes.length) }
        }),
        async (artifact, artifactPath) => {
          expect(new Uint8Array(await readFile(artifactPath))).toEqual(bytes);
          return {
            version: artifact.version,
            executablePath: join(paths.browsersDir, artifact.version, 'chrome.exe'),
            sha256: artifact.sha256,
            artifactSize: bytes.length,
            installedAt: '2026-01-01T00:00:00.000Z'
          };
        }
      );

      const installed = await installer.install(
        { ...entry, size: bytes.length },
        (progress) => received.push(progress.receivedBytes)
      );
      expect(installed.version).toBe('143.0.0');
      expect(received.at(-1)).toBe(bytes.length);
    } finally {
      await removeTempRoot(root);
    }
  });

  it('cleans temp artifacts when verified install fails', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const bytes = new TextEncoder().encode('bad');
      const installer = new BrowserDownloadInstaller(
        paths,
        async () => new Response(bytes, { status: 200 }),
        async () => { throw new AppError('BROWSER_CHECKSUM_MISMATCH', 'bad checksum'); }
      );

      await expect(installer.install({ ...entry, size: bytes.length })).rejects.toMatchObject({
        code: 'BROWSER_CHECKSUM_MISMATCH'
      });
      expect(await readdir(paths.downloadsTempDir)).toHaveLength(0);
    } finally {
      await removeTempRoot(root);
    }
  });
});
