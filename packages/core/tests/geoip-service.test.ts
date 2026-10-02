import { describe, expect, it } from 'vitest';
import { GeoIpService } from '../src/network/geoip-service.js';

describe('GeoIpService', () => {
  it('maps a city record into runtime geo fields', async () => {
    const service = new GeoIpService('/tmp/test.mmdb', async () => ({
      get: () => ({
        country: { iso_code: 'VN' },
        city: { names: { en: 'Hanoi' } },
        location: { time_zone: 'Asia/Bangkok', latitude: 21.0285, longitude: 105.8542, accuracy_radius: 20 }
      })
    }), async () => '2026-10-01T00:00:00.000Z');

    await expect(service.lookup('203.0.113.25')).resolves.toEqual({
      countryIso: 'VN',
      cityName: 'Hanoi',
      timezone: 'Asia/Bangkok',
      latitude: 21.0285,
      longitude: 105.8542,
      accuracy: 20000,
      sourceDbVersion: '2026-10-01T00:00:00.000Z'
    });
  });

  it('reports a missing database with GEOIP_DATABASE_MISSING', async () => {
    const service = new GeoIpService('/missing.mmdb', async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); });
    await expect(service.lookup('203.0.113.25')).rejects.toMatchObject({ code: 'GEOIP_DATABASE_MISSING' });
  });
});
