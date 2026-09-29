import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError, type BrowserRuntimeInfo, type BrowserRuntimeState, type Profile } from '@icrlogin/shared';
import type { AppPaths } from '../app-paths.js';
import type { InstalledBrowser } from './artifact-provider.js';
import type { ChildProcessHandle, ChromiumLaunchInput } from './chromium-launcher.js';
import type { ProxyRuntimeConfig } from '../proxies/proxy-args.js';
import type { RuntimeSessionRepository } from '../repositories/runtime-session-repository.js';
import type { ProcessRegistry } from './process-registry.js';
import type { ProfileOperationLock } from './operation-lock.js';
import { closeBrowserOverCdp } from './cdp-client.js';

interface ProfileReader {
  getById(id: string): Profile | null;
  markLastUsed?(id: string, usedAt: string): void;
}

interface BrowserVersionResolver {
  ensureInstalled(version: string): Promise<InstalledBrowser>;
}

interface ProxyRuntimeResolver {
  getRuntimeConfig(id: string): Promise<ProxyRuntimeConfig>;
}

interface PortAllocatorLike {
  reserve(preferredPort?: number): Promise<number>;
  release(port: number): Promise<void>;
}

interface ChromiumLauncherLike {
  spawn(input: ChromiumLaunchInput): ChildProcessHandle;
}

export type CdpWaiter = (baseUrl: string, timeoutMs: number, signal: AbortSignal) => Promise<string>;
export type CdpCloser = (webSocketUrl: string, timeoutMs: number) => Promise<void>;
export type BrowserLifecycleState = 'stopped' | BrowserRuntimeState;

export interface BrowserServiceDependencies {
  profiles: ProfileReader;
  browserVersions: BrowserVersionResolver;
  proxies: ProxyRuntimeResolver;
  portAllocator: PortAllocatorLike;
  launcher: ChromiumLauncherLike;
  cdpWaiter: CdpWaiter;
  cdpCloser?: CdpCloser;
  registry: ProcessRegistry;
  operationLock: ProfileOperationLock;
  runtimeSessions: RuntimeSessionRepository;
  paths: AppPaths;
  cdpTimeoutMs?: number;
  stopGraceMs?: number;
}

interface ManagedProcess {
  handle: ChildProcessHandle;
  exitPromise: Promise<void>;
}

function timeout(ms: number): Promise<'timeout'> {
  return new Promise((resolve) => setTimeout(() => resolve('timeout'), ms));
}

export class BrowserService {
  private readonly starting = new Set<string>();
  private readonly stopping = new Set<string>();
  private readonly restarting = new Set<string>();
  private readonly processes = new Map<string, ManagedProcess>();
  private readonly cdpTimeoutMs: number;
  private readonly stopGraceMs: number;
  private readonly cdpCloser: CdpCloser;

  constructor(private readonly deps: BrowserServiceDependencies) {
    this.cdpTimeoutMs = deps.cdpTimeoutMs ?? 15_000;
    this.stopGraceMs = deps.stopGraceMs ?? 8_000;
    this.cdpCloser = deps.cdpCloser ?? closeBrowserOverCdp;
  }

  getRuntime(profileId: string): BrowserRuntimeInfo | null {
    return this.deps.registry.get(profileId) ?? null;
  }

  getState(profileId: string): BrowserLifecycleState {
    if (this.stopping.has(profileId)) return 'stopping';
    if (this.starting.has(profileId)) return 'starting';
    if (this.restarting.has(profileId)) return this.deps.registry.get(profileId) ? 'stopping' : 'starting';
    return this.deps.registry.get(profileId)?.state ?? 'stopped';
  }

  async start(profileId: string): Promise<BrowserRuntimeInfo> {
    return this.startInternal(profileId, false);
  }

