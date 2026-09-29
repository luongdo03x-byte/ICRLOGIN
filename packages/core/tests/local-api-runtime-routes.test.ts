import { describe, expect, it } from 'vitest';
import { LocalApiRouter } from '../src/api/local-api-router.js';
import { registerRuntimeRoutes } from '../src/api/routes/runtime-routes.js';

const id = '123e4567-e89b-42d3-a456-426614174000';
const runtime: any = {
  profileId: id,
  pid: 4242,
  browserVersion: '143',
  executablePath: 'C:/SECRET/chrome.exe',
  userDataDir: 'C:/SECRET/profile',
  remoteDebuggingPort: 43127,
  cdpHttpUrl: 'http://127.0.0.1:43127',
  webSocketDebuggerUrl: 'ws://127.0.0.1:43127/devtools/browser/test',
  state: 'running',
  startedAt: '2026-09-29T00:00:00Z'
};

async function call(router: LocalApiRouter, method: string, path: string) {
  const match = router.match(method, path);
  if (match.kind !== 'route') throw new Error(match.kind);
  return match.route.handler({ params: match.params, body: undefined }) as Promise<any>;
}

describe('runtime local api routes', () => {
  it('returns attach data without local filesystem paths', async () => {
    let stops = 0;
    const services = {
      browsers: { start: async () => runtime, stop: async () => { stops += 1; }, restart: async () => runtime },
      registry: { list: () => [runtime] }
    };
    const router = new LocalApiRouter();
    registerRuntimeRoutes(router, services as any);

    const started = await call(router, 'POST', `/api/v1/profiles/${id}/start`);
    expect(started.data.status).toBe('running');
    expect(started.data.executablePath).toBeUndefined();
    expect(started.data.userDataDir).toBeUndefined();
    const processes = await call(router, 'GET', '/api/v1/processes');
    expect(processes.data[0].pid).toBe(4242);
    expect(JSON.stringify(processes)).not.toContain('C:/SECRET');
    await call(router, 'POST', `/api/v1/profiles/${id}/stop`);
    expect(stops).toBe(1);
    expect((await call(router, 'POST', `/api/v1/profiles/${id}/restart`)).data.status).toBe('running');
  });
});
