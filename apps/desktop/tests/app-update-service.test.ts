import { describe, expect, it } from 'vitest';
import { AppUpdateService, type AppUpdateAdapter } from '../src/main/app-update-service.js';

function adapterFixture(options: { available?: string | null; checkError?: boolean; downloadError?: boolean } = {}) {
  let progress: ((value: { percent: number; transferred: number; total: number }) => void) | null = null;
  let downloaded: ((version: string) => void) | null = null;
  let error: ((message: string) => void) | null = null;
  const adapter: AppUpdateAdapter = {
    checkForUpdates: async () => {
      if (options.checkError) throw new Error('check failed');
      return { availableVersion: options.available ?? null };
    },
    downloadUpdate: async () => {
      if (options.downloadError) throw new Error('download failed');
      progress?.({ percent: 50, transferred: 50, total: 100 });
      downloaded?.(options.available ?? '2.0.0');
    },
    onProgress(listener) { progress = listener; return () => { progress = null; }; },
    onDownloaded(listener) { downloaded = listener; return () => { downloaded = null; }; },
    onError(listener) { error = listener; return () => { error = null; }; },
    dispose() { progress = null; downloaded = null; error = null; }
  };
  return { adapter, emitError: (message: string) => error?.(message) };
}

describe('AppUpdateService', () => {
  it('reports disabled state without an updater adapter', async () => {
    const service = new AppUpdateService(null, '1.0.0');
    expect(service.snapshot()).toMatchObject({ state: 'disabled', currentVersion: '1.0.0', availableVersion: null });
    await expect(service.check()).resolves.toMatchObject({ state: 'disabled' });
    await expect(service.download()).resolves.toMatchObject({ state: 'disabled' });
  });

  it('moves through available and downloaded states with sanitized progress only', async () => {
    const fixture = adapterFixture({ available: '1.1.0' });
    const service = new AppUpdateService(fixture.adapter, '1.0.0');
    await expect(service.check()).resolves.toMatchObject({ state: 'available', availableVersion: '1.1.0' });
    const downloaded = await service.download();
    expect(downloaded).toMatchObject({
      state: 'downloaded', availableVersion: '1.1.0', progressPercent: 100,
      transferredBytes: 100, totalBytes: 100, installOnNextQuit: true
    });
  });

  it('reports up-to-date when check has no newer version', async () => {
    const fixture = adapterFixture({ available: null });
    const service = new AppUpdateService(fixture.adapter, '1.0.0');
    await expect(service.check()).resolves.toMatchObject({ state: 'up-to-date', availableVersion: null });
  });

  it('turns check/download failures and adapter errors into public error state', async () => {
    const checkFixture = adapterFixture({ checkError: true });
    const check = new AppUpdateService(checkFixture.adapter, '1.0.0');
    await expect(check.check()).resolves.toMatchObject({ state: 'error', messageCode: 'UPDATE_CHECK_FAILED' });

    const downloadFixture = adapterFixture({ available: '1.1.0', downloadError: true });
    const download = new AppUpdateService(downloadFixture.adapter, '1.0.0');
    await download.check();
    await expect(download.download()).resolves.toMatchObject({ state: 'error', messageCode: 'UPDATE_DOWNLOAD_FAILED' });

    downloadFixture.emitError('secret path C:/private/update.exe');
    expect(download.snapshot()).toMatchObject({ state: 'error', messageCode: 'UPDATE_INTERNAL_ERROR' });
    expect(JSON.stringify(download.snapshot())).not.toContain('C:/private');
  });
});
