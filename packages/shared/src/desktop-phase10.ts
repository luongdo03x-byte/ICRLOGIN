import type { ApiEnvelope } from './desktop-api.js';
import type { IcrDesktopApiV8 } from './desktop-phase8.js';

export const PHASE10_DESKTOP_CHANNELS = {
  aboutGet: 'icr:about:get'
} as const;

export interface AppAboutPublic {
  appVersion: string;
  localApiVersion: number;
  databaseSchemaVersion: number;
  backupFormatVersion: number;
  databaseHealthy: boolean;
  packaged: boolean;
  runtimeReadiness: 'operational' | 'recovery-required';
}

export interface IcrPhase10DesktopApi {
  about: {
    get(): Promise<ApiEnvelope<AppAboutPublic>>;
  };
}

export type IcrDesktopApiV10 = IcrDesktopApiV8 & IcrPhase10DesktopApi;
