import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import type { BrowserRuntimeInfo } from '../../shared/src/browser.js';
import { waitForCdp } from '../src/browsers/cdp-client.js';
import { ProfileOperationLock } from '../src/browsers/operation-lock.js';
import { ProcessRegistry } from '../src/browsers/process-registry.js';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function listen(server: ReturnType<typeof createServer>): Promise<number> {
  await new Promise<void>((resolve) => server.listen({ host: '127.0.0.1', port: 0 }, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing server address');
  return address.port;
}

async function close(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve) => server.close(resolve));
}

describe('cdp runtime primitives', () => {
  it('polls /json/version until a valid websocket debugger URL is ready', async () => {
    let requests = 0;
    const server = createServer((req, res) => {
      if (req.url !== '/json/version') { res.statusCode = 404; res.end(); return; }
      requests += 1;
      if (requests < 3) { res.statusCode = 503; res.end('not ready'); return; }
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ webSocketDebuggerUrl: 'ws://127.0.0.1:43127/devtools/browser/test' }));
    });
    const port = await listen(server);
    try {
      const url = await waitForCdp(`http://127.0.0.1:${port}`, 1000, new AbortController().signal);
      expect(url).toBe('ws://127.0.0.1:43127/devtools/browser/test');
      expect(requests >= 3).toBe(true);
    } finally {
      await close(server);
    }
  });

  it('returns CDP_TIMEOUT when readiness never arrives', async () => {
    const server = createServer((_req, res) => { res.statusCode = 503; res.end('not ready'); });
    const port = await listen(server);
    try {
      let code: string | undefined;
      try { await waitForCdp(`http://127.0.0.1:${port}`, 40, new AbortController().signal); }
      catch (error: any) { code = error.code; }
      expect(code).toBe('CDP_TIMEOUT');
    } finally {
      await close(server);
    }
  });

  it('registers, lists, retrieves, and removes runtime records', () => {
    const registry = new ProcessRegistry();
    const runtime: BrowserRuntimeInfo = {
      profileId: 'p1', pid: 123, browserVersion: '143.0.0', executablePath: 'chrome.exe',
      userDataDir: 'profile/user-data', remoteDebuggingPort: 43127,
      cdpHttpUrl: 'http://127.0.0.1:43127', webSocketDebuggerUrl: 'ws://127.0.0.1:43127/devtools/browser/a',
      state: 'running', startedAt: '2026-09-28T07:00:00.000Z'
    };
    registry.register(runtime);
    expect(registry.get('p1')?.pid).toBe(123);
    expect(registry.list().length).toBe(1);
    expect(registry.remove('p1')?.pid).toBe(123);
    expect(registry.get('p1')).toBe(undefined);
  });

  it('serializes same-profile operations while allowing different profiles concurrently', async () => {
    const lock = new ProfileOperationLock();
    const sameEvents: string[] = [];
    await Promise.all([
      lock.runExclusive('same', async () => { sameEvents.push('first-start'); await delay(25); sameEvents.push('first-end'); }),
      lock.runExclusive('same', async () => { sameEvents.push('second-start'); sameEvents.push('second-end'); })
    ]);
    expect(JSON.stringify(sameEvents)).toBe(JSON.stringify(['first-start', 'first-end', 'second-start', 'second-end']));

    let active = 0;
    let maxActive = 0;
    await Promise.all(['a', 'b'].map((id) => lock.runExclusive(id, async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await delay(20);
      active -= 1;
    })));
    expect(maxActive).toBe(2);
  });
});

import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError, type Profile } from '@icrlogin/shared';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import { BrowserService } from '../src/browsers/browser-service.js';
import { ProfileFiles } from '../src/profiles/profile-files.js';
import { openDatabase } from '../src/db/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { ProfileRepository } from '../src/repositories/profile-repository.js';
import { RuntimeSessionRepository } from '../src/repositories/runtime-session-repository.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';
import { FakeChildProcessHandle } from './helpers/fake-process.js';

async function pathExists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

const lifecycleProfile = (id: string): Profile => ({
  id, name: 'Lifecycle', description: null, groupId: null, browserVersion: '143.0.0', proxyId: null,
  userAgent: null, language: 'en-US', timezone: 'UTC', windowWidth: 1280, windowHeight: 800,
  screenWidth: 1920, screenHeight: 1080, webrtcEnabled: true, geolocationMode: 'ask', startupUrls: [],
  createdAt: '2026-09-28T08:00:00.000Z', updatedAt: '2026-09-28T08:00:00.000Z', lastUsedAt: null, deletedAt: null
});

