import { randomUUID } from 'node:crypto';
import { cp, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import type { AppPaths } from '../app-paths.js';

export interface ProfileFilesHooks {
  afterStagingCreated?(stagingDir: string): Promise<void>;
}

function childPath(root: string, segment: string): string {
  if (!segment || segment === '.' || segment === '..' || segment.includes('/') || segment.includes('\\')) {
    throw new Error('Invalid profile id');
  }
  const target = resolve(root, segment);
  const rel = relative(resolve(root), target);
  if (rel.startsWith(`..${sep}`) || rel === '..') throw new Error('Profile path escapes managed root');
  return target;
}

export class ProfileFiles {
  constructor(
    private readonly paths: AppPaths,
    private readonly hooks: ProfileFilesHooks = {}
  ) {}

  async create(profileId: string): Promise<void> {
    const finalDir = childPath(this.paths.profilesDir, profileId);
    const stagingDir = childPath(this.paths.profilesDir, `.staging-${profileId}-${randomUUID()}`);
    await mkdir(stagingDir, { recursive: false });
    try {
      await mkdir(resolve(stagingDir, 'user-data'), { recursive: false });
      await mkdir(resolve(stagingDir, 'runtime'), { recursive: false });
      await writeFile(resolve(stagingDir, 'metadata.json'), `${JSON.stringify({ profileId }, null, 2)}\n`, 'utf8');
      await this.hooks.afterStagingCreated?.(stagingDir);
      await rename(stagingDir, finalDir);
    } catch (error) {
      await rm(stagingDir, { recursive: true, force: true });
      throw error;
    }
  }

  async clone(sourceId: string, targetId: string, includeUserData: boolean): Promise<void> {
    const sourceDir = childPath(this.paths.profilesDir, sourceId);
    const finalDir = childPath(this.paths.profilesDir, targetId);
    const stagingDir = childPath(this.paths.profilesDir, `.staging-${targetId}-${randomUUID()}`);
    await mkdir(stagingDir, { recursive: false });
    try {
      if (includeUserData) {
        await cp(resolve(sourceDir, 'user-data'), resolve(stagingDir, 'user-data'), {
          recursive: true,
          errorOnExist: true,
          force: false
        });
      } else {
        await mkdir(resolve(stagingDir, 'user-data'), { recursive: false });
      }
      await mkdir(resolve(stagingDir, 'runtime'), { recursive: false });
      await writeFile(resolve(stagingDir, 'metadata.json'), `${JSON.stringify({ profileId: targetId }, null, 2)}\n`, 'utf8');
      await this.hooks.afterStagingCreated?.(stagingDir);
      await rename(stagingDir, finalDir);
    } catch (error) {
      await rm(stagingDir, { recursive: true, force: true });
      throw error;
    }
  }

  async remove(profileId: string): Promise<void> {
    await rm(childPath(this.paths.profilesDir, profileId), { recursive: true, force: true });
  }

  async moveToTrash(profileId: string): Promise<void> {
    await rename(childPath(this.paths.profilesDir, profileId), childPath(this.paths.trashDir, profileId));
  }

  async restoreFromTrash(profileId: string): Promise<void> {
    await rename(childPath(this.paths.trashDir, profileId), childPath(this.paths.profilesDir, profileId));
  }
}
