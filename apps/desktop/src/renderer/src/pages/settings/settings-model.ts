import type { AppSettings, UpdateAppSettings } from '@icrlogin/shared';

export function buildSettingsPatch(saved: AppSettings, draft: AppSettings): UpdateAppSettings {
  const patch: UpdateAppSettings = {};
  if (saved.launchAtLogin !== draft.launchAtLogin) patch.launchAtLogin = draft.launchAtLogin;
  if (saved.closeBehavior !== draft.closeBehavior) patch.closeBehavior = draft.closeBehavior;
  if (saved.localApiPort !== draft.localApiPort) patch.localApiPort = draft.localApiPort;
  return patch;
}

export function settingsDraftRequiresRestart(saved: AppSettings, draft: AppSettings): boolean {
  return saved.localApiPort !== draft.localApiPort;
}
