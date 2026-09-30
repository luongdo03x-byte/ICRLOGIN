import {
  AppError,
  HttpGroupCreateBodySchema,
  HttpGroupUpdateBodySchema,
  HttpIdParamsSchema,
  httpOk
} from '@icrlogin/shared';
import type { LocalApiRouter } from '../local-api-router.js';

interface GroupRouteServices {
  groups: {
    list(): any[];
    create(input: any): any;
    update(id: string, input: any): any;
    delete(id: string): Promise<void> | void;
  };
}

function parse<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try { return schema.parse(value); }
  catch { throw new AppError('INVALID_REQUEST', 'Invalid request'); }
}

export function registerGroupRoutes(router: LocalApiRouter, services: GroupRouteServices): void {
  router.register('GET', '/api/v1/groups', () => httpOk(services.groups.list()));
  router.register('POST', '/api/v1/groups', ({ body }) =>
    httpOk(services.groups.create(parse(HttpGroupCreateBodySchema, body))));
  router.register('PATCH', '/api/v1/groups/:id', ({ params, body }) => {
    const { id } = parse(HttpIdParamsSchema, params);
    return httpOk(services.groups.update(id, parse(HttpGroupUpdateBodySchema, body)));
  });
  router.register('DELETE', '/api/v1/groups/:id', async ({ params }) => {
    const { id } = parse(HttpIdParamsSchema, params);
    await services.groups.delete(id);
    return httpOk(null);
  });
}
