import { AppError, type BrowserManifestEntry } from '@icrlogin/shared';
import type {
  BrowserArtifactProvider,
  BrowserDownloadProgressCallback,
  InstalledBrowser
} from './artifact-provider.js';
import { BrowserVersionRepository } from '../repositories/browser-version-repository.js';

export type BrowserArtifactInstaller = (
  entry: BrowserManifestEntry,
  onProgress?: BrowserDownloadProgressCallback
) => Promise<InstalledBrowser>;

export type BrowserArtifactUninstaller = (browser: InstalledBrowser) => Promise<void>;

export interface BrowserVersionServiceOptions {
  usageCounter?: (version: string) => number;
  uninstaller?: BrowserArtifactUninstaller;
}

export class BrowserVersionService {
  private readonly installFlights = new Map<string, Promise<InstalledBrowser>>();

  constructor(
    private readonly provider: BrowserArtifactProvider,
    private readonly repository: BrowserVersionRepository,
    private readonly installer?: BrowserArtifactInstaller,
    private readonly options: BrowserVersionServiceOptions = {}
  ) {}

  async listAvailable(): Promise<BrowserManifestEntry[]> {
    return [...(await this.provider.getManifest()).versions];
  }

  listInstalled(): InstalledBrowser[] {
    return this.repository.list();
  }

  getUsageCount(version: string): number {
    return this.options.usageCounter?.(version) ?? 0;
  }

  async getStable(): Promise<BrowserManifestEntry> {
    const manifest = await this.provider.getManifest();
    const stable = manifest.versions.find((entry) => entry.version === manifest.stable);
    if (!stable) throw new AppError('BROWSER_NOT_INSTALLED', `Stable browser ${manifest.stable} is absent from manifest`);
    return stable;
  }

  async download(
    version: string,
    onProgress?: BrowserDownloadProgressCallback
  ): Promise<InstalledBrowser> {
    const installed = this.repository.get(version);
    if (installed) return installed;
    return this.installSingleFlight(version, onProgress, 'BROWSER_DOWNLOAD_FAILED');
  }

  async ensureInstalled(version: string): Promise<InstalledBrowser> {
    const installed = this.repository.get(version);
    if (installed) return installed;
    return this.installSingleFlight(version, undefined, 'BROWSER_NOT_INSTALLED');
  }

  async remove(version: string): Promise<void> {
    const installed = this.repository.get(version);
    if (!installed) return;
    if (this.getUsageCount(version) > 0) {
      throw new AppError('BROWSER_IN_USE', `Browser version ${version} is used by an active profile`);
    }
    if (!this.options.uninstaller) {
      throw new AppError('INTERNAL_ERROR', 'Browser uninstaller is not configured');
    }
    await this.options.uninstaller(installed);
    this.repository.remove(version);
  }

  private async installSingleFlight(
    version: string,
    onProgress: BrowserDownloadProgressCallback | undefined,
    missingInstallerCode: 'BROWSER_DOWNLOAD_FAILED' | 'BROWSER_NOT_INSTALLED'
  ): Promise<InstalledBrowser> {
    const existing = this.installFlights.get(version);
    if (existing) return existing;

    const flight = (async () => {
      const installed = this.repository.get(version);
      if (installed) return installed;
      const entry = await this.findAvailable(version);
      if (!this.installer) throw new AppError(missingInstallerCode, `Browser version ${version} cannot be installed`);
      const result = await this.installer(entry, onProgress);
      return this.repository.markInstalled(result);
    })();

    this.installFlights.set(version, flight);
    try {
      return await flight;
    } finally {
      if (this.installFlights.get(version) === flight) this.installFlights.delete(version);
    }
  }

  private async findAvailable(version: string): Promise<BrowserManifestEntry> {
    const manifest = await this.provider.getManifest();
    const entry = manifest.versions.find((candidate) => candidate.version === version);
    if (!entry) throw new AppError('BROWSER_NOT_INSTALLED', `Browser version ${version} is not available`);
    return entry;
  }
}
