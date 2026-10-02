import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createConnection, isIP, type Socket } from 'node:net';
import { AppError } from '@icrlogin/shared';
import type { ProxyRuntimeConfig } from '../proxies/proxy-args.js';

export type IpEchoRequest = (url: string, proxy: ProxyRuntimeConfig | null) => Promise<string>;

const DEFAULT_ENDPOINTS = [
  'http://api.ipify.org?format=json',
  'http://ifconfig.me/ip'
] as const;

function parseIp(body: string): string | null {
  const text = body.trim();
  try {
    const parsed = JSON.parse(text) as { ip?: unknown; query?: unknown };
    const candidate = typeof parsed.ip === 'string' ? parsed.ip : typeof parsed.query === 'string' ? parsed.query : null;
    if (candidate && isIP(candidate.trim()) !== 0) return candidate.trim();
  } catch {
    // Plain-text endpoint.
  }
  const candidate = text.split(/\s+/)[0] ?? '';
  return isIP(candidate) !== 0 ? candidate : null;
}

function proxyAuthorization(proxy: ProxyRuntimeConfig): string | undefined {
  if (!proxy.username) return undefined;
  return `Basic ${Buffer.from(`${proxy.username}:${proxy.password ?? ''}`, 'utf8').toString('base64')}`;
}

function collectHttpResponse(
  requester: typeof httpRequest | typeof httpsRequest,
  url: URL,
  proxy: ProxyRuntimeConfig | null
): Promise<string> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { accept: 'application/json,text/plain' };
    let options: Parameters<typeof httpRequest>[0];
    if (proxy) {
      const auth = proxyAuthorization(proxy);
      if (auth) headers['proxy-authorization'] = auth;
      headers.host = url.host;
      options = {
        host: proxy.host,
        port: proxy.port,
        method: 'GET',
        path: url.toString(),
        headers
      };
    } else {
      options = {
        hostname: url.hostname,
        port: url.port ? Number(url.port) : 80,
        method: 'GET',
        path: `${url.pathname}${url.search}`,
        headers
      };
    }
    const req = requester(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.once('end', () => {
        if ((res.statusCode ?? 500) < 200 || (res.statusCode ?? 500) >= 300) {
          reject(new Error(`IP echo returned HTTP ${res.statusCode ?? 0}`));
          return;
        }
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
    });
    req.setTimeout(7000, () => req.destroy(new Error('IP echo timeout')));
    req.once('error', reject);
    req.end();
  });
}

function readExactly(socket: Socket, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < length) return;
      cleanup();
      const head = buffer.subarray(0, length);
      const rest = buffer.subarray(length);
      if (rest.length > 0) socket.unshift(rest);
      resolve(head);
    };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const onClose = () => { cleanup(); reject(new Error('SOCKS5 connection closed')); };
    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
    };
    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('close', onClose);
  });
}

async function connectSocks5(proxy: ProxyRuntimeConfig, host: string, port: number): Promise<Socket> {
  const socket = createConnection({ host: proxy.host, port: proxy.port });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => socket.destroy(new Error('SOCKS5 timeout')), 7000);
    socket.once('connect', () => { clearTimeout(timer); resolve(); });
    socket.once('error', reject);
  });

  const supportsAuth = Boolean(proxy.username);
  socket.write(Buffer.from(supportsAuth ? [0x05, 0x02, 0x00, 0x02] : [0x05, 0x01, 0x00]));
  const greeting = await readExactly(socket, 2);
  if (greeting[0] !== 0x05 || greeting[1] === 0xff) throw new Error('SOCKS5 authentication method rejected');

  if (greeting[1] === 0x02) {
    const user = Buffer.from(proxy.username ?? '', 'utf8');
    const pass = Buffer.from(proxy.password ?? '', 'utf8');
    if (user.length > 255 || pass.length > 255) throw new Error('SOCKS5 credentials too long');
    socket.write(Buffer.concat([Buffer.from([0x01, user.length]), user, Buffer.from([pass.length]), pass]));
    const auth = await readExactly(socket, 2);
    if (auth[1] !== 0x00) throw new Error('SOCKS5 authentication failed');
  }

  const hostBytes = Buffer.from(host, 'utf8');
  if (hostBytes.length > 255) throw new Error('SOCKS5 host too long');
  const portBytes = Buffer.from([(port >> 8) & 0xff, port & 0xff]);
  socket.write(Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x03, hostBytes.length]), hostBytes, portBytes]));
  const head = await readExactly(socket, 4);
  if (head[0] !== 0x05 || head[1] !== 0x00) throw new Error(`SOCKS5 connect failed: ${head[1]}`);
  const atyp = head[3];
  if (atyp === 0x01) await readExactly(socket, 4);
  else if (atyp === 0x04) await readExactly(socket, 16);
  else if (atyp === 0x03) {
    const len = (await readExactly(socket, 1))[0] ?? 0;
    await readExactly(socket, len);
  } else throw new Error('SOCKS5 invalid address type');
  await readExactly(socket, 2);
  return socket;
}

async function requestViaSocks5(url: URL, proxy: ProxyRuntimeConfig): Promise<string> {
  const socket = await connectSocks5(proxy, url.hostname, url.port ? Number(url.port) : 80);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    socket.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    socket.once('error', reject);
    socket.once('end', () => {
      const response = Buffer.concat(chunks).toString('utf8');
      const split = response.indexOf('\r\n\r\n');
      if (split < 0 || !/^HTTP\/1\.[01] 2\d\d /i.test(response)) {
        reject(new Error('Invalid IP echo response through SOCKS5'));
        return;
      }
      resolve(response.slice(split + 4).trim());
    });
    socket.write(`GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.host}\r\nAccept: application/json,text/plain\r\nConnection: close\r\n\r\n`);
  }).finally(() => socket.destroy());
}

export async function requestIpEcho(urlText: string, proxy: ProxyRuntimeConfig | null): Promise<string> {
  const url = new URL(urlText);
  if (url.protocol !== 'http:') throw new Error('IP echo endpoints must use HTTP for proxy compatibility');
  if (!proxy) return collectHttpResponse(httpRequest, url, null);
  if (proxy.type === 'http') return collectHttpResponse(httpRequest, url, proxy);
  if (proxy.type === 'https') return collectHttpResponse(httpsRequest, url, proxy);
  if (proxy.type === 'socks5') return requestViaSocks5(url, proxy);
  throw new Error(`Unsupported proxy type: ${proxy.type}`);
}

export class EgressIpResolver {
  constructor(
    private readonly request: IpEchoRequest = requestIpEcho,
    private readonly endpoints: readonly string[] = DEFAULT_ENDPOINTS
  ) {}

  async resolve(proxy: ProxyRuntimeConfig | null): Promise<{ publicIp: string }> {
    for (const endpoint of this.endpoints) {
      try {
        const response = await this.request(endpoint, proxy);
        const publicIp = parseIp(response);
        if (publicIp) return { publicIp };
      } catch {
        // Try the next independent echo endpoint.
      }
    }
    throw new AppError('EGRESS_IP_RESOLUTION_FAILED', 'Unable to resolve public egress IP');
  }
}