  private async startInternal(profileId: string, fromRestart: boolean): Promise<BrowserRuntimeInfo> {
    if (this.deps.registry.get(profileId)) throw new AppError('PROFILE_ALREADY_RUNNING', 'Profile is already running');
    if (this.starting.has(profileId) || (!fromRestart && this.restarting.has(profileId))) {
      throw new AppError('PROFILE_START_IN_PROGRESS', 'Profile start is already in progress');
    }
    this.starting.add(profileId);

    try {
      return await this.deps.operationLock.runExclusive(profileId, async () => {
        if (this.deps.registry.get(profileId)) throw new AppError('PROFILE_ALREADY_RUNNING', 'Profile is already running');
        const profile = this.deps.profiles.getById(profileId);
        if (!profile) throw new AppError('PROFILE_NOT_FOUND', 'Profile not found');

        const installed = await this.deps.browserVersions.ensureInstalled(profile.browserVersion);
        const proxy = profile.proxyId ? await this.deps.proxies.getRuntimeConfig(profile.proxyId) : null;
        const port = await this.deps.portAllocator.reserve();
        let portReserved = true;
        let handle: ChildProcessHandle | undefined;
        const cdpAbort = new AbortController();
        let exited = false;
        let startupComplete = false;
        let resolveExit!: () => void;
        const exitPromise = new Promise<void>((resolve) => { resolveExit = resolve; });
        const lockPath = this.runtimeLockPath(profileId);

        try {
          await this.deps.portAllocator.release(port);
          portReserved = false;
          const userDataDir = join(this.deps.paths.profilesDir, profileId, 'user-data');
          handle = this.deps.launcher.spawn({
            profile,
            executablePath: installed.executablePath,
            profileUserDataDir: userDataDir,
            remoteDebuggingPort: port,
            proxy
          });

          handle.onExit(() => {
            exited = true;
            resolveExit();
            if (!startupComplete) {
              cdpAbort.abort(new AppError('BROWSER_START_FAILED', 'Chromium exited during startup'));
              return;
            }
            void this.cleanupRuntime(profileId, handle?.pid);
          });

          await writeFile(lockPath, `${JSON.stringify({
            profileId,
            pid: handle.pid,
            browserVersion: profile.browserVersion,
            executablePath: installed.executablePath,
            userDataDir,
            debuggingPort: port,
            startedAt: new Date().toISOString()
          }, null, 2)}\n`, 'utf8');

          const cdpHttpUrl = `http://127.0.0.1:${port}`;
          const webSocketDebuggerUrl = await this.deps.cdpWaiter(cdpHttpUrl, this.cdpTimeoutMs, cdpAbort.signal);
          if (exited) throw new AppError('BROWSER_START_FAILED', 'Chromium exited before runtime registration');

          const runtime: BrowserRuntimeInfo = {
            profileId,
            pid: handle.pid,
            browserVersion: profile.browserVersion,
            executablePath: installed.executablePath,
            userDataDir,
            remoteDebuggingPort: port,
            cdpHttpUrl,
            webSocketDebuggerUrl,
            state: 'running',
            startedAt: new Date().toISOString()
          };
          this.deps.runtimeSessions.upsert(runtime);
          this.deps.registry.register(runtime);
          this.processes.set(profileId, { handle, exitPromise });
          startupComplete = true;
          if (exited) {
            await this.cleanupRuntime(profileId, handle.pid);
            throw new AppError('BROWSER_START_FAILED', 'Chromium exited while runtime state was being registered');
          }
          this.deps.profiles.markLastUsed?.(profileId, runtime.startedAt);
          return runtime;
        } catch (error) {
          if (portReserved) await this.deps.portAllocator.release(port).catch(() => undefined);
          if (handle) await handle.forceTerminate().catch(() => undefined);
          await this.cleanupRuntime(profileId, handle?.pid);
          throw error;
        }
      });
    } finally {
      this.starting.delete(profileId);
    }
  }

  async stop(profileId: string): Promise<void> {
    this.stopping.add(profileId);
    try {
      await this.deps.operationLock.runExclusive(profileId, async () => {
        const runtime = this.deps.registry.get(profileId);
        if (!runtime) throw new AppError('PROFILE_NOT_RUNNING', 'Profile is not running');
        const process = this.processes.get(profileId);

        try {
          await this.cdpCloser(runtime.webSocketDebuggerUrl, this.stopGraceMs);
        } catch (error) {
          if (!process) {
            throw new AppError('INTERNAL_ERROR', 'Unable to close recovered Chromium runtime', {
              cause: error instanceof Error ? error.message : String(error)
            });
          }
          await process.handle.requestClose();
        }

        if (process) {
          const first = await Promise.race([process.exitPromise.then(() => 'exit' as const), timeout(this.stopGraceMs)]);
          if (first === 'timeout') {
            await process.handle.forceTerminate();
            await Promise.race([process.exitPromise, timeout(Math.min(this.stopGraceMs, 1000))]);
          }
        }
        await this.cleanupRuntime(profileId, runtime.pid);
      });
    } finally {
      this.stopping.delete(profileId);
    }
  }

  async restart(profileId: string): Promise<BrowserRuntimeInfo> {
    if (this.restarting.has(profileId) || this.starting.has(profileId) || this.stopping.has(profileId)) {
      throw new AppError('PROFILE_START_IN_PROGRESS', 'Profile restart is already in progress');
    }
    this.restarting.add(profileId);
    try {
      if (this.deps.registry.get(profileId)) await this.stop(profileId);
      return await this.startInternal(profileId, true);
    } finally {
      this.restarting.delete(profileId);
    }
  }

  private runtimeLockPath(profileId: string): string {
    return join(this.deps.paths.profilesDir, profileId, 'runtime', 'profile.lock');
  }

  private async cleanupRuntime(profileId: string, expectedPid?: number): Promise<void> {
    const registered = this.deps.registry.get(profileId);
    if (expectedPid !== undefined && registered && registered.pid !== expectedPid) return;
    this.deps.registry.remove(profileId);
    this.deps.runtimeSessions.delete(profileId);
    this.processes.delete(profileId);
    await rm(this.runtimeLockPath(profileId), { force: true });
  }
}
