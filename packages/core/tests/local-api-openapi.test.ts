import { describe, expect, it } from 'vitest';
import { createLocalApiRouter } from '../src/api/local-api-router.js';
import { LOCAL_API_OPENAPI } from '../src/api/openapi.js';

function openApiPath(routePath: string): string {
  return routePath.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

describe('local API OpenAPI contract', () => {
  it('documents every registered method on localhost only', () => {
    const router = createLocalApiRouter({} as any);
    const paths = LOCAL_API_OPENAPI.paths as Record<string, Record<string, unknown>>;
    for (const route of router.listRoutes()) {
      expect(paths[openApiPath(route.path)]?.[route.method.toLowerCase()]).toBeDefined();
    }
    expect(LOCAL_API_OPENAPI.openapi).toBe('3.1.0');
    expect(LOCAL_API_OPENAPI.info.version).toBe('1.0.0');
    expect(LOCAL_API_OPENAPI.servers).toEqual([{ url: 'http://127.0.0.1:9495' }]);
    const serialized = JSON.stringify(LOCAL_API_OPENAPI);
    expect(serialized).not.toContain('executablePath');
    expect(serialized).not.toContain('userDataDir');
    expect(serialized).not.toContain('encryptedPassword');
  });
});
