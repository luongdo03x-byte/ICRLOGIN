import { z } from 'zod';
import type { Profile } from './profile.js';

export const BACKUP_FORMAT_VERSION = 1 as const;
export const PROFILE_CONFIG_EXPORT_VERSION = 1 as const;

export const BackupModeSchema = z.enum(['metadata', 'full']);
export type BackupMode = 'metadata' | 'full';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const httpUrl = z.string().url().regex(/^https?:\/\//i);
const nullableUuid = z.string().uuid().nullable();

export const BackupManifestEntrySchema = z.object({
  path: z.string().min(1).max(4096),
  sha256,
  byteLength: z.number().int().nonnegative()
}).strict();

export const BackupManifestSchema = z.object({
  formatVersion: z.literal(BACKUP_FORMAT_VERSION),
  mode: BackupModeSchema,
  createdAt: z.string().datetime(),
  appVersion: z.string().trim().min(1).max(64),
  profileId: z.string().uuid(),
  browserVersion: z.string().trim().min(1).max(128),
  payloadChecksum: sha256,
  entries: z.array(BackupManifestEntrySchema)
}).strict();

export interface BackupManifestEntry { path: string; sha256: string; byteLength: number; }
export interface BackupManifest { formatVersion: typeof BACKUP_FORMAT_VERSION; mode: BackupMode; createdAt: string; appVersion: string; profileId: string; browserVersion: string; payloadChecksum: string; entries: BackupManifestEntry[]; }

export const ProfileConfigPayloadSchema = z.object({
  name: z.string().trim().min(1).max(100),
  browserVersion: z.string().trim().min(1).max(128),
  groupId: nullableUuid,
  proxyId: nullableUuid,
  userAgent: z.string().trim().min(1).max(1024).nullable(),
  language: z.string().trim().min(1).max(64),
  timezone: z.string().trim().min(1).max(128),
  environmentMode: z.enum(['auto', 'manual']).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  accuracy: z.number().nonnegative().nullable().optional(),
  windowWidth: z.number().int().positive(),
  windowHeight: z.number().int().positive(),
  screenWidth: z.number().int().positive(),
  screenHeight: z.number().int().positive(),
  webrtcEnabled: z.boolean(),
  geolocationMode: z.enum(['allow', 'ask', 'block']),
  startupUrls: z.array(httpUrl),
  description: z.string().max(2000).nullable()
}).strict();

export const ProfileConfigExportSchema = z.object({
  formatVersion: z.literal(PROFILE_CONFIG_EXPORT_VERSION),
  exportedAt: z.string().datetime(),
  profile: ProfileConfigPayloadSchema,
  tagIds: z.array(z.string().uuid()),
  extensionIds: z.array(z.string().uuid())
}).strict();

export interface ProfileConfigPayload {
  name: string;
  browserVersion: string;
  groupId: string | null;
  proxyId: string | null;
  userAgent: string | null;
  language: string;
  timezone: string;
  environmentMode?: 'auto' | 'manual';
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  windowWidth: number;
  windowHeight: number;
  screenWidth: number;
  screenHeight: number;
  webrtcEnabled: boolean;
  geolocationMode: 'allow' | 'ask' | 'block';
  startupUrls: string[];
  description: string | null;
}

export interface ProfileConfigExport { formatVersion: typeof PROFILE_CONFIG_EXPORT_VERSION; exportedAt: string; profile: ProfileConfigPayload; tagIds: string[]; extensionIds: string[]; }
export type BackupHistoryStatus = 'completed' | 'failed';
export interface BackupRecordPublic { id: string; profileId: string | null; mode: BackupMode; fileName: string; checksum: string | null; status: BackupHistoryStatus; createdAt: string; }
export interface RestoreProfileResult { profile: Profile; sourceProfileId: string; createdProfileId: string; idCollision: boolean; warnings: string[]; }
export interface ImportProfileResult { profile: Profile; warnings: string[]; }
