import { describe, expect, it } from 'vitest';
import { LocalApiRouter } from '../src/api/local-api-router.js';
import { registerProfileRoutes } from '../src/api/routes/profile-routes.js';

const id = '123e4567-e89b-42d3-a456-426614174000';

async function call(router: LocalApiRouter, method: string, path: string, body?: unknown) {
  const match = router.match(method, path);
  if (match.kind !== 'route') throw new Error(match.kind);
  return match.route.handler({ params: match.params, body }) as Promise<any>;
}

describe('profile local api routes', () => {
  it('projects runtime state and blocks browser mutation while not stopped', async () => {
    let state = 'starting';
    const profiles: any = {
      rows: [{ id, name: 'A', browserVersion: '143', startupUrls: [] }],
      async list() { return this.rows; },
      async get(value: string) { return this.rows.find((row: any) => row.id === value) ?? null; },
      async create(input: any) { const profile = { id, ...input }; this.rows = [profile]; return profile; },
      async update(_id: string, input: any) { Object.assign(this.rows[0], input); return this.rows[0]; },
      async softDelete() { this.rows = []; }
    };
    const browsers = { getState: () => state, getRuntime: () => state === 'stopped' ? null : { startedAt: '2026-01-01T00:00:00Z' } };
    const router = new LocalApiRouter();
    registerProfileRoutes(router, { profiles, browsers } as any);

    const list = await call(router, 'GET', '/api/v1/profiles');
    expect(list.data[0].runtimeState).toBe('starting');
    await expect(call(router, 'PATCH', `/api/v1/profiles/${id}`, { browserVersion: '144' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    state = 'stopped';
    expect((await call(router, 'PATCH', `/api/v1/profiles/${id}`, { browserVersion: '144' })).data.browserVersion).toBe('144');
    await call(router, 'DELETE', `/api/v1/profiles/${id}`);
    expect(profiles.rows).toEqual([]);
  });
});
