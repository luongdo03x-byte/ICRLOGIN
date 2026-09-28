import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { BrowserService } from '../src/browsers/browser-service.js';
import { BrowserVersionService } from '../src/browsers/browser-version-service.js';
import { ChromiumLauncher, type SpawnFunction } from '../src/browsers/chromium-launcher.js';
import { waitForCdp } from '../src/browsers/cdp-client.js';
import { ProfileOperationLock } from '../src/browsers/operation-lock.js';
import { PortAllocator } from '../src/browsers/port-allocator.js';
import { ProcessRegistry } from '../src/browsers/process-registry.js';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import { openDatabase } from '../src/db/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { ProfileFiles } from '../src/profiles/profile-files.js';
import { ProfileService } from '../src/profiles/profile-service.js';
import { ProxyService } from '../src/proxies/proxy-service.js';
import { BrowserVersionRepository } from '../src/repositories/browser-version-repository.js';
import { ProfileRepository } from '../src/repositories/profile-repository.js';
import { ProxyRepository } from '../src/repositories/proxy-repository.js';
import { RuntimeSessionRepository } from '../src/repositories/runtime-session-repository.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';
import { FakeSecretStore } from './helpers/fake-secret-store.js';

async function pathExists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function resolveChromiumExecutable(): Promise<string> {
  const explicit = process.env.ICR_CHROMIUM_PATH;
  if (explicit && await pathExists(explicit)) return explicit;

  try {
    const moduleName = 'playwright';
    const playwright = await import(moduleName) as { chromium?: { executablePath(): string } };
    const managed = playwright.chromium?.executablePath();
    if (managed && await pathExists(managed)) return managed;
  } catch {
    // Offline/local verification may use a system Chromium instead.
  }

  for (const candidate of ['/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium-browser']) {
    if (await pathExists(candidate)) return candidate;
  }
  throw new Error('Chromium fixture unavailable; install Playwright Chromium or set ICR_CHROMIUM_PATH');
}

function createHeadlessTestLauncher(capturedArgs?: string[]): ChromiumLauncher {
  const spawnWithHeadless: SpawnFunction = (command, args, options) => {
    capturedArgs?.push(...args);
    return nodeSpawn(command, [
    '--headless=new',
    ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    ...args
  ], options);
  };
  return new ChromiumLauncher(spawnWithHeadless);
}

async function sendBrowserCdpCommand(webSocketUrl: string, method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const socket = new WebSocket(webSocketUrl);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('CDP websocket failed to open')), { once: true });
  });
  try {
    const id = 1;
    const response = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`CDP ${method} timed out`)), 2000);
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: unknown };
        if (message.id !== id) return;
        clearTimeout(timer);
        if (message.error) reject(new Error(`CDP ${method} failed`));
        else resolve(message.result);
      });
    });
    socket.send(JSON.stringify({ id, method, params }));
    return await response;
  } finally {
    socket.close();
  }
}

