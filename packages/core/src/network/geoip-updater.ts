import { createWriteStream } from 'node:fs';
import { access, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import type { AppPaths } from '../app-paths.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CADENCE_MS = 7 * DAY_MS;

export type GeoIpUpdateStatus = 'current' | 'updated' | 'failed' | 'credentials-missing';

export interface GeoIpUpdateResult {
  status: GeoIpUpdateStatus;
  dbPath: string;
  error?: string;
}

export interface GeoIpUpdaterOptions {
  licenseKey: () => Promise<string | null>;
  now?: () => number;
  cadenceMs?: number;
  download?: (url: string) => Promise<Uint8Array>;
  extract?: (archivePath: string, destinationPath: string) => Promise<void>;
}

async function defaultDownload(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`GeoLite2 download failed: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) reject(error ?? new Error('Unable to open GeoLite2 archive'));
      else resolve(zip);
    });
  });
}

async function defaultExtract(archivePath: string, destinationPath: string): Promise<void> {
  const zip = await openZip(archivePath);
  await new Promise<void>((resolve, reject) => {
    let found = false;
    zip.once('error', reject);
    zip.on('entry', (entry) => {
      if (found || !/GeoLite2-City\.mmdb$/i.test(entry.fileName)) {
        zip.readEntry();
        return;
      }
      found = true;
      zip.openReadStream(entry, (error, stream) => {
        if (error || !stream) { reject(error ?? new Error('Unable to read GeoLite2 database')); return; }
        void pipeline(stream, createWriteStream(destinationPath, { flags: 'wx' }))
          .then(() => { zip.close(); resolve(); })
          .catch(reject);
      });
    });
    zip.once('end', () => { if (!found) reject(new Error('GeoLite2 City database missing from archive')); });
    zip.readEntry();
  });
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

export class GeoIpUpdater {
  readonly dbPath: string;
  private readonly archivePath: string;
  private readonly nextDbPath: string;
  private readonly backupDbPath: string;
  private readonly now: () => number;
  private readonly cadenceMs: number;
  private readonly download: (url: string) => Promise<Uint8Array>;
  private readonly extract: (archivePath: string, destinationPath: string) => Promise<void>;

  constructor(private readonly paths: AppPaths, private readonly options: GeoIpUpdaterOptions) {
    this.dbPath = join(paths.geoIpDir, 'GeoLite2-City.mmdb');
    this.archivePath = join(paths.downloadsTempDir, 'geolite2-city.zip');
    this.nextDbPath = join(paths.geoIpDir, '.GeoLite2-City.next.mmdb');
    this.backupDbPath = join(paths.geoIpDir, '.GeoLite2-City.backup.mmdb');
    this.now = options.now ?? (() => Date.now());
    this.cadenceMs = options.cadenceMs ?? DEFAULT_CADENCE_MS;
    this.download = options.download ?? defaultDownload;
    this.extract = options.extract ?? defaultExtract;
  }

  async ensureFresh(): Promise<GeoIpUpdateResult> {
    await mkdir(this.paths.geoIpDir, { recursive: true });
    const activeExists = await exists(this.dbPath);
    if (activeExists) {
      const info = await stat(this.dbPath);
      if (this.now() - info.mtimeMs < this.cadenceMs) return { status: 'current', dbPath: this.dbPath };
    }

    const licenseKey = await this.options.licenseKey();
    if (!licenseKey) return { status: 'credentials-missing', dbPath: this.dbPath };

    await rm(this.archivePath, { force: true });
    await rm(this.nextDbPath, { force: true });
    await rm(this.backupDbPath, { force: true });

    try {
      const url = `https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${encodeURIComponent(licenseKey)}&suffix=zip`;
      await writeFile(this.archivePath, await this.download(url), { flag: 'wx' });
      await this.extract(this.archivePath, this.nextDbPath);
      const next = await stat(this.nextDbPath);
      if (!next.isFile() || next.size <= 0) throw new Error('Downloaded GeoLite2 database is empty');

      if (activeExists) await rename(this.dbPath, this.backupDbPath);
      try {
        await rename(this.nextDbPath, this.dbPath);
      } catch (error) {
        if (activeExists && await exists(this.backupDbPath)) await rename(this.backupDbPath, this.dbPath);
        throw error;
      }
      await rm(this.backupDbPath, { force: true });
      return { status: 'updated', dbPath: this.dbPath };
    } catch (error) {
      return { status: 'failed', dbPath: this.dbPath, error: error instanceof Error ? error.message : 'GeoLite2 update failed' };
    } finally {
      await rm(this.archivePath, { force: true });
      await rm(this.nextDbPath, { force: true });
    }
  }
}
