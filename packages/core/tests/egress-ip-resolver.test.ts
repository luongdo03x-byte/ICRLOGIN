import { describe, expect, it } from 'vitest';
import { EgressIpResolver } from '../src/network/egress-ip-resolver.js';

const proxy = {
  id: 'proxy-1', type: 'http' as const, host: '127.0.0.1', port: 8080,
  username: null, password: null
};

describe('EgressIpResolver', () => {
  it('falls back to the next endpoint and returns a validated public ip', async () => {
    const calls: string[] = [];
    const resolver = new EgressIpResolver(async (url, route) => {
      calls.push(url);
      expect(route).toEqual(proxy);
      if (calls.length === 1) throw new Error('primary unavailable');
      return '203.0.113.25';
    }, ['http://one.test/ip', 'http://two.test/ip']);

    await expect(resolver.resolve(proxy)).resolves.toEqual({ publicIp: '203.0.113.25' });
    expect(calls).toEqual(['http://one.test/ip', 'http://two.test/ip']);
  });

  it('maps complete endpoint failure to EGRESS_IP_RESOLUTION_FAILED', async () => {
    const resolver = new EgressIpResolver(async () => { throw new Error('offline'); }, ['http://one.test/ip']);
    await expect(resolver.resolve(null)).rejects.toMatchObject({ code: 'EGRESS_IP_RESOLUTION_FAILED' });
  });
});
