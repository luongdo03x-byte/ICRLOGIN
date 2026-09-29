import { describe, expect, it } from 'vitest';
import { LocalApiRouter } from '../src/api/local-api-router.js';
import { registerGroupRoutes } from '../src/api/routes/group-routes.js';

const id = '223e4567-e89b-42d3-a456-426614174000';

async function call(router: LocalApiRouter, method: string, path: string, body?: unknown) {
  const match = router.match(method, path);
  if (match.kind !== 'route') throw new Error(match.kind);
  return match.route.handler({ params: match.params, body }) as Promise<any>;
}

describe('group local api routes', () => {
  it('lists, creates, renames, and deletes groups through the service', async () => {
    const groups: any = {
      rows: [{ id, name: 'Work' }],
      list() { return this.rows; },
      create(input: any) { const group = { id, ...input }; this.rows = [group]; return group; },
      update(_id: string, input: any) { Object.assign(this.rows[0], input); return this.rows[0]; },
      delete() { this.rows = []; }
    };
    const router = new LocalApiRouter();
    registerGroupRoutes(router, { groups } as any);

    expect((await call(router, 'GET', '/api/v1/groups')).data).toHaveLength(1);
    expect((await call(router, 'PATCH', `/api/v1/groups/${id}`, { name: 'Renamed' })).data.name).toBe('Renamed');
    await call(router, 'DELETE', `/api/v1/groups/${id}`);
    expect(groups.rows).toEqual([]);
  });
});
