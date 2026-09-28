import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { BrowserRuntimeInfo, Profile } from '@icrlogin/shared';
import { BrowserService } from '../src/browsers/browser-service.js';
import { ProfileOperationLock } from '../src/browsers/operation-lock.js';
import { ProcessRegistry } from '../src/browsers/process-registry.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('condition did not become true');
}

describe('BrowserService lifecycle state', () => {
  it('reports starting/running/stopping/stopped across one lifecycle', async () => {
    const root = await mkdtemp(join(tmpdir(), 'icrlogin-browser-state-'));
    const profileId = 'state-profile';
    const profilesDir = join(root, 'profiles');
    await mkdir(join(profilesDir, profileId, 'runtime'), { recursive: true });
    await mkdir(join(profilesDir, profileId, 'user-data'), { recursive: true });

    const profile: Profile = {
      id: profileId, name: 'State', description: null, groupId: null, browserVersion: '143', proxyId: null,
      userAgent: null, language: 'en-US', timezone: 'UTC', windowWidth: 1280, windowHeight: 800,
      screenWidth: 1920, screenHeight: 1080, webrtcEnabled: true, geolocationMode: 'ask', startupUrls: [],
      createdAt: '2026-09-28T00:00:00.000Z', updatedAt: '2026-09-28T00:00:00.000Z', lastUsedAt: null, deletedAt: null
    };

    const cdpReady = deferred<string>();
    const closeReady = deferred<void>();
    const registry = new ProcessRegistry();
    const runtimeRows = new Map<string, BrowserRuntimeInfo>();
    let exitListener: (() => void) | null = null;
    const handle = {
      pid: 4242,
      onExit(listener: () => void) { exitListener = listener; },
      async requestClose() {},
      async forceTerminate() { exitListener?.(); }
    };

    const service = new BrowserService({
      profiles: { getById: (id: string) => id === profileId ? profile : null },
      browserVersions: { async ensureInstalled() { return { version: '143', executablePath: 'chrome.exe', sha256: 'a'.repeat(64), artifactSize: 1, installedAt: '2026-09-28T00:00:00.000Z' }; } },
      proxies: { async getRuntimeConfig() { throw new Error('proxy not expected'); } },
      portAllocator: { async reserve() { return 43127; }, async release() {} },
      launcher: { spawn() { return handle; } },
      cdpWaiter: async () => cdpReady.promise,
      cdpCloser: async () => { await closeReady.promise; exitListener?.(); },
      registry,
      operationLock: new ProfileOperationLock(),
      runtimeSessions: {
        upsert(runtime: BrowserRuntimeInfo) { runtimeRows.set(runtime.profileId, runtime); },
        delete(id: string) { runtimeRows.delete(id); }
      } as any,
      paths: { profilesDir } as any,
      cdpTimeoutMs: 100,
      stopGraceMs: 20
    });

    try {
      expect(service.getState(profileId)).toBe('stopped');
      const start = service.start(profileId);
      await until(() => service.getState(profileId) === 'starting');
      expect(service.getState(profileId)).toBe('starting');
      cdpReady.resolve('ws://127.0.0.1:43127/devtools/browser/test');
      await start;
      expect(service.getState(profileId)).toBe('running');

      const stop = service.stop(profileId);
      await until(() => service.getState(profileId) === 'stopping');
      expect(service.getState(profileId)).toBe('stopping');
      closeReady.resolve();
      await stop;
      expect(service.getState(profileId)).toBe('stopped');
      expect(runtimeRows.size).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
