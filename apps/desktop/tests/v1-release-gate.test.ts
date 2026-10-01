import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '../../..');

describe('V1 release gate', () => {
  it('requires parity, tests, real Chromium, packaged smoke and signing before publish', async () => {
    const workflow = await readFile(join(root, '.github/workflows/release.yml'), 'utf8');
    const required = [
      'npm run verify:release-parity',
      'npm run typecheck',
      'npm test',
      'npm run lint',
      'npm run test:integration:chromium',
      'npm run package:dir',
      'npm run test:desktop:packaged',
      'WIN_CSC_LINK',
      'WIN_CSC_KEY_PASSWORD',
      'package:release',
      'Get-AuthenticodeSignature',
      'gh release create'
    ];
    for (const value of required) expect(workflow).toContain(value);

    const parity = workflow.indexOf('npm run verify:release-parity');
    const signing = workflow.indexOf('Build signed NSIS release');
    const publish = workflow.indexOf('Publish GitHub Release');
    expect(parity).toBeGreaterThan(-1);
    expect(signing).toBeGreaterThan(parity);
    expect(publish).toBeGreaterThan(signing);
  });

  it('wires the root release parity verifier', async () => {
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as any;
    expect(pkg.scripts['verify:release-parity']).toBe('node tools/verify-release-parity.mjs');
    const verifier = await readFile(join(root, 'tools/verify-release-parity.mjs'), 'utf8');
    expect(verifier).toContain('LOCAL_API_VERSION');
    expect(verifier).toContain('CURRENT_DB_SCHEMA_VERSION');
    expect(verifier).toContain('BACKUP_FORMAT_VERSION');
  });
});
