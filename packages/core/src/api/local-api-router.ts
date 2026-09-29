import { AppError, httpOk } from '@icrlogin/shared';
import { LOCAL_API_OPENAPI } from './openapi.js';
import { registerBrowserRoutes } from './routes/browser-routes.js';
import { registerGroupRoutes } from './routes/group-routes.js';
import { registerProfileRoutes } from './routes/profile-routes.js';
import { registerProxyRoutes } from './routes/proxy-routes.js';
import { registerRuntimeRoutes } from './routes/runtime-routes.js';

export interface ApiRouteContext {
  params: Record<string, string>;
  body: unknown;
}

export type ApiRouteHandler = (context: ApiRouteContext) => Promise<unknown> | unknown;

export interface ApiRoute {
  method: string;
  path: string;
  parts: string[];
  handler: ApiRouteHandler;
  public: boolean;
}

export type RouteMatch =
  | { kind: 'route'; route: ApiRoute; params: Record<string, string> }
  | { kind: 'method-not-allowed'; public: boolean }
  | { kind: 'not-found' };

function decodeRouteParam(value: string): string {
  try { return decodeURIComponent(value); }
  catch { throw new AppError('INVALID_REQUEST', 'Invalid route parameter'); }
}

export class LocalApiRouter {
  private readonly routes: ApiRoute[] = [];

  register(method: string, path: string, handler: ApiRouteHandler, options: { public?: boolean } = {}): void {
    this.routes.push({ method: method.toUpperCase(), path, parts: path.split('/').filter(Boolean), handler, public: options.public === true });
  }

  listRoutes(): ReadonlyArray<Pick<ApiRoute, 'method' | 'path' | 'public'>> {
    return this.routes.map(({ method, path, public: isPublic }) => ({ method, path, public: isPublic }));
  }

  match(method: string, path: string): RouteMatch {
    const parts = path.split('/').filter(Boolean);
    const pathMatches = this.routes.filter((route) =>
      route.parts.length === parts.length && route.parts.every((part, index) => part.startsWith(':') || part === parts[index]));
    if (pathMatches.length === 0) return { kind: 'not-found' };
    const route = pathMatches.find((candidate) => candidate.method === method.toUpperCase());
    if (!route) return { kind: 'method-not-allowed', public: pathMatches.every((candidate) => candidate.public) };
    const params: Record<string, string> = {};
    route.parts.forEach((part, index) => { if (part.startsWith(':')) params[part.slice(1)] = decodeRouteParam(parts[index] ?? ''); });
    return { kind: 'route', route, params };
  }
}

export function createBaseLocalApiRouter(): LocalApiRouter {
  const router = new LocalApiRouter();
  router.register('GET', '/api/v1/health', () => httpOk({ status: 'ok' as const }), { public: true });
  router.register('GET', '/api/v1/openapi.json', () => LOCAL_API_OPENAPI, { public: true });
  return router;
}

export function createLocalApiRouter(services: any): LocalApiRouter {
  const router = createBaseLocalApiRouter();
  registerProfileRoutes(router, services);
  registerGroupRoutes(router, services);
  registerRuntimeRoutes(router, services);
  registerProxyRoutes(router, services);
  registerBrowserRoutes(router, services);
  return router;
}
