import { describe, expect, it } from 'vitest';
import { LocalApiRouter } from '../src/api/local-api-router.js';
import { registerProxyRoutes } from '../src/api/routes/proxy-routes.js';

const id = '323e4567-e89b-42d3-a456-426614174000';

async function call(router: LocalApiRouter, method: string, path: string, body?: unknown) {
  const match = router.match(method, path);
  if (match.kind !== 'route') throw new Error(match.kind);
  return match.route.handler({ params: match.params, body }) as Promise<any>;
}

describe('proxy local api routes', () => {
  it('keeps saved secrets out of CRUD and test payloads', async () => {
    const publicProxy = { id, name: 'P', type: 'http', host: '127.0.0.1', port: 8080, username: 'u', hasPassword: true, createdAt: 'x', updatedAt: 'x' };
    const services: any = {
      proxies: {
        async list() { return [publicProxy]; }, async get() { return publicProxy; },
        async create() { return publicProxy; }, async update() { return publicProxy; }, async delete() {}
      },
      proxyConnectivity: { async test() { return { reachable: true, latencyMs: 5 }; } }
    };
    const router = new LocalApiRouter();
    registerProxyRoutes(router, services);
    const list = await call(router, 'GET', '/api/v1/proxies');
    expect(JSON.stringify(list)).not.toContain('password');
    expect(JSON.stringify(list)).not.toContain('SECRET');
    expect((await call(router, 'POST', `/api/v1/proxies/${id}/test`)).data).toEqual({ reachable: true, latencyMs: 5 });
  });
});
