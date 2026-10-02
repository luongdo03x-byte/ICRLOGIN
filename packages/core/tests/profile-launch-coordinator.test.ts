import { describe, expect, it } from 'vitest';
import type { Profile } from '../../shared/src/profile.js';
import { ProfileLaunchCoordinator } from '../src/browsers/profile-launch-coordinator.js';

const profile: Profile = {
  id: 'p1', name: 'P1', description: null, groupId: null, browserVersion: '143.0.0', proxyId: 'px1',
  userAgent: null, language: 'vi-VN', timezone: 'UTC', environmentMode: 'auto', latitude: null, longitude: null, accuracy: null,
  windowWidth: 1280, windowHeight: 800, screenWidth: 1920, screenHeight: 1080,
  webrtcEnabled: false, geolocationMode: 'ask', startupUrls: ['https://example.test/'],
  createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z', lastUsedAt: null, deletedAt: null
};

describe('ProfileLaunchCoordinator', () => {
  it('prepares proxy, network identity, managed browser and runtime extension in order', async () => {
    const stages: string[] = [];
    const proxy = { id: 'px1', type: 'http' as const, host: '127.0.0.1', port: 8080, username: 'u', password: 'p' };
    const coordinator = new ProfileLaunchCoordinator({
      proxies: { getRuntimeConfig: async () => proxy },
      proxyConnectivity: { test: async () => ({ reachable: true, latencyMs: 5 }) },
      networkIdentity: { resolve: async () => ({ routeKey: 'proxy:px1', publicIp: '203.0.113.1', countryIso: 'VN', cityName: 'Hanoi', timezone: 'Asia/Bangkok', latitude: 21, longitude: 105, accuracy: 20000, resolvedAt: 'now', sourceDbVersion: 'v1', stale: false }) },
      browserVersions: { isInstalled: () => false, ensureInstalled: async (_version, progress) => { progress?.({ receivedBytes: 50, totalBytes: 100, percent: 50 }); return { version: '143.0.0', executablePath: 'C:/chrome.exe', sha256: 'x', artifactSize: 100, installedAt: 'now' }; } },
      environmentResolver: { resolve: () => ({ publicIp: '203.0.113.1', networkIdentityStale: false, timezone: 'Asia/Bangkok', latitude: 21, longitude: 105, accuracy: 20000, language: 'vi-VN', userAgent: null, windowWidth: 1280, windowHeight: 800, screenWidth: 1920, screenHeight: 1080, geolocationMode: 'ask', protectWebRtc: true }) },
      proxyRuntimeExtension: { prepare: async () => ({ extensionPath: 'C:/runtime-ext', cleanup: async () => undefined }) },
      publish: (event) => stages.push(event.stage)
    });

    const prepared = await coordinator.prepare(profile);
    expect(prepared.proxy).toEqual(proxy);
    expect(prepared.runtimeExtensionPath).toBe('C:/runtime-ext');
    expect(prepared.environment.timezone).toBe('Asia/Bangkok');
    expect(stages).toEqual(['resolving-network', 'resolving-geo', 'downloading-browser', 'preparing-runtime']);
  });
});
