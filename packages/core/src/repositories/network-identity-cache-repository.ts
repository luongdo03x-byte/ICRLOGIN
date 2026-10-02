import type { Database } from '../db/database.js';

export interface NetworkIdentityCacheRecord {
  routeKey: string;
  publicIp: string;
  countryIso: string | null;
  cityName: string | null;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  resolvedAt: string;
  sourceDbVersion: string | null;
}

type Row = {
  route_key: string;
  public_ip: string;
  country_iso: string | null;
  city_name: string | null;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  resolved_at: string;
  source_db_version: string | null;
};

function mapRow(row: Row): NetworkIdentityCacheRecord {
  return {
    routeKey: row.route_key,
    publicIp: row.public_ip,
    countryIso: row.country_iso,
    cityName: row.city_name,
    timezone: row.timezone,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: row.accuracy,
    resolvedAt: row.resolved_at,
    sourceDbVersion: row.source_db_version
  };
}

export class NetworkIdentityCacheRepository {
  constructor(private readonly db: Database) {}

  get(routeKey: string): NetworkIdentityCacheRecord | null {
    const row = this.db.prepare('SELECT * FROM network_identity_cache WHERE route_key = ?').get(routeKey) as Row | undefined;
    return row ? mapRow(row) : null;
  }

  upsert(record: NetworkIdentityCacheRecord): NetworkIdentityCacheRecord {
    this.db.prepare(`
      INSERT INTO network_identity_cache (
        route_key, public_ip, country_iso, city_name, timezone,
        latitude, longitude, accuracy, resolved_at, source_db_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(route_key) DO UPDATE SET
        public_ip = excluded.public_ip,
        country_iso = excluded.country_iso,
        city_name = excluded.city_name,
        timezone = excluded.timezone,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        accuracy = excluded.accuracy,
        resolved_at = excluded.resolved_at,
        source_db_version = excluded.source_db_version
    `).run(
      record.routeKey,
      record.publicIp,
      record.countryIso,
      record.cityName,
      record.timezone,
      record.latitude,
      record.longitude,
      record.accuracy,
      record.resolvedAt,
      record.sourceDbVersion
    );
    return record;
  }

  delete(routeKey: string): void {
    this.db.prepare('DELETE FROM network_identity_cache WHERE route_key = ?').run(routeKey);
  }
}
