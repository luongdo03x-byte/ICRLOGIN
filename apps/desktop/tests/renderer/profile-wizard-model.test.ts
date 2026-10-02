import { describe, expect, it } from 'vitest';
import {
  buildProfileInput,
  errorsForProfileStep,
  isBrowserVersionLocked,
  parseStartupUrls,
  validateProfileDraft,
  type ProfileDraft
} from '../../src/renderer/src/pages/profiles/profile-wizard-model.js';

const draft: ProfileDraft = {
  name: ' Demo ', description: '', browserVersion: '143', groupId: '', proxyId: '', userAgent: '',
  language: 'en-US', timezone: 'UTC', environmentMode: 'auto', latitude: '', longitude: '', accuracy: '',
  windowWidth: '1280', windowHeight: '800', screenWidth: '1920', screenHeight: '1080',
  webrtcEnabled: true, geolocationMode: 'ask', startupUrlsText: ' https://example.com\n\nhttp://localhost:3000 '
};

describe('profile wizard model', () => {
  it('parses only trimmed HTTP/HTTPS startup URLs', () => {
    expect(parseStartupUrls(draft.startupUrlsText)).toEqual(['https://example.com', 'http://localhost:3000']);
    expect(() => parseStartupUrls('ftp://example.com')).toThrow();
    expect(() => parseStartupUrls('not-a-url')).toThrow();
  });

  it('validates dimensions/name/browser and locks browser version for any non-stopped runtime', () => {
    expect(validateProfileDraft(draft, { originalBrowserVersion: '143', browserVersionLocked: true })).toEqual([]);
    expect(validateProfileDraft({ ...draft, browserVersion: '144' }, { originalBrowserVersion: '143', browserVersionLocked: true }).includes('browserVersion')).toBe(true);
    expect(validateProfileDraft({ ...draft, windowWidth: '0' }, { browserVersionLocked: false }).includes('windowWidth')).toBe(true);
    expect(isBrowserVersionLocked('stopped')).toBe(false);
    for (const state of ['starting', 'running', 'stopping', 'crashed', 'error']) expect(isBrowserVersionLocked(state)).toBe(true);
  });

  it('requires timezone and valid coordinates only in manual environment mode', () => {
    expect(validateProfileDraft(draft, { browserVersionLocked: false })).toEqual([]);
    const manual = { ...draft, environmentMode: 'manual' as const, timezone: '', latitude: '91', longitude: '181', accuracy: '-1' };
    expect(validateProfileDraft(manual, { browserVersionLocked: false })).toEqual(expect.arrayContaining(['timezone', 'latitude', 'longitude', 'accuracy']));
  });

  it('blocks Next on errors owned by the current wizard step', () => {
    expect(errorsForProfileStep({ ...draft, name: '' }, 0, { browserVersionLocked: false })).toEqual(['name']);
    expect(errorsForProfileStep({ ...draft, startupUrlsText: 'ftp://bad' }, 2, { browserVersionLocked: false })).toEqual([]);
    expect(errorsForProfileStep({ ...draft, startupUrlsText: 'ftp://bad' }, 3, { browserVersionLocked: false })).toEqual(['startupUrls']);
  });

  it('normalizes auto environment fields for IPC input', () => {
    expect(buildProfileInput(draft)).toEqual({
      name: 'Demo', description: null, browserVersion: '143', groupId: null, proxyId: null, userAgent: null,
      language: 'en-US', timezone: 'UTC', environmentMode: 'auto', latitude: null, longitude: null, accuracy: null,
      windowWidth: 1280, windowHeight: 800, screenWidth: 1920, screenHeight: 1080,
      webrtcEnabled: true, geolocationMode: 'ask', startupUrls: ['https://example.com', 'http://localhost:3000']
    });
  });

  it('preserves manual timezone and numeric coordinates for IPC input', () => {
    const input = buildProfileInput({ ...draft, environmentMode: 'manual', timezone: 'Asia/Bangkok', latitude: '21.0285', longitude: '105.8542', accuracy: '30' });
    expect(input.environmentMode).toBe('manual');
    expect(input.timezone).toBe('Asia/Bangkok');
    expect(input.latitude).toBe(21.0285);
    expect(input.longitude).toBe(105.8542);
    expect(input.accuracy).toBe(30);
  });
});
