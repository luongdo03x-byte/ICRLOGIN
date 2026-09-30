import type { ApiEnvelope } from './desktop-api.js';

export const PHASE6_DESKTOP_CHANNELS = {
  monitoringSnapshot: 'icr:monitoring:snapshot',
  recoveryStatus: 'icr:recovery:status'
} as const;

export interface ProcessMetricPublic {
  profileId: string;
  pid: number;
  cpuPercent: number | null;
  workingSetBytes: number | null;
  sampleAt: string;
  status: 'available' | 'unavailable';
}

export interface StartupRecoveryPublic {
  databaseHealthy: boolean;
  quickCheck: string;
  recoveredEntries: number;
  cleanedEntries: number;
  cleanupErrors: number;
}

export interface IcrPhase6DesktopApi {
  monitoring: {
    snapshot(): Promise<ApiEnvelope<ProcessMetricPublic[]>>;
    recoveryStatus(): Promise<ApiEnvelope<StartupRecoveryPublic>>;
  };
}

export type IcrDesktopApiV6 = import('./desktop-phase5.js').IcrDesktopApiV5 & IcrPhase6DesktopApi;
