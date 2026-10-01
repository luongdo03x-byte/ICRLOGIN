import type { ApiEnvelope } from './desktop-api.js';
import type { IcrDesktopApiV7 } from './desktop-phase7.js';
import type { AppUpdateSnapshot } from './app-update.js';

export const PHASE8_DESKTOP_CHANNELS = {
  updateStatus: 'icr:updates:status',
  updateCheck: 'icr:updates:check',
  updateDownload: 'icr:updates:download'
} as const;

export interface IcrPhase8DesktopApi {
  updates: {
    status(): Promise<ApiEnvelope<AppUpdateSnapshot>>;
    check(): Promise<ApiEnvelope<AppUpdateSnapshot>>;
    download(): Promise<ApiEnvelope<AppUpdateSnapshot>>;
  };
}

export type IcrDesktopApiV8 = IcrDesktopApiV7 & IcrPhase8DesktopApi;