describe('real chromium profile lifecycle', () => {
  it('starts, accepts CDP commands, stops cleanly, and reuses the profile user-data directory', async () => {
    const chromiumExecutable = await resolveChromiumExecutable();
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const db = openDatabase(join(paths.dataDir, 'icrlogin.db'));
      try {
        runMigrations(db);
        const profileRepository = new ProfileRepository(db);
        const profileService = new ProfileService(profileRepository, new ProfileFiles(paths));
        const profile = await profileService.create({ name: 'Chromium integration', browserVersion: 'integration-chromium' });

        const browserVersionsRepository = new BrowserVersionRepository(db);
        browserVersionsRepository.markInstalled({
          version: 'integration-chromium',
          executablePath: chromiumExecutable,
          sha256: 'a'.repeat(64),
          artifactSize: 1,
          installedAt: new Date().toISOString()
        });
        const browserVersions = new BrowserVersionService({ async getManifest() { throw new Error('installed fixture should bypass manifest'); } }, browserVersionsRepository);
        const runtimeSessions = new RuntimeSessionRepository(db);
        const registry = new ProcessRegistry();
        const service = new BrowserService({
          profiles: profileRepository,
          browserVersions,
          proxies: { async getRuntimeConfig() { throw new Error('proxy should not be requested'); } },
          portAllocator: new PortAllocator(),
          launcher: createHeadlessTestLauncher(),
          cdpWaiter: waitForCdp,
          registry,
          operationLock: new ProfileOperationLock(),
          runtimeSessions,
          paths,
          cdpTimeoutMs: 5000,
          stopGraceMs: 2000
        });

        const first = await service.start(profile.id);
        expect(first.cdpHttpUrl.startsWith('http://127.0.0.1:')).toBe(true);
        const version = await sendBrowserCdpCommand(first.webSocketDebuggerUrl, 'Browser.getVersion') as { product?: string };
        expect(typeof version.product).toBe('string');
        const target = await sendBrowserCdpCommand(first.webSocketDebuggerUrl, 'Target.createTarget', { url: 'data:text/html,<h1>ICRLogin</h1>' }) as { targetId?: string };
        expect(typeof target.targetId).toBe('string');
        const firstUserDataDir = first.userDataDir;

        await service.stop(profile.id);
        expect(registry.get(profile.id)).toBe(undefined);
        expect(runtimeSessions.get(profile.id)).toBe(null);

        const second = await service.start(profile.id);
        expect(second.userDataDir).toBe(firstUserDataDir);
        await service.stop(profile.id);
        expect(registry.get(profile.id)).toBe(undefined);
        expect(runtimeSessions.get(profile.id)).toBe(null);
      } finally {
        db.close();
      }
    } finally {
      await removeTempRoot(root);
    }
  });

  it('keeps decrypted proxy passwords out of the real Chromium command line', async () => {
    const chromiumExecutable = await resolveChromiumExecutable();
    const root = await createTempRoot();
    const secret = 'phase1-super-secret';
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const db = openDatabase(join(paths.dataDir, 'icrlogin.db'));
      try {
        runMigrations(db);
        const proxyService = new ProxyService(new ProxyRepository(db), new FakeSecretStore(), {
          idFactory: () => '99999999-9999-4999-8999-999999999999'
        });
        const proxy = await proxyService.create({
          name: 'integration-auth', type: 'http', host: '127.0.0.1', port: 65534, username: 'fixture-user', password: secret
        });
        const profileRepository = new ProfileRepository(db);
        const profileService = new ProfileService(profileRepository, new ProfileFiles(paths));
        const profile = await profileService.create({
          name: 'Proxy command-line integration', browserVersion: 'integration-chromium', proxyId: proxy.id
        });
        const browserVersionsRepository = new BrowserVersionRepository(db);
        browserVersionsRepository.markInstalled({
          version: 'integration-chromium', executablePath: chromiumExecutable, sha256: 'b'.repeat(64), artifactSize: 1, installedAt: new Date().toISOString()
        });
        const browserVersions = new BrowserVersionService({ async getManifest() { throw new Error('installed fixture should bypass manifest'); } }, browserVersionsRepository);
        const runtimeSessions = new RuntimeSessionRepository(db);
        const registry = new ProcessRegistry();
        const capturedArgs: string[] = [];
        const service = new BrowserService({
          profiles: profileRepository, browserVersions, proxies: proxyService, portAllocator: new PortAllocator(),
          launcher: createHeadlessTestLauncher(capturedArgs), cdpWaiter: waitForCdp, registry,
          operationLock: new ProfileOperationLock(), runtimeSessions, paths, cdpTimeoutMs: 5000, stopGraceMs: 2000
        });

        const runtime = await service.start(profile.id);
        try {
          const argsText = capturedArgs.join(' ');
          expect(argsText.includes('--proxy-server=http://127.0.0.1:65534')).toBe(true);
          expect(argsText.includes(secret)).toBe(false);
          if (process.platform === 'linux') {
            const processCommandLine = (await readFile(`/proc/${runtime.pid}/cmdline`, 'utf8')).replaceAll('\0', ' ');
            expect(processCommandLine.includes('--proxy-server=http://127.0.0.1:65534')).toBe(true);
            expect(processCommandLine.includes(secret)).toBe(false);
          }
        } finally {
          await service.stop(profile.id);
        }
      } finally {
        db.close();
      }
    } finally {
      await removeTempRoot(root);
    }
  });

});
