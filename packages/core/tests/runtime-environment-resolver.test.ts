import { describe, expect, it } from 'vitest';
import type { Profile } from '../../shared/src/profile.js';
import { RuntimeEnvironmentResolver } from '../src/browsers/runtime-environment-resolver.js';

const profile = (mode: 'auto' | 'manual'): Profile => ({
  id: 'p1', name: 'P1', description: null, groupId: null, browserVersion: '143.0.0', proxyId: null,
  userAgent: 'UA', language: 'vi-VN', timezone: 'Europe/London', environmentMode: mode,
  latitude: 10, longitude: 20, accuracy: 5,
  windowWidth: 1280, windowHeight: 800, screenWidth: 1920, screenHeight: 1080,
  webrtcEnabled: false, geolocationMode: 'allow', startupUrls: [],
  createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z', lastUsedAt: null, deletedAt: null
});

const network = {
  routeKey: 'direct', publicIp: '203.0.113.10', countryIso: 'VN', cityName: 'Hanoi',
  timezone: 'Asia/Bangkok', latitude: 21, longitude: 105, accuracy: 20000,
  resolvedAt: '2026-10-02T00:00:00.000Z', sourceDbVersion: 'v1', stale: true
};

describe('RuntimeEnvironmentResolver', () => {
  it('uses network geo in auto mode and carries stale diagnostics', () => {
    const value = new RuntimeEnvironmentResolver().resolve(profile('auto'), network);
    expect(value.timezone).toBe('Asia/Bangkok');
    expect(value.latitude).toBe(21);
    expect(value.longitude).toBe(105);
    expect(value.networkIdentityStale).toBe(true);
    expect(value.protectWebRtc).toBe(true);
  });

  it('keeps manual timezone and coordinates', () => {
    const value = new RuntimeEnvironmentResolver().resolve(profile('manual'), network);
    expect(value.timezone).toBe('Europe/London');
    expect(value.latitude).toBe(10);
    expect(value.longitude).toBe(20);
    expect(value.accuracy).toBe(5);
  });
});
