import { describe, expect, it } from 'vitest';
import { BrowserVersionService } from '../src/browsers/browser-version-service.js';

const entry = { version: '143', url: 'https://example.test/chrome.zip', sha256: 'a'.repeat(64), size: 10, executableRelativePath: 'chrome.exe' };

describe('BrowserVersionService management', () => {
  it('single-flights concurrent installs of the same version', async () => {
    let installs = 0;
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const repo: any = { row: null, get() { return this.row; }, list() { return this.row ? [this.row] : []; }, markInstalled(value: any) { this.row = value; return value; }, remove() { this.row = null; } };
    const service = new BrowserVersionService(
      { async getManifest() { return { schemaVersion: 1, platform: 'win64', stable: '143', versions: [entry] }; } } as any,
      repo,
      async () => { installs += 1; await wait; return { version: '143', executablePath: 'chrome.exe', sha256: entry.sha256, artifactSize: 10, installedAt: 'now' }; }
    );
    const first = service.download('143');
    const second = service.download('143');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(installs).toBe(1);
    release();
    expect((await first).version).toBe('143');
    expect((await second).version).toBe('143');
  });

  it('rejects in-use removal and preserves DB record if filesystem uninstall fails', async () => {
    const browser = { version: '143', executablePath: 'chrome.exe', sha256: entry.sha256, artifactSize: 10, installedAt: 'now' };
    const repo: any = { row: browser, get() { return this.row; }, list() { return [this.row]; }, markInstalled(value: any) { this.row = value; return value; }, remove() { this.row = null; } };
    let service = new BrowserVersionService({ async getManifest() { throw new Error('offline'); } } as any, repo, undefined, { usageCounter: () => 1, uninstaller: async () => {} });
    await expect(service.remove('143')).rejects.toMatchObject({ code: 'BROWSER_IN_USE' });
    expect(repo.row).toBe(browser);
    service = new BrowserVersionService({ async getManifest() { throw new Error('offline'); } } as any, repo, undefined, { usageCounter: () => 0, uninstaller: async () => { throw new Error('disk failure'); } });
    await expect(service.remove('143')).rejects.toThrow('disk failure');
    expect(repo.row).toBe(browser);
  });
});
