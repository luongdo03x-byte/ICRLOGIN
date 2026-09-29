import { mkdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { Profile } from '@icrlogin/shared';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import { BrowserService } from '../src/browsers/browser-service.js';
import { buildChromiumArgs, type ChromiumLaunchInput } from '../src/browsers/chromium-launcher.js';
import { ProfileOperationLock } from '../src/browsers/operation-lock.js';
import { ProcessRegistry } from '../src/browsers/process-registry.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';

const profile: Profile = {
  id: '123e4567-e89b-42d3-a456-426614174000', name: 'QA', description: null, groupId: null,
  browserVersion: '144', proxyId: null, userAgent: '--load-extension=C:/evil', language: 'en-US', timezone: 'UTC',
  windowWidth: 1280, windowHeight: 800, screenWidth: 1920, screenHeight: 1080,
  webrtcEnabled: true, geolocationMode: 'ask', startupUrls: [], createdAt: 'x', updatedAt: 'x', lastUsedAt: null, deletedAt: null
};

describe('assigned extension launch', () => {
  it('emits exactly one deduplicated load-extension argument and none when empty', () => {
    const base = {
      profile,
      executablePath: 'C:/managed/chrome.exe',
      profileUserDataDir: 'C:/managed/profile',
      remoteDebuggingPort: 43127
    };
    const args = buildChromiumArgs({ ...base, extensionPaths: ['C:/managed/e1', 'C:/managed/e2', 'C:/managed/e1'] });
    expect(args.filter((value) => value.startsWith('--load-extension='))).toEqual([
      '--load-extension=C:/managed/e1,C:/managed/e2'
    ]);
    expect(buildChromiumArgs({ ...base, extensionPaths: [] }).some((value) => value.startsWith('--load-extension='))).toBe(false);
    expect(args).not.toContain('--load-extension=C:/evil');
  });

  it('gets extension paths from the Core resolver before spawning Chromium', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      await mkdir(`${paths.profilesDir}/${profile.id}/runtime`, { recursive: true });
      const registry = new ProcessRegistry();
      let captured: ChromiumLaunchInput | undefined;
      const service = new BrowserService({
        profiles: { getById: () => profile },
        browserVersions: { async ensureInstalled() { return { version: '144', executablePath: 'chrome.exe', sha256: 'a'.repeat(64), artifactSize: 1, installedAt: 'x' }; } },
        proxies: { async getRuntimeConfig() { throw new Error('unused'); } },
        extensions: { resolvePaths: (id) => { expect(id).toBe(profile.id); return ['C:/managed/e1']; } },
        portAllocator: { async reserve() { return 43127; }, async release() {} },
        launcher: {
          spawn(input) {
            captured = input;
            return { pid: 42, onExit() {}, async requestClose() {}, async forceTerminate() {} };
          }
        },
        cdpWaiter: async () => 'ws://127.0.0.1:43127/devtools/browser/test',
        registry,
        operationLock: new ProfileOperationLock(),
        runtimeSessions: { upsert() {}, delete() {} } as any,
        paths
      });
      await service.start(profile.id);
      expect(captured?.extensionPaths).toEqual(['C:/managed/e1']);
    } finally {
      await removeTempRoot(root);
    }
  });
});
