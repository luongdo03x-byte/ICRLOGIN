import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import { installBrowserArtifact } from '../src/browsers/zip-installer.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';
import { writeStoredZip } from './helpers/zip-fixture.js';

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function entryFor(path: string, version = '143.0.0') {
  const bytes = await readFile(path);
  return {
    version,
    url: 'https://example.test/chromium.zip',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length,
    executableRelativePath: 'chrome.exe'
  };
}

describe('verified zip browser installer', () => {
  it('verifies and atomically installs a valid browser archive', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const zipPath = join(root, 'browser.zip');
      await writeStoredZip(zipPath, [{ name: 'chrome.exe', content: 'fake chromium' }]);
      const entry = await entryFor(zipPath);
      const installed = await installBrowserArtifact(entry, zipPath, paths);

      expect(installed.version).toBe('143.0.0');
      expect(await exists(join(paths.browsersDir, '143.0.0', 'chrome.exe'))).toBe(true);
      expect(await exists(join(paths.browsersDir, '.staging-143.0.0'))).toBe(false);
    } finally {
      await removeTempRoot(root);
    }
  });

  it('rejects a checksum mismatch without creating the final version directory', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const zipPath = join(root, 'browser.zip');
      await writeStoredZip(zipPath, [{ name: 'chrome.exe', content: 'fake chromium' }]);
      const entry = { ...(await entryFor(zipPath)), sha256: '0'.repeat(64) };
      let code: string | undefined;
      try { await installBrowserArtifact(entry, zipPath, paths); } catch (error: any) { code = error.code; }
      expect(code).toBe('BROWSER_CHECKSUM_MISMATCH');
      expect(await exists(join(paths.browsersDir, '143.0.0'))).toBe(false);
    } finally {
      await removeTempRoot(root);
    }
  });

  it('rejects zip-slip and absolute archive entries without writing outside browser root', async () => {
    for (const malicious of ['../escape.exe', '/absolute.exe']) {
      const root = await createTempRoot();
      try {
        const paths = createAppPaths(root);
        await ensureAppPaths(paths);
        const zipPath = join(root, 'browser.zip');
        await writeStoredZip(zipPath, [
          { name: malicious, content: 'escape' },
          { name: 'chrome.exe', content: 'fake chromium' }
        ]);
        const entry = await entryFor(zipPath);
        let code: string | undefined;
        try { await installBrowserArtifact(entry, zipPath, paths); } catch (error: any) { code = error.code; }
        expect(code).toBe('BROWSER_ARCHIVE_INVALID');
        expect(await exists(join(paths.browsersDir, '143.0.0'))).toBe(false);
        expect(await exists(join(root, 'escape.exe'))).toBe(false);
        expect(await exists('/absolute.exe')).toBe(false);
      } finally {
        await removeTempRoot(root);
      }
    }
  });

  it('rejects version and executable paths that escape managed browser storage', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const zipPath = join(root, 'browser.zip');
      await writeStoredZip(zipPath, [{ name: 'chrome.exe', content: 'fake chromium' }]);
      const base = await entryFor(zipPath);
      for (const invalid of [
        { ...base, version: '../outside' },
        { ...base, executableRelativePath: '../outside.exe' },
        { ...base, executableRelativePath: '/outside.exe' }
      ]) {
        let code: string | undefined;
        try { await installBrowserArtifact(invalid, zipPath, paths); } catch (error: any) { code = error.code; }
        expect(code).toBe('BROWSER_ARCHIVE_INVALID');
      }
      expect(await exists(join(root, 'outside'))).toBe(false);
      expect(await exists(join(root, 'outside.exe'))).toBe(false);
    } finally {
      await removeTempRoot(root);
    }
  });

});
