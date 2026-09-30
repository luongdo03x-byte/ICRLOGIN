import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import * as yauzl from 'yauzl';
import { AppError, BackupManifestSchema, type BackupManifest, type BackupManifestEntry } from '@icrlogin/shared';
import { assertSafeArchivePath, computePayloadChecksum } from './archive-safety.js';

const MAX_MANIFEST_BYTES = 1024 * 1024;
function invalid(message: string): AppError { return new AppError('INVALID_REQUEST', message); }

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: true }, (error, zipFile) => {
      if (error || !zipFile) reject(invalid('Unable to open backup archive'));
      else resolve(zipFile);
    });
  });
}

function openEntryStream(zipFile: yauzl.ZipFile, entry: yauzl.Entry): Promise<Readable> {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(invalid('Unable to read backup archive entry'));
      else resolve(stream);
    });
  });
}

function entryIsSymlink(entry: yauzl.Entry): boolean {
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return (mode & 0o170000) === 0o120000;
}

async function readSmall(stream: Readable, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const value of stream) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    size += chunk.length;
    if (size > limit) throw invalid('Backup manifest is too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function digestStream(stream: Readable): Promise<{ sha256: string; byteLength: number }> {
  const hash = createHash('sha256');
  let byteLength = 0;
  for await (const value of stream) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    byteLength += chunk.length;
    hash.update(chunk);
  }
  return { sha256: hash.digest('hex'), byteLength };
}

export interface ValidatedBackupArchive {
  manifest: BackupManifest;
  entries: BackupManifestEntry[];
}

export class BackupArchiveReader {
  async inspect(archivePath: string): Promise<ValidatedBackupArchive> {
    const zip = await openZip(archivePath);
    const actualEntries: BackupManifestEntry[] = [];
    const seen = new Set<string>();
    let manifestText: string | null = null;

    return new Promise<ValidatedBackupArchive>((resolve, reject) => {
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        try { zip.close(); } catch { /* noop */ }
        reject(error instanceof AppError ? error : invalid('Invalid backup archive'));
      };

      const finish = () => {
        try {
          if (manifestText === null) throw invalid('Backup manifest is missing');
          let manifest: BackupManifest;
          try { manifest = BackupManifestSchema.parse(JSON.parse(manifestText) as unknown) as BackupManifest; }
          catch { throw invalid('Backup manifest is invalid'); }

          const expected = new Map<string, BackupManifestEntry>();
          for (const entry of manifest.entries) {
            const path = assertSafeArchivePath(entry.path);
            if (expected.has(path)) throw invalid('Backup manifest contains duplicate entries');
            expected.set(path, entry);
          }
          if (expected.size !== actualEntries.length) throw invalid('Backup payload entries do not match manifest');
          for (const actual of actualEntries) {
            const wanted = expected.get(actual.path);
            if (!wanted || wanted.byteLength !== actual.byteLength || wanted.sha256.toLowerCase() !== actual.sha256.toLowerCase()) {
              throw invalid('Backup payload checksum mismatch');
            }
          }
          if (computePayloadChecksum(actualEntries) !== manifest.payloadChecksum.toLowerCase()) throw invalid('Backup payload checksum mismatch');
          settled = true;
          resolve({ manifest, entries: [...actualEntries].sort((a, b) => a.path.localeCompare(b.path)) });
        } catch (error) { fail(error); }
      };

      zip.on('error', fail);
      zip.on('end', finish);
      zip.on('entry', (entry) => {
        void (async () => {
          if (entryIsSymlink(entry)) throw invalid('Backup archive symlinks are not allowed');
          const path = assertSafeArchivePath(entry.fileName);
          if (seen.has(path)) throw invalid('Backup archive contains duplicate entries');
          seen.add(path);
          const stream = await openEntryStream(zip, entry);
          if (path === 'manifest.json') {
            manifestText = (await readSmall(stream, MAX_MANIFEST_BYTES)).toString('utf8');
          } else {
            const digest = await digestStream(stream);
            actualEntries.push({ path, ...digest });
          }
          zip.readEntry();
        })().catch(fail);
      });
      zip.readEntry();
    });
  }
}
