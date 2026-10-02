import type { ApiEnvelope, DesktopRuntimeSummary } from './desktop-api.js';
import type { ProfileLaunchProgress } from './launch-progress.js';
import type { EffectiveEnvironmentDiagnostics, GeoIpStatus } from './runtime-diagnostics.js';

export const RUNTIME_DESKTOP_CHANNELS = {
  profileStart: 'icr:profiles:start-runtime',
  profileLaunchProgress: 'icr:profiles:launch-progress',
  profileRuntimeDiagnostics: 'icr:profiles:runtime-diagnostics',
  geoIpStatus: 'icr:geoip:status',
  geoIpSetLicenseKey: 'icr:geoip:set-license-key',
  geoIpUpdate: 'icr:geoip:update'
} as const;

export interface IcrRuntimeDesktopApi {
  runtime: {
    start(profileId: string): Promise<ApiEnvelope<DesktopRuntimeSummary>>;
    diagnostics(profileId: string): Promise<ApiEnvelope<EffectiveEnvironmentDiagnostics | null>>;
    onLaunchProgress(listener: (progress: ProfileLaunchProgress) => void): () => void;
  };
  geoIp: {
    status(): Promise<ApiEnvelope<GeoIpStatus>>;
    setLicenseKey(licenseKey: string): Promise<ApiEnvelope<GeoIpStatus>>;
    update(): Promise<ApiEnvelope<GeoIpStatus>>;
  };
}
