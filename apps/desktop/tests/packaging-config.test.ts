import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const desktopRoot = join(import.meta.dirname, '..');

describe('windows packaging config', () => {
  it('pins ICRLogin to x64 NSIS and keeps managed user data outside the app bundle', async () => {
    const config = await readFile(join(desktopRoot, 'electron-builder.yml'), 'utf8');
    expect(config).toContain('appId: com.icrlogin.desktop');
    expect(config).toContain('productName: ICRLogin');
    expect(config).toContain('target:');
    expect(config).toContain('- nsis');
    expect(config).toContain('- x64');
    expect(config).toContain('oneClick: false');
    expect(config).toContain('perMachine: false');
    expect(config).toContain('ICRLogin-${version}-Setup-${arch}.${ext}');
    for (const forbidden of ['profiles/**', 'browsers/**', 'backups/**', 'trash/**', 'logs/**']) {
      expect(config).not.toContain(forbidden);
    }
  });

  it('declares builder/updater dependencies and packaging scripts', async () => {
    const pkg = JSON.parse(await readFile(join(desktopRoot, 'package.json'), 'utf8')) as any;
    expect(pkg.dependencies['electron-updater']).toMatch(/^\^6\./);
    expect(pkg.devDependencies['electron-builder']).toMatch(/^\^26\./);
    expect(pkg.scripts['package:win']).toContain('electron-builder');
    expect(pkg.scripts['package:dir']).toContain('electron-builder');
  });
});
