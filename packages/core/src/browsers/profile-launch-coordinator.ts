import type { Profile, ProfileLaunchProgress, ProfileLaunchStage } from '@icrlogin/shared';
import type { InstalledBrowser, BrowserDownloadProgress } from './artifact-provider.js';
import type { ProxyRuntimeConfig } from '../proxies/proxy-args.js';
import type { ResolvedNetworkIdentity } from '../network/network-identity-resolver.js';
import type { EffectiveRuntimeEnvironment } from './runtime-environment-resolver.js';
import type { PreparedProxyRuntimeExtension } from '../proxies/proxy-runtime-extension.js';

export type ProfileLaunchProgressPublisher = (event: ProfileLaunchProgress) => void;

export interface PreparedProfileLaunch {
  installedBrowser: InstalledBrowser;
  proxy: ProxyRuntimeConfig | null;
  networkIdentity: ResolvedNetworkIdentity;
  environment: EffectiveRuntimeEnvironment;
  runtimeExtensionPath: string | null;
  cleanupRuntimeExtension(): Promise<void>;
}

interface ProfileLaunchCoordinatorDependencies {
  proxies: { getRuntimeConfig(id: string): Promise<ProxyRuntimeConfig> };
  proxyConnectivity: { test(proxyId: string): Promise<{ reachable: boolean; latencyMs: number }> };
  networkIdentity: { resolve(routeKey: string, proxy: ProxyRuntimeConfig | null): Promise<ResolvedNetworkIdentity> };
  browserVersions: {
    isInstalled(version: string): boolean;
    ensureInstalled(version: string, onProgress?: (progress: BrowserDownloadProgress) => void): Promise<InstalledBrowser>;
  };
  environmentResolver: { resolve(profile: Profile, networkIdentity: ResolvedNetworkIdentity): EffectiveRuntimeEnvironment };
  proxyRuntimeExtension: {
    prepare(profileId: string, proxy: ProxyRuntimeConfig | null, options: { protectWebRtc: boolean }): Promise<PreparedProxyRuntimeExtension>;
  };
  publish?: ProfileLaunchProgressPublisher;
}

export class ProfileLaunchProgressHub {
  private readonly listeners = new Set<ProfileLaunchProgressPublisher>();
  private readonly latest = new Map<string, ProfileLaunchProgress>();

  publish(event: ProfileLaunchProgress): void {
    this.latest.set(event.profileId, event);
    for (const listener of this.listeners) listener(event);
  }

  subscribe(listener: ProfileLaunchProgressPublisher): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get(profileId: string): ProfileLaunchProgress | null {
    return this.latest.get(profileId) ?? null;
  }

  clear(profileId: string): void {
    this.latest.delete(profileId);
  }
}

export class ProfileLaunchCoordinator {
  constructor(private readonly deps: ProfileLaunchCoordinatorDependencies) {}

  publish(
    profileId: string,
    stage: ProfileLaunchStage,
    overrides: Partial<Omit<ProfileLaunchProgress, 'profileId' | 'stage'>> = {}
  ): void {
    this.deps.publish?.({
      profileId,
      stage,
      percent: overrides.percent ?? null,
      receivedBytes: overrides.receivedBytes ?? null,
      totalBytes: overrides.totalBytes ?? null,
      staleNetworkIdentity: overrides.staleNetworkIdentity ?? false,
      message: overrides.message ?? null
    });
  }

  async prepare(profile: Profile): Promise<PreparedProfileLaunch> {
    let runtimeExtension: PreparedProxyRuntimeExtension | null = null;
    try {
      this.publish(profile.id, 'resolving-network');
      const proxy = profile.proxyId ? await this.deps.proxies.getRuntimeConfig(profile.proxyId) : null;
      if (profile.proxyId) await this.deps.proxyConnectivity.test(profile.proxyId);

      this.publish(profile.id, 'resolving-geo');
      const routeKey = proxy ? `proxy:${proxy.id}` : 'direct';
      const networkIdentity = await this.deps.networkIdentity.resolve(routeKey, proxy);

      const alreadyInstalled = this.deps.browserVersions.isInstalled(profile.browserVersion);
      const installedBrowser = await this.deps.browserVersions.ensureInstalled(profile.browserVersion, (progress) => {
        const phase = progress.phase ?? 'downloading';
        const stage: ProfileLaunchStage = phase === 'verifying'
          ? 'verifying-browser'
          : phase === 'installing'
            ? 'installing-browser'
            : 'downloading-browser';
        this.publish(profile.id, stage, {
          percent: progress.percent,
          receivedBytes: progress.receivedBytes,
          totalBytes: progress.totalBytes,
          staleNetworkIdentity: networkIdentity.stale
        });
      });
      if (!alreadyInstalled && this.deps.publish) {
        this.publish(profile.id, 'installing-browser', { percent: 100, staleNetworkIdentity: networkIdentity.stale });
      }

      this.publish(profile.id, 'preparing-runtime', { staleNetworkIdentity: networkIdentity.stale });
      const environment = this.deps.environmentResolver.resolve(profile, networkIdentity);
      runtimeExtension = await this.deps.proxyRuntimeExtension.prepare(profile.id, proxy, {
        protectWebRtc: environment.protectWebRtc
      });

      return {
        installedBrowser,
        proxy,
        networkIdentity,
        environment,
        runtimeExtensionPath: runtimeExtension.extensionPath,
        cleanupRuntimeExtension: runtimeExtension.cleanup
      };
    } catch (error) {
      await runtimeExtension?.cleanup().catch(() => undefined);
      this.publish(profile.id, 'failed', { message: error instanceof Error ? error.message : 'Profile launch failed' });
      throw error;
    }
  }
}
