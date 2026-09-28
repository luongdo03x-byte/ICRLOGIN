import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

async function sourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}

describe('renderer security boundary', () => {
  it('contains no direct Node, Electron, repository, filesystem or child-process imports', async () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '../../src/renderer/src');
    const forbidden = [/from\s+['"]node:/, /from\s+['"]electron['"]/, /from\s+['"](?:fs|child_process)['"]/, /\/repositories\//];
    for (const path of await sourceFiles(root)) {
      const source = await readFile(path, 'utf8');
      expect(forbidden.some((pattern) => pattern.test(source))).toBe(false);
    }
  });

  it('ships a renderer CSP that blocks arbitrary scripts and eval', async () => {
    const htmlPath = join(dirname(fileURLToPath(import.meta.url)), '../../src/renderer/index.html');
    const html = await readFile(htmlPath, 'utf8');
    expect(html.includes('Content-Security-Policy')).toBe(true);
    expect(html.includes("script-src 'self'" )).toBe(true);
    expect(html.includes("'unsafe-eval'" )).toBe(false);
  });
});
