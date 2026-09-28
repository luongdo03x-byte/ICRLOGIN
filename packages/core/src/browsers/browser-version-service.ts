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

export class BrowserVersionService {
  constructor(
    private readonly provider: BrowserArtifactProvider,
    private readonly repository: BrowserVersionRepository,
    private readonly installer?: BrowserArtifactInstaller
  ) {}

  async listAvailable(): Promise<BrowserManifestEntry[]> {
    return [...(await this.provider.getManifest()).versions];
  }

  listInstalled(): InstalledBrowser[] {
    return this.repository.list();
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

    const entry = await this.findAvailable(version);
    if (!this.installer) throw new AppError('BROWSER_DOWNLOAD_FAILED', `Browser version ${version} cannot be downloaded`);
    const result = await this.installer(entry, onProgress);
    return this.repository.markInstalled(result);
  }

  async ensureInstalled(version: string): Promise<InstalledBrowser> {
    const installed = this.repository.get(version);
    if (installed) return installed;

    const entry = await this.findAvailable(version);
    if (!this.installer) throw new AppError('BROWSER_NOT_INSTALLED', `Browser version ${version} is not installed`);
    const result = await this.installer(entry);
    return this.repository.markInstalled(result);
  }

  private async findAvailable(version: string): Promise<BrowserManifestEntry> {
    const manifest = await this.provider.getManifest();
    const entry = manifest.versions.find((candidate) => candidate.version === version);
    if (!entry) throw new AppError('BROWSER_NOT_INSTALLED', `Browser version ${version} is not available`);
    return entry;
  }
}
