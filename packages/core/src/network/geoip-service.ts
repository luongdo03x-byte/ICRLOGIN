import { stat } from 'node:fs/promises';
import { AppError } from '@icrlogin/shared';

export interface GeoIpRecord {
  countryIso: string | null;
  cityName: string | null;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  sourceDbVersion: string | null;
}

export interface GeoIpReader {
  get(ip: string): unknown;
}

export type GeoIpReaderFactory = (dbPath: string) => Promise<GeoIpReader>;
export type GeoIpVersionReader = (dbPath: string) => Promise<string | null>;

async function defaultReaderFactory(dbPath: string): Promise<GeoIpReader> {
  const maxmind = await import('maxmind');
  return maxmind.open(dbPath) as Promise<GeoIpReader>;
}

async function defaultVersionReader(dbPath: string): Promise<string> {
  return (await stat(dbPath)).mtime.toISOString();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function nested(value: unknown, ...keys: string[]): unknown {
  let current: unknown = value;
  for (const key of keys) {
    const object = asRecord(current);
    if (!object) return undefined;
    current = object[key];
  }
  return current;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export class GeoIpService {
  private readerPromise: Promise<GeoIpReader> | null = null;

  constructor(
    private readonly dbPath: string,
    private readonly readerFactory: GeoIpReaderFactory = defaultReaderFactory,
    private readonly versionReader: GeoIpVersionReader = defaultVersionReader
  ) {}

  private async reader(): Promise<GeoIpReader> {
    this.readerPromise ??= this.readerFactory(this.dbPath);
    return this.readerPromise;
  }

  invalidate(): void {
    this.readerPromise = null;
  }

  async lookup(ip: string): Promise<GeoIpRecord> {
    try {
      const reader = await this.reader();
      const raw = reader.get(ip);
      if (!raw) throw new AppError('GEOIP_LOOKUP_FAILED', `No GeoIP record for ${ip}`);
      const accuracyKm = number(nested(raw, 'location', 'accuracy_radius'));
      return {
        countryIso: text(nested(raw, 'country', 'iso_code')),
        cityName: text(nested(raw, 'city', 'names', 'en')),
        timezone: text(nested(raw, 'location', 'time_zone')),
        latitude: number(nested(raw, 'location', 'latitude')),
        longitude: number(nested(raw, 'location', 'longitude')),
        accuracy: accuracyKm === null ? null : accuracyKm * 1000,
        sourceDbVersion: await this.versionReader(this.dbPath)
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      const code = asRecord(error)?.code;
      if (code === 'ENOENT') throw new AppError('GEOIP_DATABASE_MISSING', 'GeoLite2 City database is not installed');
      throw new AppError('GEOIP_LOOKUP_FAILED', 'GeoIP lookup failed');
    }
  }
}
