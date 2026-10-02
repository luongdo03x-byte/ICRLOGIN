import { access, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { GeoIpUpdater, type AppPaths, type GeoIpUpdateResult } from '@icrlogin/core';
import type { GeoIpStatus } from '@icrlogin/shared';
import { EncryptedMaxMindCredentialStore, type SafeStorageLike } from './secret-store.js';

export class GeoIpRuntimeController {
  private readonly credentials: EncryptedMaxMindCredentialStore;
  private readonly updater: GeoIpUpdater;
  private lastUpdate: GeoIpUpdateResult | null = null;

  constructor(private readonly paths: AppPaths, safeStorage: SafeStorageLike) {
    this.credentials = new EncryptedMaxMindCredentialStore(join(paths.configDir, 'maxmind.enc'), safeStorage);
    this.updater = new GeoIpUpdater(paths, {
      licenseKey: async () => (await this.credentials.read())?.licenseKey ?? null
    });
  }

  async initialize(): Promise<void> {
    this.lastUpdate = await this.updater.ensureFresh();
  }

  async setLicenseKey(licenseKey: string): Promise<GeoIpStatus> {
    await this.credentials.write({ licenseKey });
    this.lastUpdate = await this.updater.ensureFresh(true);
    return this.status();
  }

  async update(): Promise<GeoIpStatus> {
    this.lastUpdate = await this.updater.ensureFresh(true);
    return this.status();
  }

  async status(): Promise<GeoIpStatus> {
    const dbPath = join(this.paths.geoIpDir, 'GeoLite2-City.mmdb');
    let installed = false;
    let lastModifiedAt: string | null = null;
    try {
      await access(dbPath);
      const info = await stat(dbPath);
      installed = info.isFile();
      lastModifiedAt = installed ? info.mtime.toISOString() : null;
    } catch {
      installed = false;
    }
    return {
      installed,
      credentialConfigured: (await this.credentials.read()) !== null,
      lastModifiedAt,
      updateState: this.lastUpdate?.status ?? 'unknown'
    };
  }
}
