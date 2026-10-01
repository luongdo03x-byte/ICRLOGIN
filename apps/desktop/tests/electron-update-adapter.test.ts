import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { createElectronUpdateAdapter } from '../src/main/electron-update-adapter.js';

class FakeUpdater extends EventEmitter {
  autoDownload = true;
  autoInstallOnAppQuit = false;
  allowPrerelease = true;
  disableWebInstaller = false;
  checkCalls = 0;
  downloadCalls = 0;
  async checkForUpdates() { this.checkCalls += 1; }
  async downloadUpdate() { this.downloadCalls += 1; return []; }
}

describe('electron update adapter', () => {
  it('uses embedded app-update.yml in packaged builds and rejects unsafe runtime overrides', () => {
    expect(createElectronUpdateAdapter({ isPackaged: false, feedUrl: undefined })).toBeNull();

    const embedded = new FakeUpdater();
    const embeddedCalls: any[] = [];
    expect(createElectronUpdateAdapter({
      isPackaged: true,
      feedUrl: undefined,
      updaterFactory: (options) => { embeddedCalls.push(options); return embedded as any; }
    })).not.toBeNull();
    expect(embeddedCalls).toEqual([undefined]);

    expect(createElectronUpdateAdapter({ isPackaged: true, feedUrl: 'http://updates.example/app' })).toBeNull();
    expect(createElectronUpdateAdapter({ isPackaged: true, feedUrl: 'https://user:pass@updates.example/app' })).toBeNull();
  });

  it('constructs a generic https NSIS updater override with manual download and safe on-quit install', async () => {
    const fake = new FakeUpdater();
    const calls: any[] = [];
    const adapter = createElectronUpdateAdapter({
      isPackaged: true,
      feedUrl: ' https://updates.example/app/ ',
      updaterFactory: (options) => { calls.push(options); return fake as any; }
    });
    expect(adapter).not.toBeNull();
    expect(calls).toEqual([{ provider: 'generic', url: 'https://updates.example/app/' }]);
    expect(fake.autoDownload).toBe(false);
    expect(fake.autoInstallOnAppQuit).toBe(true);
    expect(fake.allowPrerelease).toBe(false);
    expect(fake.disableWebInstaller).toBe(true);

    const check = adapter!.checkForUpdates();
    fake.emit('update-available', { version: '1.2.0' });
    await expect(check).resolves.toEqual({ availableVersion: '1.2.0' });
    await adapter!.downloadUpdate();
    expect(fake.downloadCalls).toBe(1);
  });

  it('maps not-available, progress and downloaded events without exposing paths', async () => {
    const fake = new FakeUpdater();
    const adapter = createElectronUpdateAdapter({ isPackaged: true, feedUrl: undefined, updaterFactory: () => fake as any })!;
    const progress: any[] = [];
    const downloaded: string[] = [];
    adapter.onProgress((value) => progress.push(value));
    adapter.onDownloaded((version) => downloaded.push(version));

    const check = adapter.checkForUpdates();
    fake.emit('update-not-available', { version: '1.0.0' });
    await expect(check).resolves.toEqual({ availableVersion: null });
    fake.emit('download-progress', { percent: 12.5, transferred: 10, total: 80, bytesPerSecond: 99 });
    fake.emit('update-downloaded', { version: '1.2.0', downloadedFile: 'C:/secret/setup.exe' });
    expect(progress).toEqual([{ percent: 12.5, transferred: 10, total: 80 }]);
    expect(downloaded).toEqual(['1.2.0']);
  });
});
