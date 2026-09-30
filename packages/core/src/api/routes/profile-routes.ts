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
  profileMutations: {
    runWithStoppedProfiles<T>(
      profileIds: readonly string[],
      operation: () => Promise<T> | T,
      message?: string
    ): Promise<T>;
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
    const requiresStopped = (input as any).browserVersion !== undefined || (input as any).groupId !== undefined;
    const profile = requiresStopped
      ? await services.profileMutations.runWithStoppedProfiles(
          [id],
          () => services.profiles.update(id, input),
          'Stop the profile before changing browser version or group'
        )
      : await services.profiles.update(id, input);
    return httpOk(project(profile, services.browsers));
  });

  router.register('DELETE', '/api/v1/profiles/:id', async ({ params }) => {
    const { id } = parse(HttpIdParamsSchema, params);
    await services.profileMutations.runWithStoppedProfiles(
      [id],
      () => services.profiles.softDelete(id),
      'Stop the profile before deleting it'
    );
    return httpOk(null);
  });
}
