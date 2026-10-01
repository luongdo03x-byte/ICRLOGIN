import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('renderer CSP', () => {
  it('keeps scripts local and blocks object/frame injection', async () => {
    const html = await readFile(join(import.meta.dirname, '../src/renderer/index.html'), 'utf8');
    const normalized = html.replace(/\s+/g, ' ');
    expect(normalized).toContain("default-src 'self'");
    expect(normalized).toContain("script-src 'self'");
    expect(normalized).not.toContain("'unsafe-eval'");
    expect(normalized).toContain("object-src 'none'");
    expect(normalized).toContain("frame-ancestors 'none'");
    expect(normalized).toContain("base-uri 'none'");
    expect(normalized).toContain("connect-src 'self' ws://localhost:* ws://127.0.0.1:*");
  });
});
