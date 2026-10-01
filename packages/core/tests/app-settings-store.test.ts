import { join } from 'node:path';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import { AppSettingsStore } from '../src/settings/app-settings-store.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';

const defaults = { schemaVersion: 1, launchAtLogin: false, closeBehavior: 'ask', localApiPort: 9495 } as const;

describe('AppSettingsStore', () => {
  it('returns versioned defaults when settings do not exist', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root); await ensureAppPaths(paths);
      await expect(new AppSettingsStore(paths).read()).resolves.toEqual(defaults);
    } finally { await removeTempRoot(root); }
  });

  it('validates, persists and serializes concurrent patches without losing fields', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root); await ensureAppPaths(paths);
      const store = new AppSettingsStore(paths);
      await Promise.all([
        store.update({ launchAtLogin: true }),
        store.update({ localApiPort: 9555 })
      ]);
      const value = await store.read();
      expect(value).toEqual({ ...defaults, launchAtLogin: true, localApiPort: 9555 });
      expect(JSON.parse(await readFile(join(paths.configDir, 'settings.json'), 'utf8'))).toEqual(value);
      expect((await readdir(paths.configDir)).filter((name) => name.startsWith('.settings-'))).toEqual([]);
    } finally { await removeTempRoot(root); }
  });

  it('falls back safely for corrupt or unsupported settings without overwriting the source file', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root); await ensureAppPaths(paths);
      const file = join(paths.configDir, 'settings.json');
      await writeFile(file, '{broken', 'utf8');
      const store = new AppSettingsStore(paths);
      await expect(store.read()).resolves.toEqual(defaults);
      expect(await readFile(file, 'utf8')).toBe('{broken');

      await writeFile(file, JSON.stringify({ ...defaults, schemaVersion: 2 }), 'utf8');
      await expect(store.read()).resolves.toEqual(defaults);
      expect(JSON.parse(await readFile(file, 'utf8')).schemaVersion).toBe(2);
    } finally { await removeTempRoot(root); }
  });

  it('rejects invalid patches before replacing a valid settings file', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root); await ensureAppPaths(paths);
      const store = new AppSettingsStore(paths);
      await store.update({ closeBehavior: 'quit' });
      await expect(store.update({ localApiPort: 70000 } as any)).rejects.toThrow();
      await expect(store.read()).resolves.toEqual({ ...defaults, closeBehavior: 'quit' });
    } finally { await removeTempRoot(root); }
  });
});
