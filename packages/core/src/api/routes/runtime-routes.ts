import { AppError, HttpIdParamsSchema, httpOk } from '@icrlogin/shared';
import type { BrowserRuntimeInfo } from '@icrlogin/shared';
import type { LocalApiRouter } from '../local-api-router.js';

interface RuntimeRouteServices {
  browsers: {
    start(id: string): Promise<BrowserRuntimeInfo>;
    stop(id: string): Promise<void>;
    restart(id: string): Promise<BrowserRuntimeInfo>;
  };
  registry: {
    list(): BrowserRuntimeInfo[];
  };
}

function parseId(params: unknown): string {
  try { return HttpIdParamsSchema.parse(params).id; }
  catch { throw new AppError('INVALID_REQUEST', 'Invalid profile id'); }
}

export function toHttpProcess(runtime: BrowserRuntimeInfo) {
  return {
    profileId: runtime.profileId,
    state: runtime.state,
    pid: runtime.pid,
    browserVersion: runtime.browserVersion,
    remoteDebuggingPort: runtime.remoteDebuggingPort,
    cdpHttpUrl: runtime.cdpHttpUrl,
    webSocketDebuggerUrl: runtime.webSocketDebuggerUrl,
    startedAt: runtime.startedAt
  };
}

function toStartResult(runtime: BrowserRuntimeInfo) {
  return {
    profileId: runtime.profileId,
    status: 'running' as const,
    pid: runtime.pid,
    browserVersion: runtime.browserVersion,
    remoteDebuggingPort: runtime.remoteDebuggingPort,
    cdpHttpUrl: runtime.cdpHttpUrl,
    webSocketDebuggerUrl: runtime.webSocketDebuggerUrl
  };
}

export function registerRuntimeRoutes(router: LocalApiRouter, services: RuntimeRouteServices): void {
  router.register('POST', '/api/v1/profiles/:id/start', async ({ params }) =>
    httpOk(toStartResult(await services.browsers.start(parseId(params)))));

  router.register('POST', '/api/v1/profiles/:id/stop', async ({ params }) => {
    await services.browsers.stop(parseId(params));
    return httpOk(null);
  });

  router.register('POST', '/api/v1/profiles/:id/restart', async ({ params }) =>
    httpOk(toStartResult(await services.browsers.restart(parseId(params)))));

  router.register('GET', '/api/v1/processes', () =>
    httpOk(services.registry.list().map(toHttpProcess)));
}
