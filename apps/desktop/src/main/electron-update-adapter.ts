import { NsisUpdater } from 'electron-updater';
import type { AppUpdateAdapter, AppUpdateProgress } from './app-update-service.js';

interface UpdateInfoLike { version?: unknown; }
interface ProgressInfoLike { percent?: unknown; transferred?: unknown; total?: unknown; }
interface NsisUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  disableWebInstaller: boolean;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  on(event: string, listener: (...args: any[]) => void): unknown;
  once(event: string, listener: (...args: any[]) => void): unknown;
  removeListener(event: string, listener: (...args: any[]) => void): unknown;
}

export interface GenericUpdateOptions { provider: 'generic'; url: string; }
export type NsisUpdaterFactory = (options?: GenericUpdateOptions) => NsisUpdaterLike;

export interface CreateElectronUpdateAdapterOptions {
  isPackaged: boolean;
  feedUrl?: string;
  updaterFactory?: NsisUpdaterFactory;
}

function parseFeedUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function safeVersion(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/.test(trimmed) ? trimmed : null;
}

function safeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function createElectronUpdateAdapter(options: CreateElectronUpdateAdapterOptions): AppUpdateAdapter | null {
  if (!options.isPackaged) return null;

  let publish: GenericUpdateOptions | undefined;
  if (options.feedUrl !== undefined) {
    const feedUrl = parseFeedUrl(options.feedUrl);
    if (!feedUrl) return null;
    publish = { provider: 'generic', url: feedUrl };
  }

  const factory: NsisUpdaterFactory = options.updaterFactory ?? ((feed) => new NsisUpdater(feed as any) as unknown as NsisUpdaterLike);
  const updater = factory(publish);
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;
  updater.allowPrerelease = false;
  updater.disableWebInstaller = true;

  const cleanup = new Set<() => void>();
  const listen = (event: string, listener: (...args: any[]) => void): (() => void) => {
    updater.on(event, listener);
    const remove = () => { updater.removeListener(event, listener); cleanup.delete(remove); };
    cleanup.add(remove);
    return remove;
  };

  return {
    checkForUpdates: () => new Promise((resolve, reject) => {
      let settled = false;
      const removers: Array<() => void> = [];
      const finish = (result: { availableVersion: string | null }) => {
        if (settled) return;
        settled = true;
        for (const remove of removers) remove();
        resolve(result);
      };
      const fail = () => {
        if (settled) return;
        settled = true;
        for (const remove of removers) remove();
        reject(new Error('Update check failed'));
      };
      const addOnce = (event: string, listener: (...args: any[]) => void) => {
        updater.once(event, listener);
        const remove = () => updater.removeListener(event, listener);
        removers.push(remove);
      };
      addOnce('update-available', (info: UpdateInfoLike) => {
        const version = safeVersion(info?.version);
        if (!version) { fail(); return; }
        finish({ availableVersion: version });
      });
      addOnce('update-not-available', () => finish({ availableVersion: null }));
      addOnce('error', fail);
      void updater.checkForUpdates().catch(fail);
    }),
    async downloadUpdate() { await updater.downloadUpdate(); },
    onProgress(listener) {
      return listen('download-progress', (progress: ProgressInfoLike) => {
        const value: AppUpdateProgress = {
          percent: safeNumber(progress?.percent),
          transferred: safeNumber(progress?.transferred),
          total: safeNumber(progress?.total)
        };
        listener(value);
      });
    },
    onDownloaded(listener) {
      return listen('update-downloaded', (info: UpdateInfoLike) => {
        const version = safeVersion(info?.version);
        if (version) listener(version);
      });
    },
    onError(listener) {
      return listen('error', () => listener('UPDATE_ADAPTER_ERROR'));
    },
    dispose() {
      for (const remove of [...cleanup]) {
        try { remove(); } catch { /* best effort */ }
      }
    }
  };
}
