import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { BrowserRuntimeInfo, Profile } from '@icrlogin/shared';
import { BrowserService } from '../src/browsers/browser-service.js';
import { ProfileOperationLock } from '../src/browsers/operation-lock.js';
import { ProcessRegistry } from '../src/browsers/process-registry.js';

function profile(id: string): Profile {
  return {
    id, name: 'Restart', description: null, groupId: null, browserVersion: '143', proxyId: null,
    userAgent: null, language: 'en-US', timezone: 'UTC', windowWidth: 1280, windowHeight: 800,
    screenWidth: 1920, screenHeight: 1080, webrtcEnabled: true, geolocationMode: 'ask', startupUrls: [],
    createdAt: '2026-09-29T00:00:00Z', updatedAt: '2026-09-29T00:00:00Z', lastUsedAt: null, deletedAt: null
  };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'icrlogin-restart-'));
  const id = '123e4567-e89b-42d3-a456-426614174000';
  const profilesDir = join(root, 'profiles');
  await mkdir(join(profilesDir, id, 'runtime'), { recursive: true });
  await mkdir(join(profilesDir, id, 'user-data'), { recursive: true });
  const registry = new ProcessRegistry();
  const rows = new Map<string, BrowserRuntimeInfo>();
  const handles: any[] = [];
  let pid = 5000;
  const launcher = {
    spawn() {
      let listener: (() => void) | null = null;
      const handle = {
        pid: ++pid,
        onExit(fn: () => void) { listener = fn; },
        emitExit() { listener?.(); },
        async requestClose() { listener?.(); },
        async forceTerminate() { listener?.(); }
      };
      handles.push(handle);
      return handle;
    }
  };
  const service = new BrowserService({
    profiles: { getById: () => profile(id), markLastUsed() {} },
    browserVersions: { async ensureInstalled() { return { version: '143', executablePath: 'chrome.exe', sha256: 'a'.repeat(64), artifactSize: 1, installedAt: 'now' }; } },
    proxies: { async getRuntimeConfig() { throw new Error('not expected'); } },
    portAllocator: { async reserve() { return 43127 + handles.length; }, async release() {} },
    launcher: launcher as any,
    cdpWaiter: async (url: string) => `ws://${new URL(url).host}/devtools/browser/test`,
    cdpCloser: async () => { handles.at(-1)?.emitExit(); },
    registry,
    operationLock: new ProfileOperationLock(),
    runtimeSessions: { upsert(r: BrowserRuntimeInfo) { rows.set(r.profileId, r); }, delete(key: string) { rows.delete(key); } } as any,
    paths: { profilesDir } as any,
    stopGraceMs: 5
  });
  return { root, id, service, handles, registry };
}

describe('BrowserService restart', () => {
  it('starts a stopped profile and restarts a running profile without duplicate live runtime', async () => {
    const f = await fixture();
    try {
      const first = await f.service.restart(f.id);
      expect(first.pid).toBe(5001);
      expect(f.handles).toHaveLength(1);
      const second = await f.service.restart(f.id);
      expect(second.pid).toBe(5002);
      expect(f.handles).toHaveLength(2);
      expect(f.registry.get(f.id)?.pid).toBe(5002);
      expect(f.service.getState(f.id)).toBe('running');
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
});
