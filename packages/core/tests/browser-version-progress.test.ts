import { describe, expect, it } from 'vitest';
import { BrowserVersionService } from '../src/browsers/browser-version-service.js';

const entry = {
  version: '143.0.0', url: 'https://example.test/chrome.zip', sha256: 'a'.repeat(64), size: 100,
  executableRelativePath: 'chrome.exe'
};

describe('BrowserVersionService progress', () => {
  it('shares one install flight and fans progress out to all waiters', async () => {
    let installs = 0;
    let installed: any = null;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const service = new BrowserVersionService(
      { getManifest: async () => ({ schemaVersion: 1, stable: entry.version, versions: [entry] }) as any },
      {
        get: () => installed,
        list: () => installed ? [installed] : [],
        markInstalled: (value: any) => { installed = value; return value; },
        remove: () => undefined
      } as any,
      async (_entry, onProgress) => {
        installs += 1;
        onProgress?.({ phase: 'downloading', receivedBytes: 50, totalBytes: 100, percent: 50 });
        await gate;
        return { version: entry.version, executablePath: 'C:/chrome.exe', sha256: entry.sha256, artifactSize: 100, installedAt: 'now' };
      }
    );
    const first: any[] = [];
    const second: any[] = [];
    const p1 = service.ensureInstalled(entry.version, (p) => first.push(p));
    const p2 = service.ensureInstalled(entry.version, (p) => second.push(p));
    await Promise.resolve();
    release();
    await Promise.all([p1, p2]);
    expect(installs).toBe(1);
    expect(first.at(-1)?.percent).toBe(50);
    expect(second.at(-1)?.percent).toBe(50);
  });
});
