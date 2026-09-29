import {
  AppError,
  HttpIdParamsSchema,
  HttpProxyCreateBodySchema,
  HttpProxyUpdateBodySchema,
  httpOk
} from '@icrlogin/shared';
import type { LocalApiRouter } from '../local-api-router.js';

interface ProxyRouteServices {
  proxies: {
    list(): Promise<any[]>;
    get(id: string): Promise<any | null>;
    create(input: any): Promise<any>;
    update(id: string, input: any): Promise<any>;
    delete(id: string): Promise<void>;
  };
  proxyConnectivity: {
    test(id: string, timeoutMs?: number): Promise<any>;
  };
}

function parse<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try { return schema.parse(value); }
  catch { throw new AppError('INVALID_REQUEST', 'Invalid request'); }
}

export function registerProxyRoutes(router: LocalApiRouter, services: ProxyRouteServices): void {
  router.register('GET', '/api/v1/proxies', async () => httpOk(await services.proxies.list()));
  router.register('POST', '/api/v1/proxies', async ({ body }) =>
    httpOk(await services.proxies.create(parse(HttpProxyCreateBodySchema, body))));
  router.register('PATCH', '/api/v1/proxies/:id', async ({ params, body }) => {
    const { id } = parse(HttpIdParamsSchema, params);
    return httpOk(await services.proxies.update(id, parse(HttpProxyUpdateBodySchema, body)));
  });
  router.register('DELETE', '/api/v1/proxies/:id', async ({ params }) => {
    const { id } = parse(HttpIdParamsSchema, params);
    if (!await services.proxies.get(id)) throw new AppError('PROXY_INVALID', 'Proxy not found');
    await services.proxies.delete(id);
    return httpOk(null);
  });
  router.register('POST', '/api/v1/proxies/:id/test', async ({ params }) => {
    const { id } = parse(HttpIdParamsSchema, params);
    return httpOk(await services.proxyConnectivity.test(id));
  });
}
