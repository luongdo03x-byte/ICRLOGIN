import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AppError, type BrowserManifestEntry } from '@icrlogin/shared';
import type { AppPaths } from '../app-paths.js';
import type {
  BrowserDownloadProgressCallback,
  FetchLike,
  InstalledBrowser
} from './artifact-provider.js';
import { installBrowserArtifact } from './zip-installer.js';

export type BrowserArtifactFileInstaller = (
  entry: BrowserManifestEntry,
  artifactPath: string,
  paths: AppPaths
) => Promise<InstalledBrowser>;

function safeFileSegment(value: string): string {
  return encodeURIComponent(value).replace(/%/g, '_');
}

function parseContentLength(response: Response, fallback: number): number | null {
  const raw = response.headers.get('content-length');
  if (raw !== null) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback > 0 ? fallback : null;
}

export class BrowserDownloadInstaller {
  constructor(
    private readonly paths: AppPaths,
    private readonly fetcher: FetchLike = fetch,
    private readonly artifactInstaller: BrowserArtifactFileInstaller = installBrowserArtifact
  ) {}

  async install(
    entry: BrowserManifestEntry,
    onProgress?: BrowserDownloadProgressCallback
  ): Promise<InstalledBrowser> {
    await mkdir(this.paths.downloadsTempDir, { recursive: true });
    const tempPath = join(
      this.paths.downloadsTempDir,
      `browser-${safeFileSegment(entry.version)}-${randomUUID()}.zip.part`
    );

    try {
      const response = await this.fetcher(entry.url);
      if (!response.ok || !response.body) {
        throw new AppError('BROWSER_DOWNLOAD_FAILED', `Browser download failed with HTTP ${response.status}`);
      }

      const totalBytes = parseContentLength(response, entry.size);
      let receivedBytes = 0;
      const progress = new Transform({
        transform(
          chunk: Uint8Array,
          _encoding: string,
          callback: (error?: Error | null, data?: Uint8Array) => void
        ) {
          receivedBytes += chunk.length;
          onProgress?.({
            receivedBytes,
            totalBytes,
            percent: totalBytes === null ? null : Math.min(100, (receivedBytes / totalBytes) * 100)
          });
          callback(null, chunk);
        }
      });

      await pipeline(
        Readable.fromWeb(response.body as any),
        progress,
        createWriteStream(tempPath, { flags: 'wx' })
      );

      return await this.artifactInstaller(entry, tempPath, this.paths);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'BROWSER_DOWNLOAD_FAILED',
        error instanceof Error ? error.message : 'Browser download failed'
      );
    } finally {
      await rm(tempPath, { force: true });
    }
  }
}
