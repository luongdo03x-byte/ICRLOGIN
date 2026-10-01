import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  APP_SETTINGS_DEFAULTS,
  AppSettingsSchema,
  UpdateAppSettingsSchema,
  type AppSettings,
  type UpdateAppSettings
} from '@icrlogin/shared';
import type { AppPaths } from '../app-paths.js';

export class AppSettingsStore {
  private readonly filePath: string;
  private writeTail: Promise<void> = Promise.resolve();

  constructor(private readonly paths: AppPaths) {
    this.filePath = join(paths.configDir, 'settings.json');
  }

  async read(): Promise<AppSettings> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as unknown;
      const result = AppSettingsSchema.safeParse(parsed);
      return result.success ? result.data : { ...APP_SETTINGS_DEFAULTS };
    } catch {
      return { ...APP_SETTINGS_DEFAULTS };
    }
  }

  async update(patch: UpdateAppSettings): Promise<AppSettings> {
    const validated = UpdateAppSettingsSchema.parse(patch) as UpdateAppSettings;
    const task = this.writeTail.then(async () => {
      const current = await this.read();
      const next = AppSettingsSchema.parse({ ...current, ...validated }) as AppSettings;
      await this.writeAtomic(next);
      return next;
    });
    this.writeTail = task.then(() => undefined, () => undefined);
    return task;
  }

  private async writeAtomic(value: AppSettings): Promise<void> {
    await mkdir(this.paths.configDir, { recursive: true });
    const tempPath = join(this.paths.configDir, `.settings-${randomUUID()}.tmp`);
    try {
      await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      await rename(tempPath, this.filePath);
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }
  }
}
