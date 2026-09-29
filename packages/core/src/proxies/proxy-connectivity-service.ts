import { createConnection } from 'node:net';
import { AppError, type HttpProxyTestResult } from '@icrlogin/shared';
import type { ProxyService } from './proxy-service.js';

export type ProxySocketConnector = (host: string, port: number, timeoutMs: number) => Promise<void>;

export function connectProxyTcp(host: string, port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('timeout'));
    }, timeoutMs);
    const cleanup = () => clearTimeout(timer);
    socket.once('connect', () => {
      cleanup();
      socket.destroy();
      resolve();
    });
    socket.once('error', (error) => {
      cleanup();
      socket.destroy();
      reject(error);
    });
  });
}

export class ProxyConnectivityService {
  constructor(
    private readonly proxies: Pick<ProxyService, 'getRuntimeConfig'>,
    private readonly connector: ProxySocketConnector = connectProxyTcp,
    private readonly now: () => number = () => Date.now()
  ) {}

  async test(proxyId: string, timeoutMs = 5000): Promise<HttpProxyTestResult> {
    const proxy = await this.proxies.getRuntimeConfig(proxyId);
    const startedAt = this.now();
    try {
      await this.connector(proxy.host, proxy.port, timeoutMs);
    } catch {
      throw new AppError('PROXY_CONNECTION_FAILED', `Unable to reach proxy ${proxy.host}:${proxy.port}`);
    }
    return { reachable: true, latencyMs: Math.max(0, Math.round(this.now() - startedAt)) };
  }
}
