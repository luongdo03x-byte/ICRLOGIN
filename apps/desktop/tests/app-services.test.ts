import { describe, expect, it } from 'vitest';
import { createAppServices } from '../src/main/app-services.js';
import { resolveBrowserManifestSettings } from '../src/main/config.js';

describe('createAppServices', () => {
  it('builds one service graph and shares the runtime registry with BrowserService', () => {
    const paths = {
      root: 'R',
      dataDir: 'R/data',
      profilesDir: 'R/profiles',
      browsersDir: 'R/browsers',
      extensionsDir: 'R/extensions',
      backupsDir: 'R/backups',
      downloadsTempDir: 'R/downloads/temp',
      logsDir: 'R/logs',
      trashDir: 'R/trash',
      configDir: 'R/config'
    };
    const services = createAppServices({
      db: {} as any,
      paths,
      secretStore: { encrypt: (value: string) => value, decrypt: (value: string) => value },
      browserArtifactProvider: {
        getManifest: async () => ({ schemaVersion: 1, platform: 'win64', stable: '143', versions: [] })
      }
    });

    for (const key of ['profiles', 'groups', 'proxies', 'proxyConnectivity', 'tags', 'extensions', 'browserVersions', 'browsers', 'profileClones', 'templates', 'bulk', 'registry', 'runtimeSessions'] as const) {
      expect(services[key]).toBeDefined();
    }

    const runtime = {
      profileId: 'p1',
      pid: 1,
      browserVersion: '143',
      executablePath: 'chrome.exe',
      userDataDir: 'R/profiles/p1/user-data',
      remoteDebuggingPort: 9222,
      cdpHttpUrl: 'http://127.0.0.1:9222',
      webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/browser/x',
      state: 'running',
      startedAt: '2026-01-01T00:00:00.000Z'
    } as any;
    services.registry.register(runtime);
    expect(services.browsers.getRuntime('p1')).toBe(runtime);
  });

  it('keeps browser manifest configuration in main and caches under configDir', () => {
    const paths = { configDir: 'R/config' } as any;
    expect(resolveBrowserManifestSettings(paths, ' https://updates.example/manifest.json ')).toEqual({
      manifestUrl: 'https://updates.example/manifest.json',
      cachePath: joinPortable('R/config', 'browser-manifest-win64.json')
    });
    expect(resolveBrowserManifestSettings(paths, '   ').manifestUrl).toBe(null);
  });
});

function joinPortable(left: string, right: string): string {
  return `${left}/${right}`.replace(/\\/g, '/');
}
