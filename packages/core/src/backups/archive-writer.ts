import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import * as yazl from 'yazl';
import { BackupManifestSchema, type BackupManifest, type BackupManifestEntry, type BackupMode } from '@icrlogin/shared';
import { assertSafeArchivePath, computePayloadChecksum, hashFile } from './archive-safety.js';

export type BackupArchiveInputEntry =
  | { archivePath: string; sourcePath: string; data?: never }
  | { archivePath: string; data: Uint8Array; sourcePath?: never };

export interface BackupManifestBase {
  formatVersion: 1;
  mode: BackupMode;
  createdAt: string;
  appVersion: string;
  profileId: string;
  browserVersion: string;
}

function hashData(data: Uint8Array): { sha256: string; byteLength: number } {
  return { sha256: createHash('sha256').update(data).digest('hex'), byteLength: data.byteLength };
}

export class BackupArchiveWriter {
  async write(destination: string, entries: readonly BackupArchiveInputEntry[], base: BackupManifestBase): Promise<{ checksum: string; manifest: BackupManifest }> {
    const seen = new Set<string>();
    const normalized: Array<{ input: BackupArchiveInputEntry; path: string; digest: { sha256: string; byteLength: number } }> = [];

    for (const input of entries) {
      const path = assertSafeArchivePath(input.archivePath);
      if (path === 'manifest.json') throw new Error('manifest.json is reserved');
      if (seen.has(path)) throw new Error(`Duplicate backup entry: ${path}`);
      seen.add(path);
      const digest = 'sourcePath' in input ? await hashFile(input.sourcePath) : hashData(input.data);
      normalized.push({ input, path, digest });
    }

    normalized.sort((a, b) => a.path.localeCompare(b.path));
    const manifestEntries: BackupManifestEntry[] = normalized.map(({ path, digest }) => ({ path, ...digest }));
    const checksum = computePayloadChecksum(manifestEntries);
    const manifest = BackupManifestSchema.parse({ ...base, payloadChecksum: checksum, entries: manifestEntries }) as BackupManifest;

    await mkdir(dirname(destination), { recursive: true });
    const zip = new yazl.ZipFile();
    const outputPromise = pipeline(zip.outputStream, createWriteStream(destination, { flags: 'wx' }));
    for (const entry of normalized) {
      if ('sourcePath' in entry.input) zip.addFile(entry.input.sourcePath, entry.path);
      else zip.addBuffer(Buffer.from(entry.input.data), entry.path);
    }
    zip.addBuffer(Buffer.from(JSON.stringify(manifest), 'utf8'), 'manifest.json');
    zip.end();
    await outputPromise;
    return { checksum, manifest };
  }
}
