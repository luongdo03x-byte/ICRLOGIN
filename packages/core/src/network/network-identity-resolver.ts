import { AppError } from '@icrlogin/shared';
import type { ProxyRuntimeConfig } from '../proxies/proxy-args.js';
import type { NetworkIdentityCacheRecord } from '../repositories/network-identity-cache-repository.js';
import type { GeoIpRecord } from './geoip-service.js';

export interface ResolvedNetworkIdentity extends NetworkIdentityCacheRecord {
  stale: boolean;
}

export interface NetworkIdentityCacheLike {
  get(routeKey: string): NetworkIdentityCacheRecord | null;
  upsert(record: NetworkIdentityCacheRecord): NetworkIdentityCacheRecord;
}

export interface NetworkIdentityResolveOptions {
  allowStaleFallback?: boolean;
  allowUnlocatedIdentity?: boolean;
  now?: () => string;
}

export class NetworkIdentityResolver {
  constructor(
    private readonly egress: { resolve(proxy: ProxyRuntimeConfig | null): Promise<{ publicIp: string }> },
    private readonly geoip: { lookup(ip: string): Promise<GeoIpRecord> },
    private readonly cache: NetworkIdentityCacheLike
  ) {}

  async resolve(
    routeKey: string,
    proxy: ProxyRuntimeConfig | null,
    options: NetworkIdentityResolveOptions = {}
  ): Promise<ResolvedNetworkIdentity> {
    const now = options.now ?? (() => new Date().toISOString());
    const allowStale = options.allowStaleFallback ?? true;
    let publicIp: string;
    try {
      publicIp = (await this.egress.resolve(proxy)).publicIp;
    } catch (error) {
      if (error instanceof AppError && error.code === 'PROXY_CONNECTION_FAILED') throw error;
      if (proxy) {
        try {
          await this.egress.resolve(null);
          throw new AppError('PROXY_CONNECTION_FAILED', 'Proxy route cannot resolve public egress IP');
        } catch (directError) {
          if (directError instanceof AppError && directError.code === 'PROXY_CONNECTION_FAILED') throw directError;
        }
      }
      const cached = allowStale ? this.cache.get(routeKey) : null;
      if (cached) return { ...cached, stale: true };
      if (error instanceof AppError) throw error;
      throw new AppError('EGRESS_IP_RESOLUTION_FAILED', 'Unable to resolve public egress IP');
    }

    try {
      const geo = await this.geoip.lookup(publicIp);
      const record: NetworkIdentityCacheRecord = {
        routeKey,
        publicIp,
        countryIso: geo.countryIso,
        cityName: geo.cityName,
        timezone: geo.timezone,
        latitude: geo.latitude,
        longitude: geo.longitude,
        accuracy: geo.accuracy,
        resolvedAt: now(),
        sourceDbVersion: geo.sourceDbVersion
      };
      this.cache.upsert(record);
      return { ...record, stale: false };
    } catch (error) {
      const cached = allowStale ? this.cache.get(routeKey) : null;
      if (cached && cached.publicIp === publicIp) return { ...cached, stale: true };
      if (options.allowUnlocatedIdentity) {
        return {
          routeKey,
          publicIp,
          countryIso: null,
          cityName: null,
          timezone: null,
          latitude: null,
          longitude: null,
          accuracy: null,
          resolvedAt: now(),
          sourceDbVersion: null,
          stale: false
        };
      }
      if (error instanceof AppError) throw error;
      throw new AppError('GEOIP_LOOKUP_FAILED', 'Unable to resolve GeoIP data for public egress IP');
    }
  }
}
