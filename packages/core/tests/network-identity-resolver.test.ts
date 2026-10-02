import { describe, expect, it } from 'vitest';
import { AppError } from '../../shared/src/errors.js';
import { NetworkIdentityResolver } from '../src/network/network-identity-resolver.js';

describe('NetworkIdentityResolver', () => {
  it('resolves fresh identity and stores it in cache', async () => {
    let cached: any = null;
    const resolver = new NetworkIdentityResolver(
      { resolve: async () => ({ publicIp: '203.0.113.25' }) },
      { lookup: async () => ({ countryIso: 'VN', cityName: 'Hanoi', timezone: 'Asia/Bangkok', latitude: 21, longitude: 105, accuracy: 20000, sourceDbVersion: 'v1' }) },
      { get: () => null, upsert: (record: any) => { cached = record; return record; } }
    );

    const value = await resolver.resolve('direct', null);
    expect(value.stale).toBe(false);
    expect(value.publicIp).toBe('203.0.113.25');
    expect(cached.routeKey).toBe('direct');
  });

  it('uses cache when egress lookup fails but route failure is not definitive', async () => {
    const cached = {
      routeKey: 'proxy:p1', publicIp: '203.0.113.10', countryIso: 'VN', cityName: 'Hanoi',
      timezone: 'Asia/Bangkok', latitude: 21, longitude: 105, accuracy: 20000,
      resolvedAt: '2026-10-01T00:00:00.000Z', sourceDbVersion: 'v1'
    };
    const resolver = new NetworkIdentityResolver(
      { resolve: async () => { throw new AppError('EGRESS_IP_RESOLUTION_FAILED', 'echo failed'); } },
      { lookup: async () => { throw new Error('should not run'); } },
      { get: () => cached, upsert: (record: any) => record }
    );

    await expect(resolver.resolve('proxy:p1', null)).resolves.toEqual({ ...cached, stale: true });
  });

  it('does not hide a proxy connection failure behind cache', async () => {
    const resolver = new NetworkIdentityResolver(
      { resolve: async () => { throw new AppError('PROXY_CONNECTION_FAILED', 'proxy offline'); } },
      { lookup: async () => { throw new Error('should not run'); } },
      { get: () => ({ routeKey: 'proxy:p1' } as any), upsert: (record: any) => record }
    );
    await expect(resolver.resolve('proxy:p1', null)).rejects.toMatchObject({ code: 'PROXY_CONNECTION_FAILED' });
  });
});
