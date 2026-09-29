import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { LocalApiServer } from '../src/api/local-api-server.js';
import { LocalApiRouter } from '../src/api/local-api-router.js';
import { constantTimeTokenEqual } from '../src/api/bearer-auth.js';
import { readJsonBody } from '../src/api/request-body.js';

async function json(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  return {
    status: response.status,
    body: await response.json() as any,
    contentType: response.headers.get('content-type')
  };
}

describe('LocalApiServer', () => {
  it('binds only localhost and serves public health', async () => {
    const server = new LocalApiServer({ port: 0, services: {} });
    const info = await server.start();
    try {
      expect(info.host).toBe('127.0.0.1');
      expect(new URL(info.baseUrl).hostname).toBe('127.0.0.1');
      const result = await json(`${info.baseUrl}/api/v1/health`);
      expect(result.status).toBe(200);
      expect(result.contentType).toContain('application/json');
      expect(result.body).toEqual({ success: true, data: { status: 'ok' }, error: null });
    } finally {
      await server.stop();
    }
  });

  it('keeps health public and protects other routes when bearer token is configured', async () => {
    const server = new LocalApiServer({ port: 0, bearerToken: 'secret', services: {} });
    const info = await server.start();
    try {
      expect((await json(`${info.baseUrl}/api/v1/health`)).status).toBe(200);
      expect((await json(`${info.baseUrl}/api/v1/unknown`)).status).toBe(401);
      const authorized = await json(`${info.baseUrl}/api/v1/unknown`, { headers: { authorization: 'Bearer secret' } });
      expect(authorized.status).toBe(404);
      expect(authorized.body.error.code).toBe('ROUTE_NOT_FOUND');
      expect(constantTimeTokenEqual('secret', 'secret')).toBe(true);
      expect(constantTimeTokenEqual('secret', 'different')).toBe(false);
    } finally {
      await server.stop();
    }
  });

  it('authenticates protected paths before returning method-not-allowed', async () => {
    const router = new LocalApiRouter();
    router.register('GET', '/api/v1/protected', () => ({ success: true, data: { ok: true }, error: null }));
    const server = new LocalApiServer({ port: 0, bearerToken: 'secret', services: {}, router });
    const info = await server.start();
    try {
      expect((await json(`${info.baseUrl}/api/v1/protected`, { method: 'POST' })).status).toBe(401);
      const authorized = await json(`${info.baseUrl}/api/v1/protected`, {
        method: 'POST',
        headers: { authorization: 'Bearer secret' }
      });
      expect(authorized.status).toBe(405);
      expect(authorized.body.error.code).toBe('METHOD_NOT_ALLOWED');
    } finally {
      await server.stop();
    }
  });

  it('distinguishes method-not-allowed and rate-limits clients', async () => {
    const server = new LocalApiServer({ port: 0, rateLimitPerSecond: 2, services: {} });
    const info = await server.start();
    try {
      const wrongMethod = await json(`${info.baseUrl}/api/v1/health`, { method: 'POST' });
      expect(wrongMethod.status).toBe(405);
      expect(wrongMethod.body.error.code).toBe('METHOD_NOT_ALLOWED');
      await fetch(`${info.baseUrl}/api/v1/health`);
      const limited = await json(`${info.baseUrl}/api/v1/health`);
      expect(limited.status).toBe(429);
      expect(limited.body.error.code).toBe('RATE_LIMITED');
    } finally {
      await server.stop();
    }
  });

  it('rejects malformed and oversized JSON before handler execution', async () => {
    const router = new LocalApiRouter();
    let calls = 0;
    router.register('POST', '/api/v1/echo', ({ body }) => { calls += 1; return { success: true, data: body, error: null }; });
    const server = new LocalApiServer({ port: 0, services: {}, router });
    const info = await server.start();
    try {
      const malformed = await json(`${info.baseUrl}/api/v1/echo`, { method: 'POST', body: '{' });
      expect(malformed.status).toBe(400);
      expect(calls).toBe(0);
      const oversized = await fetch(`${info.baseUrl}/api/v1/echo`, { method: 'POST', body: 'x'.repeat(1024 * 1024 + 1) });
      expect(oversized.status).toBe(400);
      expect(calls).toBe(0);
    } finally {
      await server.stop();
    }
  });

  it('body parser accepts valid JSON directly', async () => {
    async function* chunks() { yield Buffer.from('{"ok":true}'); }
    await expect(readJsonBody(chunks())).resolves.toEqual({ ok: true });
  });

  it('clears failed bind state so stop remains safe', async () => {
    const blocker = createServer((_request, response) => response.end());
    await new Promise<void>((resolve) => blocker.listen({ host: '127.0.0.1', port: 0 }, resolve));
    const address = blocker.address();
    if (!address || typeof address === 'string') throw new Error('Missing blocker port');
    const server = new LocalApiServer({ port: address.port, services: {} });
    try {
      await expect(server.start()).rejects.toMatchObject({ code: 'PORT_UNAVAILABLE' });
      await expect(server.stop()).resolves.toBeUndefined();
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });
});
