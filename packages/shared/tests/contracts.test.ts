import { describe, expect, it } from 'vitest';
import { APP_ERROR_CODES } from '../src/errors.js';
import { BrowserManifestSchema } from '../src/browser.js';
import { CreateProfileInputSchema } from '../src/profile.js';
import { CreateProxyInputSchema } from '../src/proxy.js';

describe('shared contracts', () => {
  it('accepts a valid profile and rejects an empty name', () => {
    expect(CreateProfileInputSchema.parse({ name: 'QA', browserVersion: '143.0.0' }).name).toBe('QA');
    expect(() => CreateProfileInputSchema.parse({ name: '', browserVersion: '143.0.0' })).toThrow();
  });

  it('accepts only http/https startup URLs', () => {
    expect(CreateProfileInputSchema.parse({ name: 'QA', browserVersion: '143.0.0', startupUrls: ['https://example.test/'] }).startupUrls?.[0]).toBe('https://example.test/');
    expect(() => CreateProfileInputSchema.parse({ name: 'QA', browserVersion: '143.0.0', startupUrls: ['ftp://example.test/file'] })).toThrow();
  });

  it('rejects unsupported proxy protocols', () => {
    expect(() => CreateProxyInputSchema.parse({ name: 'p', type: 'ftp', host: 'x', port: 1 })).toThrow();
  });

  it('accepts a win64 browser manifest', () => {
    const validManifest = {
      schemaVersion: 1,
      platform: 'win64',
      stable: '143.0.0',
      versions: [
        {
          version: '143.0.0',
          url: 'https://example.test/chromium.zip',
          sha256: 'a'.repeat(64),
          size: 123,
          executableRelativePath: 'chrome.exe'
        }
      ]
    };

    expect(BrowserManifestSchema.parse(validManifest).platform).toBe('win64');
  });

  it('publishes stable profile runtime errors', () => {
    expect(APP_ERROR_CODES).toContain('PROFILE_ALREADY_RUNNING');
  });
});
