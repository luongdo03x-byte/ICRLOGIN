import type { GeolocationMode } from './profile.js';

export interface EffectiveEnvironmentDiagnostics {
  publicIp: string | null;
  networkIdentityStale: boolean;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  language: string;
  userAgent: string | null;
  windowWidth: number;
  windowHeight: number;
  screenWidth: number;
  screenHeight: number;
  geolocationMode: GeolocationMode;
  protectWebRtc: boolean;
}

export type GeoIpUpdateState = 'current' | 'updated' | 'failed' | 'credentials-missing' | 'unknown';

export interface GeoIpStatus {
  installed: boolean;
  credentialConfigured: boolean;
  lastModifiedAt: string | null;
  updateState: GeoIpUpdateState;
}
