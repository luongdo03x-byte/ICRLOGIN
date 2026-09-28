import { z } from 'zod';

export const GeolocationModeSchema = z.enum(['allow', 'ask', 'block']);
export type GeolocationMode = 'allow' | 'ask' | 'block';

const optionalPositiveInt = z.number().int().positive().optional();
const optionalNullableText = z.string().trim().min(1).nullable().optional();

export const CreateProfileInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  browserVersion: z.string().trim().min(1),
  groupId: optionalNullableText,
  proxyId: optionalNullableText,
  userAgent: z.string().trim().min(1).max(1024).nullable().optional(),
  language: z.string().trim().min(1).max(64).optional(),
  timezone: z.string().trim().min(1).max(128).optional(),
  windowWidth: optionalPositiveInt,
  windowHeight: optionalPositiveInt,
  screenWidth: optionalPositiveInt,
  screenHeight: optionalPositiveInt,
  webrtcEnabled: z.boolean().optional(),
  geolocationMode: GeolocationModeSchema.optional(),
  startupUrls: z.array(z.string().url()).optional(),
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
  windowWidth: optionalPositiveInt,
  windowHeight: optionalPositiveInt,
  screenWidth: optionalPositiveInt,
  screenHeight: optionalPositiveInt,
  webrtcEnabled: z.boolean().optional(),
  geolocationMode: GeolocationModeSchema.optional(),
  startupUrls: z.array(z.string().url()).optional(),
  description: z.string().max(2000).nullable().optional()
});

export interface CreateProfileInput {
  name: string;
  browserVersion: string;
  groupId?: string | null;
  proxyId?: string | null;
  userAgent?: string | null;
  language?: string;
  timezone?: string;
  windowWidth?: number;
  windowHeight?: number;
  screenWidth?: number;
  screenHeight?: number;
  webrtcEnabled?: boolean;
  geolocationMode?: GeolocationMode;
  startupUrls?: string[];
  description?: string | null;
}

export type UpdateProfileInput = Partial<CreateProfileInput>;

export interface Profile extends CreateProfileInput {
  id: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  deletedAt: string | null;
}
