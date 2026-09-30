import { randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import type { AppPaths } from '../app-paths.js';

export interface ProfileFilesHooks {
  afterStagingCreated?(stagingDir: string): Promise<void>;
  beforeRestorePromotion?(stagingDir: string, profileId: string): Promise<void>;
}

export interface ManagedProfileFile {
  absolutePath: string;
  relativePath: string;
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

  async createRestoreStaging(profileId: string): Promise<string> {
    const stagingDir = childPath(this.paths.profilesDir, `.restore-${profileId}-${randomUUID()}`);
    await mkdir(stagingDir, { recursive: false });
    try {
      await mkdir(resolve(stagingDir, 'user-data'), { recursive: false });
      await mkdir(resolve(stagingDir, 'runtime'), { recursive: false });
      return stagingDir;
    } catch (error) {
      await rm(stagingDir, { recursive: true, force: true });
      throw error;
    }
  }

  async promoteRestore(stagingDir: string, profileId: string): Promise<void> {
    const expectedPrefix = resolve(this.paths.profilesDir, '.restore-');
    const resolvedStaging = resolve(stagingDir);
    if (!resolvedStaging.startsWith(expectedPrefix)) throw new Error('Invalid restore staging path');
    const finalDir = childPath(this.paths.profilesDir, profileId);
    await writeFile(resolve(resolvedStaging, 'metadata.json'), `${JSON.stringify({ profileId }, null, 2)}\n`, 'utf8');
    await this.hooks.beforeRestorePromotion?.(resolvedStaging, profileId);
    await rename(resolvedStaging, finalDir);
  }

  async discardRestore(stagingDir: string): Promise<void> {
    const expectedPrefix = resolve(this.paths.profilesDir, '.restore-');
    const resolvedStaging = resolve(stagingDir);
    if (!resolvedStaging.startsWith(expectedPrefix)) throw new Error('Invalid restore staging path');
    await rm(resolvedStaging, { recursive: true, force: true });
  }

  async listUserDataFiles(profileId: string): Promise<ManagedProfileFile[]> {
    const userDataRoot = resolve(childPath(this.paths.profilesDir, profileId), 'user-data');
    const result: ManagedProfileFile[] = [];
    const pending = [userDataRoot];
    while (pending.length > 0) {
      const current = pending.pop()!;
      const names = await readdir(current);
      names.sort((a, b) => a.localeCompare(b));
      for (const name of names) {
        const target = resolve(current, name);
        const rel = relative(userDataRoot, target);
        if (!rel || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('Profile user-data path escapes managed root');
        const stat = await lstat(target);
        if (stat.isSymbolicLink()) throw new Error('Profile user-data symlinks are not supported for backup');
        if (stat.isDirectory()) pending.push(target);
        else if (stat.isFile()) result.push({ absolutePath: target, relativePath: rel.split(sep).join('/') });
        else throw new Error('Unsupported profile user-data entry');
      }
    }
    return result.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
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

  async stageTrashPurge(profileId: string): Promise<string> {
    const source = childPath(this.paths.trashDir, profileId);
    const staged = childPath(this.paths.trashDir, `.purging-${profileId}-${randomUUID()}`);
    await rename(source, staged);
    return staged;
  }

  async rollbackTrashPurge(stagedPath: string, profileId: string): Promise<void> {
    const expectedPrefix = resolve(this.paths.trashDir, '.purging-');
    const staged = resolve(stagedPath);
    if (!staged.startsWith(expectedPrefix)) throw new Error('Invalid trash purge staging path');
    await rename(staged, childPath(this.paths.trashDir, profileId));
  }

  async commitTrashPurge(stagedPath: string): Promise<void> {
    const expectedPrefix = resolve(this.paths.trashDir, '.purging-');
    const staged = resolve(stagedPath);
    if (!staged.startsWith(expectedPrefix)) throw new Error('Invalid trash purge staging path');
    await rm(staged, { recursive: true, force: true });
  }
}
