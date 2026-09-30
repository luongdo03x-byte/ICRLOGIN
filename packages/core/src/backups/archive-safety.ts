import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { AppError, type BackupManifestEntry } from '@icrlogin/shared';

function invalid(message: string): AppError { return new AppError('INVALID_REQUEST', message); }

export function assertSafeArchivePath(value: string): string {
  if (!value || value.includes('\0')) throw invalid('Invalid backup archive path');
  const portable = value.replace(/\\/g, '/');
  if (portable.startsWith('/') || /^[A-Za-z]:\//.test(portable)) throw invalid('Backup archive contains an absolute path');
  const parts = portable.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) throw invalid('Backup archive path escapes destination');
  return parts.join('/');
}

export function computePayloadChecksum(entries: readonly BackupManifestEntry[]): string {
  const hash = createHash('sha256');
  for (const entry of [...entries].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(entry.path, 'utf8');
    hash.update('\0');
    hash.update(entry.sha256.toLowerCase(), 'ascii');
    hash.update('\0');
    hash.update(String(entry.byteLength), 'ascii');
    hash.update('\n');
  }
  return hash.digest('hex');
}

export function hashBuffer(data: Uint8Array): BackupManifestEntry {
  return { path: '', sha256: createHash('sha256').update(data).digest('hex'), byteLength: data.byteLength };
}

export async function hashFile(path: string): Promise<{ sha256: string; byteLength: number }> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw invalid('Backup source must be a regular file');
  const hash = createHash('sha256');
  let byteLength = 0;
  for await (const chunk of createReadStream(path)) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteLength += buffer.length;
    hash.update(buffer);
  }
  return { sha256: hash.digest('hex'), byteLength };
}
