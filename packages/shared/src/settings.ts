import { z } from 'zod';
import { HttpPortSchema } from './http-api.js';

export const APP_SETTINGS_SCHEMA_VERSION = 1 as const;

export const CloseBehaviorSchema = z.enum(['ask', 'quit', 'tray']);
export type CloseBehavior = z.infer<typeof CloseBehaviorSchema>;

export const AppSettingsSchema = z.object({
  schemaVersion: z.literal(APP_SETTINGS_SCHEMA_VERSION),
  launchAtLogin: z.boolean(),
  closeBehavior: CloseBehaviorSchema,
  localApiPort: HttpPortSchema
}).strict();

export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const UpdateAppSettingsSchema = z.object({
  launchAtLogin: z.boolean().optional(),
  closeBehavior: CloseBehaviorSchema.optional(),
  localApiPort: HttpPortSchema.optional()
}).strict();

export type UpdateAppSettings = z.infer<typeof UpdateAppSettingsSchema>;

export const APP_SETTINGS_DEFAULTS: AppSettings = Object.freeze({
  schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
  launchAtLogin: false,
  closeBehavior: 'ask',
  localApiPort: 9495
});
