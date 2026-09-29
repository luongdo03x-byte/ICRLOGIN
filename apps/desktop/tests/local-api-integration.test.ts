import { describe, expect, it } from 'vitest';
import { LocalApiServer } from '@icrlogin/core';

const profileId = '123e4567-e89b-42d3-a456-426614174000';

describe('desktop local API integration', () => {
  it('serves the exact service graph supplied by Electron main', async () => {
    let listCalls = 0;
    const services: any = {
      profiles: {
        async list() {
          listCalls += 1;
          return [{ id: profileId, name: 'A', browserVersion: '143', startupUrls: [] }];
        }
      },
      browsers: { getState: () => 'stopped', getRuntime: () => null },
      groups: {}, proxies: {}, proxyConnectivity: {}, browserVersions: {}, registry: { list: () => [] }
    };
    const server = new LocalApiServer({ port: 0, bearerToken: 'token', services });
    const info = await server.start();
    try {
      const health = await fetch(`${info.baseUrl}/api/v1/health`);
      expect(health.status).toBe(200);
      const unauthorized = await fetch(`${info.baseUrl}/api/v1/profiles`);
      expect(unauthorized.status).toBe(401);
      expect(listCalls).toBe(0);
      const response = await fetch(`${info.baseUrl}/api/v1/profiles`, {
        headers: { authorization: 'Bearer token' }
      });
      expect(response.status).toBe(200);
      const payload = await response.json() as any;
      expect(payload.data[0].id).toBe(profileId);
      expect(payload.data[0].runtimeState).toBe('stopped');
      expect(listCalls).toBe(1);
    } finally {
      await server.stop();
    }
  });
});
