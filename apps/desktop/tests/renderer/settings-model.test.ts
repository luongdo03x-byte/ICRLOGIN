import { describe, expect, it } from 'vitest';
import type { AppSettings } from '@icrlogin/shared';
import { buildSettingsPatch, settingsDraftRequiresRestart } from '../../src/renderer/src/pages/settings/settings-model.js';

const saved: AppSettings = { schemaVersion: 1, launchAtLogin: false, closeBehavior: 'ask', localApiPort: 9495 };

describe('settings model', () => {
  it('builds a minimal patch from changed public settings', () => {
    expect(buildSettingsPatch(saved, saved)).toEqual({});
    expect(buildSettingsPatch(saved, { ...saved, launchAtLogin: true, closeBehavior: 'quit' })).toEqual({ launchAtLogin: true, closeBehavior: 'quit' });
  });

  it('marks only API port changes as restart-required', () => {
    expect(settingsDraftRequiresRestart(saved, { ...saved, launchAtLogin: true })).toBe(false);
    expect(settingsDraftRequiresRestart(saved, { ...saved, localApiPort: 9555 })).toBe(true);
  });
});
