import { createServer, type Server } from 'node:http';
import { AppError, httpFail } from '@icrlogin/shared';
import { authorizeBearer } from './bearer-auth.js';
import { sendJson } from './http-response.js';
import { createLocalApiRouter, type LocalApiRouter } from './local-api-router.js';
import { FixedWindowRateLimiter } from './rate-limiter.js';
import { readJsonBody } from './request-body.js';

export interface LocalApiServerOptions {
  port?: number;
  bearerToken?: string;
  services: any;
  rateLimitPerSecond?: number;
  router?: LocalApiRouter;
}

export interface LocalApiServerInfo {
  host: '127.0.0.1';
  port: number;
  baseUrl: string;
}

function errorStatus(code: string): number {
  if (code === 'ROUTE_NOT_FOUND') return 404;
  if (code === 'METHOD_NOT_ALLOWED') return 405;
  if (code === 'RATE_LIMITED') return 429;
  if (code === 'PROFILE_NOT_FOUND') return 404;
  if (code === 'PROFILE_ALREADY_RUNNING' || code === 'PROFILE_START_IN_PROGRESS' || code === 'BROWSER_IN_USE') return 409;
  if (code === 'INVALID_REQUEST' || code === 'PROXY_INVALID') return 400;
  return 500;
}

export class LocalApiServer {
  private readonly host = '127.0.0.1' as const;
  private readonly port: number;
  private readonly router: LocalApiRouter;
  private readonly limiter: FixedWindowRateLimiter;
  private server: Server | null = null;

  constructor(private readonly options: LocalApiServerOptions) {
    this.port = options.port ?? 9495;
    this.router = options.router ?? createLocalApiRouter(options.services);
    this.limiter = new FixedWindowRateLimiter(options.rateLimitPerSecond ?? 100);
  }

  async start(): Promise<LocalApiServerInfo> {
    if (this.server) throw new Error('Local API server is already started');

    const server = createServer(async (request, response) => {
      try {
        const remote = request.socket.remoteAddress ?? 'unknown';
        if (!this.limiter.allow(remote)) {
          sendJson(response, 429, httpFail('RATE_LIMITED', 'Rate limit exceeded'));
          return;
        }

        const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
        const match = this.router.match(request.method ?? 'GET', path);

        if (match.kind === 'not-found') {
          if (!authorizeBearer(request.headers.authorization, this.options.bearerToken)) {
            sendJson(response, 401, httpFail('INVALID_REQUEST', 'Unauthorized'));
            return;
          }
          sendJson(response, 404, httpFail('ROUTE_NOT_FOUND', 'Route not found'));
          return;
        }

        if (match.kind === 'method-not-allowed') {
          sendJson(response, 405, httpFail('METHOD_NOT_ALLOWED', 'Method not allowed'));
          return;
        }

        if (!match.route.public && !authorizeBearer(request.headers.authorization, this.options.bearerToken)) {
          sendJson(response, 401, httpFail('INVALID_REQUEST', 'Unauthorized'));
          return;
        }

        const body = ['POST', 'PATCH', 'PUT'].includes(request.method ?? '')
          ? await readJsonBody(request)
          : undefined;
        const result = await match.route.handler({ params: match.params, body });
        sendJson(response, 200, result);
      } catch (error) {
        const appError = error instanceof AppError
          ? error
          : new AppError('INTERNAL_ERROR', 'Internal error');
        sendJson(response, errorStatus(appError.code), httpFail(appError.code, appError.message));
      }
    });

    this.server = server;
    await new Promise<void>((resolve, reject) => {
      const onError = (error: NodeJS.ErrnoException) => {
        server.off('listening', onListening);
        reject(error.code === 'EADDRINUSE'
          ? new AppError('PORT_UNAVAILABLE', `Port ${this.port} is unavailable`)
          : error);
      };
      const onListening = () => {
        server.off('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen({ host: this.host, port: this.port });
    });

    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : this.port;
    return { host: this.host, port, baseUrl: `http://${this.host}:${port}` };
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (!server) return;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}
