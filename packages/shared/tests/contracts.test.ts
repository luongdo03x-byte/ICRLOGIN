import { describe, expect, it } from 'vitest';
import { APP_ERROR_CODES } from '../src/errors.js';
import { BrowserManifestSchema } from '../src/browser.js';
import { CreateProfileInputSchema } from '../src/profile.js';
import { CreateProxyInputSchema } from '../src/proxy.js';
import { CreateTagInputSchema } from '../src/tag.js';
import { ExtensionSourceTypeSchema } from '../src/extension.js';
import { CloneProfileInputSchema, ProfileTemplateConfigSchema } from '../src/profile-template.js';
import { BulkStartInputSchema } from '../src/bulk.js';
import {
  HttpIdParamsSchema,
  HttpPortSchema,
  HttpVersionParamsSchema,
  httpFail,
  httpOk
} from '../src/http-api.js';

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
      versions: [{ version: '143.0.0', url: 'https://example.test/chromium.zip', sha256: 'a'.repeat(64), size: 123, executableRelativePath: 'chrome.exe' }]
    };
    expect(BrowserManifestSchema.parse(validManifest).platform).toBe('win64');
  });

  it('publishes stable local API envelopes and errors', () => {
    expect(httpOk({ value: 1 })).toEqual({ success: true, data: { value: 1 }, error: null });
    expect(httpFail('RATE_LIMITED', 'slow down')).toEqual({ success: false, data: null, error: { code: 'RATE_LIMITED', message: 'slow down' } });
    for (const code of ['RATE_LIMITED', 'ROUTE_NOT_FOUND', 'METHOD_NOT_ALLOWED', 'BROWSER_IN_USE']) expect(APP_ERROR_CODES).toContain(code);
  });

  it('validates local API id, version, and port parameters', () => {
    expect(HttpIdParamsSchema.parse({ id: '123e4567-e89b-42d3-a456-426614174000' }).id).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(() => HttpIdParamsSchema.parse({ id: 'not-a-uuid' })).toThrow();
    expect(HttpVersionParamsSchema.parse({ version: '143.0.7499.40' }).version).toBe('143.0.7499.40');
    expect(() => HttpVersionParamsSchema.parse({ version: '../../bad' })).toThrow();
    expect(HttpPortSchema.parse(9495)).toBe(9495);
    expect(() => HttpPortSchema.parse(0)).toThrow();
    expect(() => HttpPortSchema.parse(65536)).toThrow();
  });

  it('normalizes tag names and limits extension source types', () => {
    expect(CreateTagInputSchema.parse({ name: '  Social  ' }).name).toBe('Social');
    expect(() => CreateTagInputSchema.parse({ name: '   ' })).toThrow();
    expect(ExtensionSourceTypeSchema.parse('unpacked')).toBe('unpacked');
    expect(ExtensionSourceTypeSchema.parse('crx')).toBe('crx');
    expect(() => ExtensionSourceTypeSchema.parse('remote')).toThrow();
  });

  it('keeps template config strict so secrets and session paths cannot enter it', () => {
    const clean = { browserVersion: '144.0.0', groupId: null, proxyId: null, language: 'en-US', timezone: 'UTC', startupUrls: [] };
    expect(ProfileTemplateConfigSchema.parse(clean).browserVersion).toBe('144.0.0');
    for (const key of ['proxyPassword', 'apiToken', 'userDataDir', 'cookies']) {
      expect(() => ProfileTemplateConfigSchema.parse({ ...clean, [key]: 'secret' })).toThrow();
    }
  });

  it('validates clone mode and bounded bulk start concurrency', () => {
    const id = '123e4567-e89b-42d3-a456-426614174000';
    expect(CloneProfileInputSchema.parse({ sourceId: id, mode: 'config' }).mode).toBe('config');
    expect(BulkStartInputSchema.parse({ ids: [id] }).concurrency).toBe(3);
    expect(() => BulkStartInputSchema.parse({ ids: [id], concurrency: 6 })).toThrow();
  });
});