async function withBrowserLifecycle(
  configure: (ctx: {
    service: BrowserService;
    profile: Profile;
    runtimeRepo: RuntimeSessionRepository;
    registry: ProcessRegistry;
    handle: FakeChildProcessHandle;
    events: string[];
    portAllocator: { isReserved(port: number): boolean };
    lockPath: string;
    resolveCdp(url?: string): void;
    rejectCdp(error: unknown): void;
    spawnCount(): number;
    cdpCloseCalls(): number;
    createFreshService(): BrowserService;
  }) => Promise<void>,
  options: { deferredCdp?: boolean; cdpError?: unknown; closeExits?: boolean; stopGraceMs?: number; cdpCloseError?: unknown; cdpCloseExits?: boolean; exitOnRuntimeUpsert?: boolean } = {}
): Promise<void> {
  const root = await createTempRoot();
  try {
    const paths = createAppPaths(root);
    await ensureAppPaths(paths);
    const db = openDatabase(join(paths.dataDir, 'icrlogin.db'));
    try {
      runMigrations(db);
      const profiles = new ProfileRepository(db);
      const profile = lifecycleProfile('88888888-8888-4888-8888-888888888888');
      profiles.create(profile);
      await new ProfileFiles(paths).create(profile.id);
      const runtimeRepo = new RuntimeSessionRepository(db);
      const registry = new ProcessRegistry();
      const operationLock = new ProfileOperationLock();
      const events: string[] = [];
      let reserved = false;
      const port = 43127;
      const portAllocator = {
        async reserve() { events.push('reserve'); reserved = true; return port; },
        async release(released: number) { events.push('release'); if (released === port) reserved = false; },
        isReserved(check: number) { return check === port && reserved; }
      };
      const handle = new FakeChildProcessHandle(5151);
      handle.closeExits = options.closeExits ?? false;
      let spawns = 0;
      const launcher = {
        spawn() { events.push('spawn'); spawns += 1; return handle; }
      };
      let resolveCdp!: (url?: string) => void;
      let rejectCdp!: (error: unknown) => void;
      const deferred = new Promise<string>((resolve, reject) => {
        resolveCdp = (url = 'ws://127.0.0.1:43127/devtools/browser/test') => resolve(url);
        rejectCdp = reject;
      });
      const cdpWaiter = async () => {
        events.push('cdp');
        if (options.cdpError) throw options.cdpError;
        if (options.deferredCdp) return deferred;
        return 'ws://127.0.0.1:43127/devtools/browser/test';
      };
      const browserVersions = {
        async ensureInstalled() {
          events.push('browser');
          return {
            version: '143.0.0', executablePath: 'C:/ICRLogin/browsers/143/chrome.exe', sha256: 'a'.repeat(64),
            artifactSize: 123, installedAt: '2026-09-28T08:00:00.000Z'
          };
        }
      };
      let cdpCloses = 0;
      const cdpCloser = async () => {
        cdpCloses += 1;
        if (options.cdpCloseError) throw options.cdpCloseError;
        if (options.cdpCloseExits) handle.emitExit(0, null);
      };
      const baseDeps = {
        profiles,
        browserVersions,
        proxies: { async getRuntimeConfig() { throw new Error('proxy should not be requested'); } },
        portAllocator,
        launcher,
        cdpWaiter,
        cdpCloser,
        registry,
        operationLock,
        runtimeSessions: runtimeRepo,
        paths,
        cdpTimeoutMs: 100,
        stopGraceMs: options.stopGraceMs ?? 20
      };
      if (options.exitOnRuntimeUpsert) {
        const originalUpsert = runtimeRepo.upsert.bind(runtimeRepo);
        runtimeRepo.upsert = ((runtime: BrowserRuntimeInfo) => {
          const result = originalUpsert(runtime);
          handle.emitExit(0, null);
          return result;
        }) as typeof runtimeRepo.upsert;
      }
      const service = new BrowserService(baseDeps as any);
      await configure({
        service, profile, runtimeRepo, registry, handle, events, portAllocator,
        lockPath: join(paths.profilesDir, profile.id, 'runtime', 'profile.lock'),
        resolveCdp, rejectCdp, spawnCount: () => spawns, cdpCloseCalls: () => cdpCloses,
        createFreshService: () => new BrowserService(baseDeps as any)
      });
    } finally {
      db.close();
    }
  } finally {
    await removeTempRoot(root);
  }
}

