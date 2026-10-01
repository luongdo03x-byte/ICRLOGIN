import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('windows shell lifecycle', () => {
  it('acquires single-instance ownership before invoking bootstrap', async () => {
    const source = await readFile(join(import.meta.dirname, '../src/main/index.ts'), 'utf8');
    const ownership = source.lastIndexOf('const ownsInstance = acquireSingleInstance');
    const invocation = source.lastIndexOf('if (ownsInstance) void bootstrap()');
    expect(ownership).toBeGreaterThan(-1);
    expect(invocation).toBeGreaterThan(ownership);
    expect(source.slice(invocation)).not.toContain('openDatabase(');
  });

  it('uses hide for tray close and never stops or kills managed Chromium from app-shell shutdown', async () => {
    const source = await readFile(join(import.meta.dirname, '../src/main/index.ts'), 'utf8');
    expect(source).toContain("if (action === 'tray')");
    expect(source).toContain('window.hide()');
    expect(source).not.toContain('browsers.stop(');
    expect(source).not.toContain('forceTerminate(');
    expect(source).not.toContain('taskkill');
  });
});
