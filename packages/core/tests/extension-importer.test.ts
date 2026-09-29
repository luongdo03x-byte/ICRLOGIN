import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAppPaths, ensureAppPaths } from '../src/app-paths.js';
import { parseCrxHeader } from '../src/extensions/crx-reader.js';
import { ExtensionImporter, safeExtensionRelativePath, validateExtensionManifest } from '../src/extensions/extension-importer.js';
import { createTempRoot, removeTempRoot } from './helpers/temp-root.js';

function crx(version: 2 | 3): Buffer {
  const header = Buffer.alloc(version === 2 ? 16 : 12);
  header.write('Cr24', 0, 'ascii');
  header.writeUInt32LE(version, 4);
  if (version === 2) {
    header.writeUInt32LE(0, 8);
    header.writeUInt32LE(0, 12);
  } else {
    header.writeUInt32LE(0, 8);
  }
  return Buffer.concat([header, Buffer.from('PK\x03\x04fixture', 'binary')]);
}

describe('ExtensionImporter', () => {
  it('parses CRX2/CRX3 offsets and rejects malformed headers and unsafe archive paths', () => {
    expect(parseCrxHeader(crx(2).subarray(0, 16), crx(2).length).zipOffset).toBe(16);
    expect(parseCrxHeader(crx(3).subarray(0, 12), crx(3).length).zipOffset).toBe(12);
    expect(() => parseCrxHeader(Buffer.from('bad'), 3)).toThrow();
    for (const path of ['../evil', '/absolute', 'C:/absolute', 'a/../../b', 'bad\0path']) {
      expect(() => safeExtensionRelativePath(path)).toThrow();
    }
    expect(safeExtensionRelativePath('dir/file.js')).toEqual(['dir', 'file.js']);
  });

  it('validates manifest name/version and imports an unpacked extension into managed storage', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const source = join(root, 'source-extension');
      await mkdir(source);
      await writeFile(join(source, 'manifest.json'), JSON.stringify({ name: ' Local Ext ', version: '1.2.3', manifest_version: 3 }), 'utf8');
      expect(validateExtensionManifest({ name: 'Ext', version: '1.0', manifest_version: 2 })).toEqual({ name: 'Ext', version: '1.0' });
      expect(() => validateExtensionManifest({ name: '', version: '1', manifest_version: 3 })).toThrow();
      expect(() => validateExtensionManifest({ name: 'Ext', version: 'bad', manifest_version: 3 })).toThrow();

      const importer = new ExtensionImporter(paths, () => 'ext1');
      const result = await importer.importUnpacked(source);
      expect(result).toMatchObject({ id: 'ext1', name: 'Local Ext', version: '1.2.3', sourceType: 'unpacked' });
      expect(JSON.parse(await readFile(join(result.sourcePath, 'manifest.json'), 'utf8')).name).toBe(' Local Ext ');
    } finally { await removeTempRoot(root); }
  });

  it.each([2, 3] as const)('imports CRX%s payload through safe extractor and cleans temp files', async (version) => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const source = join(root, `fixture-${version}.crx`);
      await writeFile(source, crx(version));
      const importer = new ExtensionImporter(paths, () => `crx${version}`, async (zipPath, destination) => {
        expect((await readFile(zipPath)).subarray(0, 2).toString()).toBe('PK');
        await writeFile(join(destination, 'manifest.json'), JSON.stringify({ name: `CRX ${version}`, version: '2.0', manifest_version: 3 }), 'utf8');
      });
      const result = await importer.importCrx(source);
      expect(result.sourceType).toBe('crx');
      expect(result.name).toBe(`CRX ${version}`);
      expect(await readdir(paths.downloadsTempDir)).toEqual([]);
    } finally { await removeTempRoot(root); }
  });

  it('cleans staging when extraction or manifest validation fails', async () => {
    const root = await createTempRoot();
    try {
      const paths = createAppPaths(root);
      await ensureAppPaths(paths);
      const source = join(root, 'bad.crx');
      await writeFile(source, crx(3));
      const importer = new ExtensionImporter(paths, () => 'badext', async () => { throw new Error('extract failed'); });
      await expect(importer.importCrx(source)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
      expect((await readdir(paths.extensionsDir)).some((name) => name.includes('badext'))).toBe(false);
    } finally { await removeTempRoot(root); }
  });
});