describe('browser service lifecycle', () => {
  it('starts in order, releases reserved port for spawn, then persists runtime state', async () => {
    await withBrowserLifecycle(async ({ service, profile, runtimeRepo, registry, events, portAllocator, lockPath }) => {
      const runtime = await service.start(profile.id);
      expect(JSON.stringify(events)).toBe(JSON.stringify(['browser', 'reserve', 'release', 'spawn', 'cdp']));
      expect(portAllocator.isReserved(43127)).toBe(false);
      expect(runtime.pid).toBe(5151);
      expect(runtime.remoteDebuggingPort).toBe(43127);
      expect(runtime.cdpHttpUrl).toBe('http://127.0.0.1:43127');
      expect(runtime.webSocketDebuggerUrl).toBe('ws://127.0.0.1:43127/devtools/browser/test');
      expect(runtimeRepo.get(profile.id)?.pid).toBe(5151);
      expect(registry.get(profile.id)?.pid).toBe(5151);
      expect(await pathExists(lockPath)).toBe(true);
    });
  });

  it('allows only one spawn for concurrent start requests of the same profile', async () => {
    await withBrowserLifecycle(async ({ service, profile, resolveCdp, spawnCount }) => {
      const first = service.start(profile.id);
      await delay(5);
      let secondCode: string | undefined;
      const second = service.start(profile.id).catch((error: any) => { secondCode = error.code; return null; });
      await delay(5);
      expect(spawnCount()).toBe(1);
      resolveCdp();
      await first;
      await second;
      expect(['PROFILE_START_IN_PROGRESS', 'PROFILE_ALREADY_RUNNING'].includes(secondCode ?? '')).toBe(true);
      expect(spawnCount()).toBe(1);
    }, { deferredCdp: true });
  });

  it('force-terminates and removes every runtime artifact when CDP fails after spawn', async () => {
    await withBrowserLifecycle(async ({ service, profile, runtimeRepo, registry, handle, portAllocator, lockPath }) => {
      let code: string | undefined;
      try { await service.start(profile.id); } catch (error: any) { code = error.code; }
      expect(code).toBe('CDP_TIMEOUT');
      expect(handle.forceCalls).toBe(1);
      expect(registry.get(profile.id)).toBe(undefined);
      expect(runtimeRepo.get(profile.id)).toBe(null);
      expect(portAllocator.isReserved(43127)).toBe(false);
      expect(await pathExists(lockPath)).toBe(false);
    }, { cdpError: new AppError('CDP_TIMEOUT', 'not ready') });
  });

  it('stops gracefully through Browser.close over CDP before using process signals', async () => {
    await withBrowserLifecycle(async ({ service, profile, runtimeRepo, registry, handle, lockPath, cdpCloseCalls }) => {
      await service.start(profile.id);
      await service.stop(profile.id);
      expect(cdpCloseCalls()).toBe(1);
      expect(handle.closeCalls).toBe(0);
      expect(handle.forceCalls).toBe(0);
      expect(registry.get(profile.id)).toBe(undefined);
      expect(runtimeRepo.get(profile.id)).toBe(null);
      expect(await pathExists(lockPath)).toBe(false);
    }, { cdpCloseExits: true });
  });

  it('can stop a recovered runtime even when this BrowserService did not spawn the process', async () => {
    await withBrowserLifecycle(async ({ service, createFreshService, profile, runtimeRepo, registry, handle, cdpCloseCalls }) => {
      await service.start(profile.id);
      const recoveredService = createFreshService();
      await recoveredService.stop(profile.id);
      expect(cdpCloseCalls()).toBe(1);
      expect(handle.closeCalls).toBe(0);
      expect(registry.get(profile.id)).toBe(undefined);
      expect(runtimeRepo.get(profile.id)).toBe(null);
    }, { cdpCloseExits: true });
  });

  it('fails start and cleans runtime if the process exits while runtime state is being persisted', async () => {
    await withBrowserLifecycle(async ({ service, profile, runtimeRepo, registry, lockPath }) => {
      let code: string | undefined;
      try { await service.start(profile.id); } catch (error: any) { code = error.code; }
      expect(code).toBe('BROWSER_START_FAILED');
      expect(registry.get(profile.id)).toBe(undefined);
      expect(runtimeRepo.get(profile.id)).toBe(null);
      expect(await pathExists(lockPath)).toBe(false);
    }, { exitOnRuntimeUpsert: true });
  });

  it('falls back to force termination after the grace timeout', async () => {
    await withBrowserLifecycle(async ({ service, profile, handle, runtimeRepo, registry, cdpCloseCalls }) => {
      await service.start(profile.id);
      await service.stop(profile.id);
      expect(cdpCloseCalls()).toBe(1);
      expect(handle.closeCalls).toBe(1);
      expect(handle.forceCalls).toBe(1);
      expect(registry.get(profile.id)).toBe(undefined);
      expect(runtimeRepo.get(profile.id)).toBe(null);
    }, { closeExits: false, stopGraceMs: 10, cdpCloseError: new Error('cdp close failed') });
  });
});
