import { access } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';

describe('app paths', () => {
  it('resolves the exact local data directories under the configured root', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      const normalizedRoot = resolve(root);
      expect(paths.root).toBe(normalizedRoot);
      expect(paths.dataDir).toBe(resolve(root, 'data'));
      expect(paths.profilesDir).toBe(resolve(root, 'profiles'));
      expect(paths.browsersDir).toBe(resolve(root, 'browsers'));
      expect(paths.extensionsDir).toBe(resolve(root, 'extensions'));
      expect(paths.backupsDir).toBe(resolve(root, 'backups'));
      expect(paths.downloadsTempDir).toBe(resolve(root, 'downloads', 'temp'));
      expect(paths.logsDir).toBe(resolve(root, 'logs'));
      expect(paths.trashDir).toBe(resolve(root, 'trash'));
      expect(paths.configDir).toBe(resolve(root, 'config'));

      for (const path of Object.values(paths)) {
        if (path === normalizedRoot) continue;
        expect(path.startsWith(`${normalizedRoot}${sep}`)).toBe(true);
      }
    } finally {
      await removeTempRoot(root);
    }
  });

  it('creates all managed directories', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      for (const path of Object.values(paths)) await access(path);
    } finally {
      await removeTempRoot(root);
    }
  });
});
