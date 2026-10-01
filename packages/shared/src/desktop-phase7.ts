import type { ApiEnvelope } from './desktop-api.js';
import type { IcrDesktopApiV6 } from './desktop-phase6.js';
import type { AppSettings, UpdateAppSettings } from './settings.js';

export const PHASE7_DESKTOP_CHANNELS = {
  settingsGet: 'icr:settings:get',
  settingsUpdate: 'icr:settings:update',
  browserRemove: 'icr:browsers:remove'
} as const;

export interface DesktopSettingsUpdateResult {
  settings: AppSettings;
  restartRequired: boolean;
}

export interface IcrPhase7DesktopApi {
  settings: {
    get(): Promise<ApiEnvelope<AppSettings>>;
    update(patch: UpdateAppSettings): Promise<ApiEnvelope<DesktopSettingsUpdateResult>>;
  };
  browsers: {
    remove(version: string): Promise<ApiEnvelope<null>>;
  };
}

export type IcrDesktopApiV7 = IcrDesktopApiV6 & IcrPhase7DesktopApi;
