import {
  AppError,
  HttpIdParamsSchema,
  HttpProfileCreateBodySchema,
  HttpProfileUpdateBodySchema,
  httpOk
} from '@icrlogin/shared';
import type { LocalApiRouter } from '../local-api-router.js';

interface ProfileRouteServices {
  profiles: {
    list(): Promise<any[]> | any[];
    get(id: string): Promise<any | null> | any | null;
    create(input: any): Promise<any> | any;
    update(id: string, input: any): Promise<any> | any;
    softDelete(id: string): Promise<void> | void;
  };
  browsers: {
    getState(id: string): string;
    getRuntime(id: string): { startedAt: string } | null;
  };
}

function parse<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try { return schema.parse(value); }
  catch { throw new AppError('INVALID_REQUEST', 'Invalid request'); }
}

function project(profile: any, browsers: ProfileRouteServices['browsers']) {
  const runtime = browsers.getRuntime(profile.id);
  return {
    ...profile,
    runtimeState: browsers.getState(profile.id),
    runtimeStartedAt: runtime?.startedAt ?? null
  };
}

export function registerProfileRoutes(router: LocalApiRouter, services: ProfileRouteServices): void {
  router.register('GET', '/api/v1/profiles', async () =>
    httpOk((await services.profiles.list()).map((profile) => project(profile, services.browsers))));

  router.register('POST', '/api/v1/profiles', async ({ body }) =>
    httpOk(project(await services.profiles.create(parse(HttpProfileCreateBodySchema, body)), services.browsers)));

  router.register('GET', '/api/v1/profiles/:id', async ({ params }) => {
    const { id } = parse(HttpIdParamsSchema, params);
    const profile = await services.profiles.get(id);
    if (!profile) throw new AppError('PROFILE_NOT_FOUND', 'Profile not found');
    return httpOk(project(profile, services.browsers));
  });

  router.register('PATCH', '/api/v1/profiles/:id', async ({ params, body }) => {
    const { id } = parse(HttpIdParamsSchema, params);
    const input = parse(HttpProfileUpdateBodySchema, body);
    if ((input as any).browserVersion !== undefined && services.browsers.getState(id) !== 'stopped') {
      throw new AppError('INVALID_REQUEST', 'Stop the profile before changing browser version');
    }
    return httpOk(project(await services.profiles.update(id, input), services.browsers));
  });

  router.register('DELETE', '/api/v1/profiles/:id', async ({ params }) => {
    const { id } = parse(HttpIdParamsSchema, params);
    if (services.browsers.getState(id) !== 'stopped') {
      throw new AppError('INVALID_REQUEST', 'Stop the profile before deleting it');
    }
    await services.profiles.softDelete(id);
    return httpOk(null);
  });
}
