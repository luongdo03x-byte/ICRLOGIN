import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError } from '@icrlogin/shared';
import type { AppPaths } from '../app-paths.js';
import type { ProxyRuntimeConfig } from './proxy-args.js';

export interface ProxyRuntimeExtensionOptions {
  protectWebRtc?: boolean;
}

export interface PreparedProxyRuntimeExtension {
  extensionPath: string | null;
  cleanup(): Promise<void>;
}

interface CredentialBroker {
  endpoint: string;
  close(): Promise<void>;
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function startCredentialBroker(proxy: ProxyRuntimeConfig): Promise<CredentialBroker> {
  const token = randomBytes(32).toString('hex');
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (request.method !== 'GET' || url.pathname !== '/credentials' || url.searchParams.get('token') !== token) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader('content-type', 'application/json');
    response.setHeader('cache-control', 'no-store');
    response.setHeader('access-control-allow-origin', '*');
    response.end(JSON.stringify({ username: proxy.username ?? '', password: proxy.password ?? '' }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    await closeServer(server);
    throw new Error('Credential broker did not expose a TCP port');
  }
  return {
    endpoint: `http://127.0.0.1:${address.port}/credentials?token=${token}`,
    close: () => closeServer(server)
  };
}

function buildWorker(endpoint: string | null, protectWebRtc: boolean): string {
  const lines: string[] = [];
  if (protectWebRtc) {
    lines.push(`chrome.privacy.network.webRTCIPHandlingPolicy.set({ value: 'disable_non_proxied_udp', scope: 'regular' });`);
  }
  if (endpoint) {
    lines.push(`
const credentialEndpoint = ${JSON.stringify(endpoint)};
chrome.webRequest.onAuthRequired.addListener(
  (details, callback) => {
    if (!details.isProxy) { callback({}); return; }
    fetch(credentialEndpoint, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('credential broker unavailable');
        return response.json();
      })
      .then((credentials) => callback({ authCredentials: credentials }))
      .catch(() => callback({}));
  },
  { urls: ['<all_urls>'] },
  ['asyncBlocking']
);`.trim());
  }
  return `${lines.join('\n\n')}\n`;
}

export class ProxyRuntimeExtensionBuilder {
  constructor(private readonly paths: AppPaths) {}

  async prepare(
    profileId: string,
    proxy: ProxyRuntimeConfig | null,
    options: ProxyRuntimeExtensionOptions = {}
  ): Promise<PreparedProxyRuntimeExtension> {
    const protectWebRtc = options.protectWebRtc ?? false;
    const needsAuth = Boolean(proxy?.username || proxy?.password);
    if (!needsAuth && !protectWebRtc) return { extensionPath: null, cleanup: async () => undefined };
    if (!/^[A-Za-z0-9_-]+$/.test(profileId)) throw new AppError('PROXY_AUTH_RUNTIME_FAILED', 'Invalid profile id for runtime extension');

    const extensionPath = join(this.paths.profilesDir, profileId, 'runtime', 'proxy-auth-extension');
    let broker: CredentialBroker | null = null;
    try {
      await rm(extensionPath, { recursive: true, force: true });
      await mkdir(extensionPath, { recursive: true });
      if (needsAuth && proxy) broker = await startCredentialBroker(proxy);

      const permissions: string[] = [];
      const hostPermissions: string[] = [];
      if (needsAuth) {
        permissions.push('webRequest', 'webRequestAuthProvider');
        hostPermissions.push('<all_urls>', 'http://127.0.0.1/*');
      }
      if (protectWebRtc) permissions.push('privacy');
      const manifest = {
        manifest_version: 3,
        name: 'ICRLogin Runtime Network',
        version: '1.0.0',
        permissions,
        host_permissions: hostPermissions,
        background: { service_worker: 'service-worker.js' }
      };
      await writeFile(join(extensionPath, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
      await writeFile(join(extensionPath, 'service-worker.js'), buildWorker(broker?.endpoint ?? null, protectWebRtc), 'utf8');

      let cleaned = false;
      return {
        extensionPath,
        cleanup: async () => {
          if (cleaned) return;
          cleaned = true;
          try { await broker?.close(); } finally { await rm(extensionPath, { recursive: true, force: true }); }
        }
      };
    } catch (error) {
      try { await broker?.close(); } catch { /* best effort */ }
      await rm(extensionPath, { recursive: true, force: true });
      throw new AppError('PROXY_AUTH_RUNTIME_FAILED', 'Unable to prepare proxy runtime extension', {
        cause: error instanceof Error ? error.message : String(error)
      });
    }
  }
}
