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
    try {
      const { publicIp } = await this.egress.resolve(proxy);
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
      if (error instanceof AppError && error.code === 'PROXY_CONNECTION_FAILED') throw error;
      const allowStale = options.allowStaleFallback ?? true;
      const cached = allowStale ? this.cache.get(routeKey) : null;
      if (cached) return { ...cached, stale: true };
      if (error instanceof AppError) throw error;
      throw new AppError('EGRESS_IP_RESOLUTION_FAILED', 'Unable to resolve network identity');
    }
  }
}
