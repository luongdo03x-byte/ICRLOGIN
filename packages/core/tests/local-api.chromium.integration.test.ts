import { access } from 'node:fs/promises';
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
import { LocalApiServer } from '../src/api/local-api-server.js';
import { openDatabase } from '../src/db/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { GroupService } from '../src/groups/group-service.js';
import { ProfileFiles } from '../src/profiles/profile-files.js';
import { ProfileService } from '../src/profiles/profile-service.js';
import { ProxyConnectivityService } from '../src/proxies/proxy-connectivity-service.js';
import { ProxyService } from '../src/proxies/proxy-service.js';
import { BrowserVersionRepository } from '../src/repositories/browser-version-repository.js';
import { GroupRepository } from '../src/repositories/group-repository.js';
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
    const playwright = await import('playwright');
    const managed = playwright.chromium.executablePath();
    if (managed && await pathExists(managed)) return managed;
  } catch {}
  for (const candidate of ['/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium-browser']) {
    if (await pathExists(candidate)) return candidate;
  }
  throw new Error('Chromium fixture unavailable; install Playwright Chromium or set ICR_CHROMIUM_PATH');
}

function createHeadlessLauncher(): ChromiumLauncher {
  const spawnWithHeadless: SpawnFunction = (command, args, options) => nodeSpawn(command, [
    '--headless=new',
    ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    ...args
  ], options);
  return new ChromiumLauncher(spawnWithHeadless);
}

async function api(baseUrl: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json() as any;
  if (!response.ok || body.success === false) throw new Error(`API ${path} failed: ${body.error?.code ?? response.status}`);
  return body.data;
}

describe('local API real Chromium automation', () => {
  it('starts through HTTP, attaches Playwright over returned CDP, creates a page, and stops cleanly', async () => {
    const chromiumExecutable = await resolveChromiumExecutable();
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const db = openDatabase(join(paths.dataDir, 'icrlogin.db'));
      try {
        runMigrations(db);
        const profileRepository = new ProfileRepository(db);
        const profiles = new ProfileService(profileRepository, new ProfileFiles(paths));
        const groups = new GroupService(new GroupRepository(db));
        const proxies = new ProxyService(new ProxyRepository(db), new FakeSecretStore());
        const proxyConnectivity = new ProxyConnectivityService(proxies);
        const browserVersionRepository = new BrowserVersionRepository(db);
        browserVersionRepository.markInstalled({
          version: 'integration-chromium', executablePath: chromiumExecutable, sha256: 'c'.repeat(64), artifactSize: 1, installedAt: new Date().toISOString()
        });
        const browserVersions = new BrowserVersionService(
          { async getManifest() { throw new Error('installed fixture should bypass manifest'); } },
          browserVersionRepository,
          undefined,
          { usageCounter: (version) => profileRepository.countByBrowserVersion(version), uninstaller: async () => {} }
        );
        const runtimeSessions = new RuntimeSessionRepository(db);
        const registry = new ProcessRegistry();
        const browsers = new BrowserService({
          profiles: profileRepository,
          browserVersions,
          proxies,
          portAllocator: new PortAllocator(),
          launcher: createHeadlessLauncher(),
          cdpWaiter: waitForCdp,
          registry,
          operationLock: new ProfileOperationLock(),
          runtimeSessions,
          paths,
          cdpTimeoutMs: 5000,
          stopGraceMs: 2000
        });
        const services = { profiles, groups, proxies, proxyConnectivity, browserVersions, browsers, registry, runtimeSessions };
        const server = new LocalApiServer({ port: 0, services });
        const info = await server.start();
        try {
          const created = await api(info.baseUrl, '/api/v1/profiles', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'API Chromium integration', browserVersion: 'integration-chromium' })
          });
          const started = await api(info.baseUrl, `/api/v1/profiles/${created.id}/start`, { method: 'POST' });
          expect(started.cdpHttpUrl.startsWith('http://127.0.0.1:')).toBe(true);
          expect(started.webSocketDebuggerUrl.startsWith('ws://127.0.0.1:')).toBe(true);
          const versionResponse = await fetch(`${started.cdpHttpUrl}/json/version`);
          expect(versionResponse.ok).toBe(true);

          const { chromium } = await import('playwright');
          const browser = await chromium.connectOverCDP(started.cdpHttpUrl);
          const context = browser.contexts()[0];
          if (!context) throw new Error('No Chromium context available over CDP');
          const page = await context.newPage();
          await page.goto('data:text/html,<h1>ICRLogin API</h1>');
          expect(await page.locator('h1').textContent()).toBe('ICRLogin API');
          await page.close();

          await api(info.baseUrl, `/api/v1/profiles/${created.id}/stop`, { method: 'POST' });
          expect(registry.get(created.id)).toBeUndefined();
          expect(runtimeSessions.get(created.id)).toBe(null);
        } finally {
          await server.stop();
        }
      } finally {
        db.close();
      }
    } finally {
      await removeTempRoot(root);
    }
  }, 20_000);
});
