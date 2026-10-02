import { describe, expect, it } from 'vitest';
import type { ProfileLaunchProgress } from '@icrlogin/shared';
import { isProfileLaunchActive, profileLaunchProgressLabel } from '../../src/renderer/src/pages/profiles/profiles-model.js';

const progress = (overrides: Partial<ProfileLaunchProgress> = {}): ProfileLaunchProgress => ({
  profileId: 'p1', stage: 'downloading-browser', percent: 42.4, receivedBytes: 42, totalBytes: 100,
  staleNetworkIdentity: false, message: null, ...overrides
});

describe('profile runtime progress model', () => {
  it('renders semantic stage, rounded percent, and stale cache state', () => {
    expect(profileLaunchProgressLabel(progress())).toBe('Downloading Chromium… 42%');
    expect(profileLaunchProgressLabel(progress({ stage: 'resolving-geo', percent: null, staleNetworkIdentity: true }))).toBe('Resolving GeoIP… · Geo cache');
  });

  it('locks only active launch stages and releases on running/failed/idle', () => {
    expect(isProfileLaunchActive(progress({ stage: 'launching' }))).toBe(true);
    expect(isProfileLaunchActive(progress({ stage: 'running' }))).toBe(false);
    expect(isProfileLaunchActive(progress({ stage: 'failed' }))).toBe(false);
    expect(isProfileLaunchActive(progress({ stage: 'idle' }))).toBe(false);
    expect(isProfileLaunchActive(undefined)).toBe(false);
  });
});
