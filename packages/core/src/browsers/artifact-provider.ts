import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { AppError, BrowserManifestSchema, type BrowserManifest } from '@icrlogin/shared';

export interface BrowserArtifactProvider {
  getManifest(): Promise<BrowserManifest>;
}

export interface InstalledBrowser {
  version: string;
  executablePath: string;
  sha256: string;
  artifactSize: number;
  installedAt: string;
}

export interface BrowserDownloadProgress {
  receivedBytes: number;
  totalBytes: number | null;
  percent: number | null;
}

export type BrowserDownloadProgressCallback = (progress: BrowserDownloadProgress) => void;
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

function parseManifest(value: unknown): BrowserManifest {
  return BrowserManifestSchema.parse(value) as BrowserManifest;
}

async function writeManifestCache(cachePath: string, manifest: BrowserManifest): Promise<void> {
  await mkdir(dirname(cachePath), { recursive: true });
  const tempPath = `${cachePath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  try {
    await rename(tempPath, cachePath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

export class InMemoryBrowserArtifactProvider implements BrowserArtifactProvider {
  constructor(private readonly value: unknown) {}

  async getManifest(): Promise<BrowserManifest> {
    return parseManifest(this.value);
  }
}

export class JsonFileBrowserArtifactProvider implements BrowserArtifactProvider {
  constructor(private readonly manifestPath: string) {}

  async getManifest(): Promise<BrowserManifest> {
    const text = await readFile(this.manifestPath, 'utf8');
    return parseManifest(JSON.parse(text) as unknown);
  }
}

export class HttpBrowserArtifactProvider implements BrowserArtifactProvider {
  constructor(
    private readonly manifestUrl: string,
    private readonly cachePath: string,
    private readonly fetcher: FetchLike = fetch
  ) {}

  async getManifest(): Promise<BrowserManifest> {
    try {
      const response = await this.fetcher(this.manifestUrl);
      if (!response.ok) throw new Error(`Manifest request failed with HTTP ${response.status}`);
      const manifest = parseManifest(await response.json());
      await writeManifestCache(this.cachePath, manifest);
      return manifest;
    } catch (remoteError) {
      try {
        const cached = await readFile(this.cachePath, 'utf8');
        return parseManifest(JSON.parse(cached) as unknown);
      } catch (cacheError) {
        throw new AppError('BROWSER_DOWNLOAD_FAILED', 'Browser manifest is unavailable', {
          remote: remoteError instanceof Error ? remoteError.message : String(remoteError),
          cache: cacheError instanceof Error ? cacheError.message : String(cacheError)
        });
      }
    }
  }
}
