import { describe, expect, it } from 'vitest';
import { ProxyConnectivityService } from '../src/proxies/proxy-connectivity-service.js';

describe('ProxyConnectivityService', () => {
  it('returns latency for reachable proxy without exposing credentials', async () => {
    let now = 100;
    const proxies = { async getRuntimeConfig() { return { host: '127.0.0.1', port: 8080, username: 'user', password: 'SECRET' }; } };
    const service = new ProxyConnectivityService(proxies as any, async () => { now = 125; }, () => now);
    expect(await service.test('p1')).toEqual({ reachable: true, latencyMs: 25 });
  });

  it('maps connection failures to redacted PROXY_CONNECTION_FAILED', async () => {
    const proxies = { async getRuntimeConfig() { return { host: 'proxy.test', port: 8080, username: 'user', password: 'SECRET' }; } };
    const service = new ProxyConnectivityService(proxies as any, async () => { throw new Error('SECRET user'); });
    try {
      await service.test('p1');
      throw new Error('expected failure');
    } catch (error: any) {
      expect(error.code).toBe('PROXY_CONNECTION_FAILED');
      expect(error.message).not.toContain('SECRET');
      expect(JSON.stringify(error)).not.toContain('SECRET');
    }
  });
});
