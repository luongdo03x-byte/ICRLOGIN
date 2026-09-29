import { describe, expect, it } from 'vitest';
import { LocalApiRouter } from '../src/api/local-api-router.js';
import { registerBrowserRoutes } from '../src/api/routes/browser-routes.js';

async function call(router: LocalApiRouter, method: string, path: string) {
  const match = router.match(method, path);
  if (match.kind !== 'route') throw new Error(match.kind);
  return match.route.handler({ params: match.params, body: undefined }) as Promise<any>;
}

describe('browser local api routes', () => {
  it('keeps installed browsers visible offline and strips executable paths', async () => {
    const browser = { version: '143', executablePath: '/missing/SECRET/chrome', sha256: 'a'.repeat(64), artifactSize: 10, installedAt: 'now' };
    const services: any = {
      browserVersions: {
        async listAvailable() { throw new Error('offline'); },
        listInstalled() { return [browser]; },
        async getStable() { throw new Error('offline'); },
        getUsageCount() { return 2; },
        async download() { return browser; },
        async remove() {}
      }
    };
    const router = new LocalApiRouter();
    registerBrowserRoutes(router, services);
    const result = await call(router, 'GET', '/api/v1/browsers');
    expect(result.data.manifestAvailable).toBe(false);
    expect(result.data.installed[0].version).toBe('143');
    expect(result.data.installed[0].profilesUsing).toBe(2);
    expect(JSON.stringify(result)).not.toContain('/missing/SECRET');
  });
});
