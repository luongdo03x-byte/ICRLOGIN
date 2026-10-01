import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const mainPath = join(import.meta.dirname, '../src/main/index.ts');

describe('app update lifecycle', () => {
  it('registers update IPC independently from SQLite health', async () => {
    const source = await readFile(mainPath, 'utf8');
    const updater = source.indexOf('registerPhase8IpcHandlers(ipcMain, updates)');
    const database = source.indexOf("openDatabase(join(paths.dataDir, 'icrlogin.db'))");
    expect(updater).toBeGreaterThan(-1);
    expect(database).toBeGreaterThan(-1);
    expect(updater).toBeLessThan(database);
  });

  it('never exposes a forced installer restart or stops managed browsers for app updates', async () => {
    const source = await readFile(mainPath, 'utf8');
    expect(source).not.toContain('quitAndInstall');
    expect(source).not.toContain('browsers.stop(');
    expect(source).not.toContain('registry.kill');
  });
});
