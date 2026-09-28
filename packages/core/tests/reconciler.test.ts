import { access, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BrowserRuntimeInfo, Profile } from '@icrlogin/shared';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import { ProcessRegistry } from '../src/browsers/process-registry.js';
import { openDatabase } from '../src/db/database.js';
import { runMigrations } from '../src/db/migrate.js';
import { ProfileFiles } from '../src/profiles/profile-files.js';
import { ProfileRepository } from '../src/repositories/profile-repository.js';
import { RuntimeSessionRepository } from '../src/repositories/runtime-session-repository.js';
import {
  RuntimeReconciler,
  type ProcessInspector,
  type ProcessSnapshot
} from '../src/runtime/reconciler.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';

const profile: Profile = {
  id: '99999999-9999-4999-8999-999999999999', name: 'Recover', description: null, groupId: null,
  browserVersion: '143.0.0', proxyId: null, userAgent: null, language: 'en-US', timezone: 'UTC',
  windowWidth: 1280, windowHeight: 800, screenWidth: 1920, screenHeight: 1080, webrtcEnabled: true,
  geolocationMode: 'ask', startupUrls: [], createdAt: '2026-09-28T09:00:00.000Z',
  updatedAt: '2026-09-28T09:00:00.000Z', lastUsedAt: null, deletedAt: null
};

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function withReconciler(
  inspectorFactory: (runtime: BrowserRuntimeInfo) => ProcessInspector,
  cdpProbe: (baseUrl: string) => Promise<string>,
  run: (ctx: { reconciler: RuntimeReconciler; sessions: RuntimeSessionRepository; registry: ProcessRegistry; lockPath: string; runtime: BrowserRuntimeInfo }) => Promise<void>
) {
  const root = await createTempRoot();
  try {
    const paths = createAppPaths(root);
    await ensureAppPaths(paths);
    const db = openDatabase(join(paths.dataDir, 'icrlogin.db'));
    try {
      runMigrations(db);
      new ProfileRepository(db).create(profile);
      await new ProfileFiles(paths).create(profile.id);
      const sessions = new RuntimeSessionRepository(db);
      const runtime: BrowserRuntimeInfo = {
        profileId: profile.id,
        pid: 6262,
        browserVersion: profile.browserVersion,
        executablePath: 'C:/ICRLogin/browsers/143/chrome.exe',
        userDataDir: join(paths.profilesDir, profile.id, 'user-data'),
        remoteDebuggingPort: 43127,
        cdpHttpUrl: 'http://127.0.0.1:43127',
        webSocketDebuggerUrl: 'ws://127.0.0.1:43127/devtools/browser/old',
        state: 'running',
        startedAt: '2026-09-28T09:01:00.000Z'
      };
      sessions.upsert(runtime);
      const lockPath = join(paths.profilesDir, profile.id, 'runtime', 'profile.lock');
      await writeFile(lockPath, JSON.stringify({ pid: runtime.pid, debuggingPort: runtime.remoteDebuggingPort }), 'utf8');
      const registry = new ProcessRegistry();
      const inspector = inspectorFactory(runtime);
      const reconciler = new RuntimeReconciler({
        runtimeSessions: sessions,
        registry,
        processInspector: inspector,
        cdpProbe,
        paths,
        cdpTimeoutMs: 50
      });
      await run({ reconciler, sessions, registry, lockPath, runtime });
    } finally {
      db.close();
    }
  } finally {
    await removeTempRoot(root);
  }
}

describe('runtime reconciler', () => {
  it('removes a stale session and profile lock when the PID no longer exists', async () => {
    await withReconciler(() => ({ inspect: async () => null }), async () => { throw new Error('CDP must not run'); }, async ({ reconciler, sessions, registry, lockPath }) => {
      const report = await reconciler.reconcile();
      expect(JSON.stringify(report.stale)).toBe(JSON.stringify([profile.id]));
      expect(report.recovered.length).toBe(0);
      expect(sessions.get(profile.id)).toBe(null);
      expect(registry.list().length).toBe(0);
      expect(await exists(lockPath)).toBe(false);
    });
  });

  it('re-registers a matching live process and valid CDP endpoint without changing pinned version', async () => {
    await withReconciler(
      (runtime) => ({ inspect: async (pid: number) => ({
        pid,
        executablePath: runtime.executablePath,
        commandLine: `chrome.exe --user-data-dir=${runtime.userDataDir}`
      }) }),
      async () => 'ws://127.0.0.1:43127/devtools/browser/live',
      async ({ reconciler, sessions, registry, runtime }) => {
        const report = await reconciler.reconcile();
        expect(JSON.stringify(report.recovered)).toBe(JSON.stringify([profile.id]));
        expect(report.stale.length).toBe(0);
        expect(registry.get(profile.id)?.pid).toBe(runtime.pid);
        expect(registry.get(profile.id)?.browserVersion).toBe('143.0.0');
        expect(registry.get(profile.id)?.webSocketDebuggerUrl).toBe('ws://127.0.0.1:43127/devtools/browser/live');
        expect(sessions.get(profile.id)?.browserVersion).toBe('143.0.0');
      }
    );
  });

  it('treats an executable mismatch as stale metadata without terminating the observed PID', async () => {
    let inspected = 0;
    await withReconciler(
      () => ({ inspect: async (pid: number) => { inspected += 1; return { pid, executablePath: 'C:/Other/chrome.exe', commandLine: 'chrome.exe --other' }; } }),
      async () => { throw new Error('CDP must not run for mismatched identity'); },
      async ({ reconciler, registry, sessions }) => {
        const report = await reconciler.reconcile();
        expect(inspected).toBe(1);
        expect(report.stale[0]).toBe(profile.id);
        expect(registry.list().length).toBe(0);
        expect(sessions.get(profile.id)).toBe(null);
      }
    );
  });
});
