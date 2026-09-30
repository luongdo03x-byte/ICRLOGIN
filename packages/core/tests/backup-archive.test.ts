import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT_VERSION } from '@icrlogin/shared';
import { BackupArchiveWriter } from '../src/backups/archive-writer.js';
import { BackupArchiveReader } from '../src/backups/archive-reader.js';
import { assertSafeArchivePath, computePayloadChecksum } from '../src/backups/archive-safety.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';
import { writeStoredZip } from './helpers/zip-fixture.js';

const profileId = '123e4567-e89b-42d3-a456-426614174000';
const baseManifest = { formatVersion: BACKUP_FORMAT_VERSION, mode: 'full' as const, createdAt: '2026-09-30T00:00:00.000Z', appVersion: '0.1.0', profileId, browserVersion: '144.0.0' };

describe('backup archive primitives', () => {
  it('normalizes safe paths and computes a deterministic payload checksum independent of input order', () => {
    expect(assertSafeArchivePath('user-data/Default/Cookies')).toBe('user-data/Default/Cookies');
    for (const value of ['', '../evil', '/absolute', 'C:/absolute', 'a/../../b', 'bad\0path', 'a\\..\\b']) {
      expect(() => assertSafeArchivePath(value)).toThrow();
    }
    const a = { path: 'a.txt', sha256: 'a'.repeat(64), byteLength: 1 };
    const b = { path: 'b.txt', sha256: 'b'.repeat(64), byteLength: 2 };
    expect(computePayloadChecksum([a, b])).toBe(computePayloadChecksum([b, a]));
  });

  it('streams file/buffer entries, writes manifest last, and validates round-trip payload hashes', async () => {
    const root = await createTempRoot();
    try {
      const source = join(root, 'sentinel.txt');
      const archive = join(root, 'profile.icrbackup');
      await writeFile(source, 'persistent-session-sentinel', 'utf8');
      const writer = new BackupArchiveWriter();
      const written = await writer.write(archive, [
        { archivePath: 'profile.json', data: Buffer.from('{"name":"QA"}') },
        { archivePath: 'user-data/sentinel.txt', sourcePath: source }
      ], baseManifest);
      expect(written.manifest.entries.map((entry) => entry.path)).toEqual(['profile.json', 'user-data/sentinel.txt']);
      const inspected = await new BackupArchiveReader().inspect(archive);
      expect(inspected.manifest.payloadChecksum).toBe(written.checksum);
      expect(inspected.manifest.entries).toEqual(written.manifest.entries);
    } finally { await removeTempRoot(root); }
  });

  it('rejects duplicate, tampered, unsafe and symlink entries before restore extraction', async () => {
    const root = await createTempRoot();
    try {
      const manifest = JSON.stringify({
        ...baseManifest,
        payloadChecksum: 'a'.repeat(64),
        entries: [{ path: 'profile.json', sha256: 'b'.repeat(64), byteLength: 2 }]
      });
      const tampered = join(root, 'tampered.icrbackup');
      await writeStoredZip(tampered, [{ name: 'profile.json', content: 'x' }, { name: 'manifest.json', content: manifest }]);
      await expect(new BackupArchiveReader().inspect(tampered)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });

      const duplicate = join(root, 'duplicate.icrbackup');
      await writeStoredZip(duplicate, [{ name: 'profile.json', content: 'x' }, { name: 'profile.json', content: 'y' }, { name: 'manifest.json', content: manifest }]);
      await expect(new BackupArchiveReader().inspect(duplicate)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });

      const unsafe = join(root, 'unsafe.icrbackup');
      await writeStoredZip(unsafe, [{ name: '../profile.json', content: 'x' }, { name: 'manifest.json', content: manifest }]);
      await expect(new BackupArchiveReader().inspect(unsafe)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });

      const symlink = join(root, 'symlink.icrbackup');
      await writeStoredZip(symlink, [{ name: 'profile.json', content: 'target', externalFileAttributes: 0o120777 << 16 }, { name: 'manifest.json', content: manifest }]);
      await expect(new BackupArchiveReader().inspect(symlink)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    } finally { await removeTempRoot(root); }
  });
});
