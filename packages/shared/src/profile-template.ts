import { z } from 'zod';

const nullableId = z.string().trim().uuid().nullable().optional();
const positiveInt = z.number().int().positive().optional();
const httpUrl = z.string().url().regex(/^https?:\/\//i);

export const ProfileTemplateConfigSchema = z.object({
  browserVersion: z.string().trim().min(1).max(128),
  groupId: nullableId,
  proxyId: nullableId,
  userAgent: z.string().trim().min(1).max(1024).nullable().optional(),
  language: z.string().trim().min(1).max(64).optional(),
  timezone: z.string().trim().min(1).max(128).optional(),
  environmentMode: z.enum(['auto', 'manual']).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  accuracy: z.number().nonnegative().nullable().optional(),
  windowWidth: positiveInt,
  windowHeight: positiveInt,
  screenWidth: positiveInt,
  screenHeight: positiveInt,
  webrtcEnabled: z.boolean().optional(),
  geolocationMode: z.enum(['allow', 'ask', 'block']).optional(),
  startupUrls: z.array(httpUrl).optional(),
  description: z.string().max(2000).nullable().optional()
}).strict();

export const ProfileCloneModeSchema = z.enum(['config', 'full']);
export type ProfileCloneMode = 'config' | 'full';

export const ProfileCloneOverridesSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  groupId: nullableId,
  proxyId: nullableId,
  browserVersion: z.string().trim().min(1).max(128).optional()
}).strict();

export const CloneProfileInputSchema = z.object({
  sourceId: z.string().uuid(),
  mode: ProfileCloneModeSchema,
  overrides: ProfileCloneOverridesSchema.optional()
}).strict();

export const SaveProfileTemplateInputSchema = z.object({
  profileId: z.string().uuid(),
  name: z.string().trim().min(1).max(100)
}).strict();

export const CreateProfileFromTemplateInputSchema = z.object({
  templateId: z.string().uuid(),
  overrides: ProfileCloneOverridesSchema.optional()
}).strict();

export interface ProfileTemplateConfig {
  browserVersion: string;
  groupId?: string | null;
  proxyId?: string | null;
  userAgent?: string | null;
  language?: string;
  timezone?: string;
  environmentMode?: 'auto' | 'manual';
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  windowWidth?: number;
  windowHeight?: number;
  screenWidth?: number;
  screenHeight?: number;
  webrtcEnabled?: boolean;
  geolocationMode?: 'allow' | 'ask' | 'block';
  startupUrls?: string[];
  description?: string | null;
}

export interface ProfileTemplate {
  id: string;
  name: string;
  config: ProfileTemplateConfig;
  tagIds: string[];
  extensionIds: string[];
  createdAt: string;
  updatedAt: string;
}
