import type { Profile } from '@icrlogin/shared';
import type { ResolvedNetworkIdentity } from '../network/network-identity-resolver.js';

export interface EffectiveRuntimeEnvironment {
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
  geolocationMode: 'allow' | 'ask' | 'block';
  protectWebRtc: boolean;
}

export class RuntimeEnvironmentResolver {
  resolve(profile: Profile, networkIdentity: ResolvedNetworkIdentity | null): EffectiveRuntimeEnvironment {
    const auto = profile.environmentMode === 'auto';
    return {
      publicIp: networkIdentity?.publicIp ?? null,
      networkIdentityStale: networkIdentity?.stale ?? false,
      timezone: auto ? networkIdentity?.timezone ?? profile.timezone : profile.timezone,
      latitude: auto ? networkIdentity?.latitude ?? null : profile.latitude,
      longitude: auto ? networkIdentity?.longitude ?? null : profile.longitude,
      accuracy: auto ? networkIdentity?.accuracy ?? null : profile.accuracy,
      language: profile.language,
      userAgent: profile.userAgent,
      windowWidth: profile.windowWidth,
      windowHeight: profile.windowHeight,
      screenWidth: profile.screenWidth,
      screenHeight: profile.screenHeight,
      geolocationMode: profile.geolocationMode,
      protectWebRtc: !profile.webrtcEnabled
    };
  }
}
