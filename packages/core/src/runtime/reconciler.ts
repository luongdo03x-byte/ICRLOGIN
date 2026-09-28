import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { BrowserRuntimeInfo } from '@icrlogin/shared';
import type { AppPaths } from '../app-paths.js';
import type { ProcessRegistry } from '../browsers/process-registry.js';
import type { RuntimeSessionRepository } from '../repositories/runtime-session-repository.js';

export interface ProcessSnapshot {
  pid: number;
  executablePath: string;
  commandLine: string;
}

export interface ProcessInspector {
  inspect(pid: number): Promise<ProcessSnapshot | null>;
}

export type ReconcileCdpProbe = (baseUrl: string, timeoutMs: number, signal: AbortSignal) => Promise<string>;

export interface RuntimeReconcilerDependencies {
  runtimeSessions: RuntimeSessionRepository;
  registry: ProcessRegistry;
  processInspector: ProcessInspector;
  cdpProbe: ReconcileCdpProbe;
  paths: AppPaths;
  cdpTimeoutMs?: number;
}

export interface ReconcileReport {
  recovered: string[];
  stale: string[];
}

function windowsIdentity(value: string): string {
  return value.replace(/\\/g, '/').toLowerCase();
}

function profileLockPath(paths: AppPaths, profileId: string): string | null {
  if (!profileId || profileId.includes('/') || profileId.includes('\\') || profileId === '.' || profileId === '..') return null;
  return join(paths.profilesDir, profileId, 'runtime', 'profile.lock');
}

export class RuntimeReconciler {
  private readonly cdpTimeoutMs: number;

  constructor(readonly dependencies: RuntimeReconcilerDependencies) {
    this.cdpTimeoutMs = dependencies.cdpTimeoutMs ?? 1_500;
  }

  async reconcile(): Promise<ReconcileReport> {
    const report: ReconcileReport = { recovered: [], stale: [] };
    for (const session of this.dependencies.runtimeSessions.list()) {
      const recovered = await this.tryRecover(session);
      if (recovered) report.recovered.push(session.profileId);
      else {
        await this.clearStale(session.profileId);
        report.stale.push(session.profileId);
      }
    }
    return report;
  }

  private async tryRecover(session: BrowserRuntimeInfo): Promise<boolean> {
    let process: ProcessSnapshot | null;
    try {
      process = await this.dependencies.processInspector.inspect(session.pid);
    } catch {
      return false;
    }
    if (!process || process.pid !== session.pid) return false;
    if (windowsIdentity(process.executablePath) !== windowsIdentity(session.executablePath)) return false;
    if (!windowsIdentity(process.commandLine).includes(windowsIdentity(session.userDataDir))) return false;
    if (!session.cdpHttpUrl.startsWith('http://127.0.0.1:')) return false;

    const controller = new AbortController();
    let webSocketDebuggerUrl: string;
    try {
      webSocketDebuggerUrl = await this.dependencies.cdpProbe(session.cdpHttpUrl, this.cdpTimeoutMs, controller.signal);
    } catch {
      return false;
    }

    const runtime: BrowserRuntimeInfo = {
      ...session,
      webSocketDebuggerUrl,
      state: 'running'
    };
    this.dependencies.runtimeSessions.upsert(runtime);
    this.dependencies.registry.register(runtime);
    return true;
  }

  private async clearStale(profileId: string): Promise<void> {
    this.dependencies.registry.remove(profileId);
    this.dependencies.runtimeSessions.delete(profileId);
    const lockPath = profileLockPath(this.dependencies.paths, profileId);
    if (lockPath) await rm(lockPath, { force: true });
  }
}
