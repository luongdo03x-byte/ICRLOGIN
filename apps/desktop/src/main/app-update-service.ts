import type { AppUpdateSnapshot } from '@icrlogin/shared';

export interface AppUpdateCheckResult { availableVersion: string | null; }
export interface AppUpdateProgress { percent: number; transferred: number; total: number; }
export interface AppUpdateAdapter {
  checkForUpdates(): Promise<AppUpdateCheckResult>;
  downloadUpdate(): Promise<void>;
  onProgress(listener: (progress: AppUpdateProgress) => void): () => void;
  onDownloaded(listener: (version: string) => void): () => void;
  onError(listener: (message: string) => void): () => void;
  dispose(): void;
}

function baseSnapshot(currentVersion: string, enabled: boolean): AppUpdateSnapshot {
  return {
    state: enabled ? 'idle' : 'disabled', currentVersion, availableVersion: null,
    progressPercent: null, transferredBytes: null, totalBytes: null,
    installOnNextQuit: false, messageCode: enabled ? null : 'UPDATE_DISABLED'
  };
}

export class AppUpdateService {
  private value: AppUpdateSnapshot;
  private readonly unsubscribers: Array<() => void> = [];
  private checkFlight: Promise<AppUpdateSnapshot> | null = null;
  private downloadFlight: Promise<AppUpdateSnapshot> | null = null;

  constructor(private readonly adapter: AppUpdateAdapter | null, currentVersion: string) {
    this.value = baseSnapshot(currentVersion, adapter !== null);
    if (adapter) {
      this.unsubscribers.push(
        adapter.onProgress((progress) => {
          this.value = {
            ...this.value,
            state: 'downloading',
            progressPercent: Math.max(0, Math.min(100, Number.isFinite(progress.percent) ? progress.percent : 0)),
            transferredBytes: Math.max(0, Math.trunc(progress.transferred)),
            totalBytes: Math.max(0, Math.trunc(progress.total)),
            messageCode: null
          };
        }),
        adapter.onDownloaded((version) => {
          const total = this.value.totalBytes;
          this.value = {
            ...this.value,
            state: 'downloaded',
            availableVersion: version || this.value.availableVersion,
            progressPercent: 100,
            transferredBytes: total,
            installOnNextQuit: true,
            messageCode: null
          };
        }),
        adapter.onError(() => {
          this.value = { ...this.value, state: 'error', messageCode: 'UPDATE_INTERNAL_ERROR' };
        })
      );
    }
  }

  snapshot(): AppUpdateSnapshot { return { ...this.value }; }

  async check(): Promise<AppUpdateSnapshot> {
    if (!this.adapter) return this.snapshot();
    if (this.checkFlight) return this.checkFlight;
    const flight = (async () => {
      this.value = {
        ...this.value, state: 'checking', availableVersion: null,
        progressPercent: null, transferredBytes: null, totalBytes: null,
        installOnNextQuit: false, messageCode: null
      };
      try {
        const result = await this.adapter!.checkForUpdates();
        this.value = {
          ...this.value,
          state: result.availableVersion ? 'available' : 'up-to-date',
          availableVersion: result.availableVersion,
          messageCode: null
        };
      } catch {
        this.value = { ...this.value, state: 'error', messageCode: 'UPDATE_CHECK_FAILED' };
      }
      return this.snapshot();
    })();
    this.checkFlight = flight;
    try { return await flight; }
    finally { if (this.checkFlight === flight) this.checkFlight = null; }
  }

  async download(): Promise<AppUpdateSnapshot> {
    if (!this.adapter) return this.snapshot();
    if (this.downloadFlight) return this.downloadFlight;
    if (!this.value.availableVersion || !['available', 'error'].includes(this.value.state)) return this.snapshot();
    const flight = (async () => {
      this.value = {
        ...this.value, state: 'downloading', progressPercent: 0,
        transferredBytes: 0, totalBytes: null, installOnNextQuit: false, messageCode: null
      };
      try {
        await this.adapter!.downloadUpdate();
        if (this.value.state === 'downloading') {
          this.value = {
            ...this.value, state: 'downloaded', progressPercent: 100,
            transferredBytes: this.value.totalBytes, installOnNextQuit: true, messageCode: null
          };
        }
      } catch {
        this.value = { ...this.value, state: 'error', messageCode: 'UPDATE_DOWNLOAD_FAILED' };
      }
      return this.snapshot();
    })();
    this.downloadFlight = flight;
    try { return await flight; }
    finally { if (this.downloadFlight === flight) this.downloadFlight = null; }
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers.splice(0)) {
      try { unsubscribe(); } catch { /* best effort */ }
    }
    this.adapter?.dispose();
  }
}
