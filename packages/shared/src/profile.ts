import { z } from 'zod';

export const GeolocationModeSchema = z.enum(['allow', 'ask', 'block']);
export type GeolocationMode = 'allow' | 'ask' | 'block';

export const EnvironmentModeSchema = z.enum(['auto', 'manual']);
export type EnvironmentMode = z.infer<typeof EnvironmentModeSchema>;

const optionalPositiveInt = z.number().int().positive().optional();
const optionalNullableText = z.string().trim().min(1).nullable().optional();
const optionalNullableLatitude = z.number().min(-90).max(90).nullable().optional();
const optionalNullableLongitude = z.number().min(-180).max(180).nullable().optional();
const optionalNullableAccuracy = z.number().nonnegative().nullable().optional();

export const CreateProfileInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  browserVersion: z.string().trim().min(1),
  groupId: optionalNullableText,
  proxyId: optionalNullableText,
  userAgent: z.string().trim().min(1).max(1024).nullable().optional(),
  language: z.string().trim().min(1).max(64).optional(),
  timezone: z.string().trim().min(1).max(128).optional(),
  environmentMode: EnvironmentModeSchema.optional(),
  latitude: optionalNullableLatitude,
  longitude: optionalNullableLongitude,
  accuracy: optionalNullableAccuracy,
  windowWidth: optionalPositiveInt,
  windowHeight: optionalPositiveInt,
  screenWidth: optionalPositiveInt,
  screenHeight: optionalPositiveInt,
  webrtcEnabled: z.boolean().optional(),
  geolocationMode: GeolocationModeSchema.optional(),
  startupUrls: z.array(z.string().url().regex(/^https?:\/\//i)).optional(),
  description: z.string().max(2000).nullable().optional()
});

export const UpdateProfileInputSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  browserVersion: z.string().trim().min(1).optional(),
  groupId: optionalNullableText,
  proxyId: optionalNullableText,
  userAgent: z.string().trim().min(1).max(1024).nullable().optional(),
  language: z.string().trim().min(1).max(64).optional(),
  timezone: z.string().trim().min(1).max(128).optional(),
  environmentMode: EnvironmentModeSchema.optional(),
  latitude: optionalNullableLatitude,
  longitude: optionalNullableLongitude,
  accuracy: optionalNullableAccuracy,
  windowWidth: optionalPositiveInt,
  windowHeight: optionalPositiveInt,
  screenWidth: optionalPositiveInt,
  screenHeight: optionalPositiveInt,
  webrtcEnabled: z.boolean().optional(),
  geolocationMode: GeolocationModeSchema.optional(),
  startupUrls: z.array(z.string().url().regex(/^https?:\/\//i)).optional(),
  description: z.string().max(2000).nullable().optional()
});

export type CreateProfileInput = z.infer<typeof CreateProfileInputSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileInputSchema>;

export interface Profile {
  id: string;
  name: string;
  description: string | null;
  groupId: string | null;
  browserVersion: string;
  proxyId: string | null;
  userAgent: string | null;
  language: string;
  timezone: string;
  environmentMode: EnvironmentMode;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  windowWidth: number;
  windowHeight: number;
  screenWidth: number;
  screenHeight: number;
  webrtcEnabled: boolean;
  geolocationMode: GeolocationMode;
  startupUrls: string[];
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  deletedAt: string | null;
}

export const PROFILE_DEFAULTS = {
  groupId: null,
  proxyId: null,
  userAgent: null,
  language: 'en-US',
  timezone: 'UTC',
  environmentMode: 'auto' as EnvironmentMode,
  latitude: null,
  longitude: null,
  accuracy: null,
  windowWidth: 1280,
  windowHeight: 800,
  screenWidth: 1920,
  screenHeight: 1080,
  webrtcEnabled: true,
  geolocationMode: 'ask' as GeolocationMode,
  startupUrls: [] as readonly string[],
  description: null
} as const;
