import { randomUUID } from 'node:crypto';
import { AppError, type Profile } from '@icrlogin/shared';
import { ProfileOperationLock } from '../browsers/operation-lock.js';
import { ProfileFiles } from './profile-files.js';

export interface ProfileCloneRelations {
  getTagIds(profileId: string): string[];
  getExtensionIds(profileId: string): string[];
  setTagIds(profileId: string, ids: string[]): void | Promise<void>;
  setExtensionIds(profileId: string, ids: string[]): void | Promise<void>;
}
export interface ProfileStateReader { getState(profileId: string): string; }
interface ProfileCloneRepository { getById(id: string): Profile | null; create(profile: Profile): Profile; deleteById(id: string): void; }
export interface CloneProfileOverrides { name?: string; groupId?: string | null; proxyId?: string | null; browserVersion?: string; }
export interface ProfileCloneLock { runExclusive<T>(profileId: string, operation: () => Promise<T>): Promise<T>; }
export interface ProfileCloneServiceOptions { idFactory?: () => string; now?: () => string; operationLock?: ProfileCloneLock; }

export class ProfileCloneService {
  private readonly idFactory: () => string;
  private readonly now: () => string;
  private readonly operationLock: ProfileCloneLock;

  constructor(
    private readonly repository: ProfileCloneRepository,
    private readonly files: ProfileFiles,
    private readonly relations: ProfileCloneRelations,
    private readonly states: ProfileStateReader,
    options: ProfileCloneServiceOptions = {}
  ) {
    this.idFactory = options.idFactory ?? randomUUID;
    this.now = options.now ?? (() => new Date().toISOString());
    this.operationLock = options.operationLock ?? new ProfileOperationLock();
  }

  async cloneConfig(sourceId: string, overrides: CloneProfileOverrides = {}): Promise<Profile> {
    return this.clone(sourceId, false, overrides);
  }

  async cloneFull(sourceId: string, overrides: CloneProfileOverrides = {}): Promise<Profile> {
    return this.operationLock.runExclusive(sourceId, async () => {
      if (this.states.getState(sourceId) !== 'stopped') {
        throw new AppError('INVALID_REQUEST', 'Stop the source profile before full clone');
      }
      return this.clone(sourceId, true, overrides);
    });
  }

  private async clone(sourceId: string, includeUserData: boolean, overrides: CloneProfileOverrides): Promise<Profile> {
    const source = this.repository.getById(sourceId);
    if (!source) throw new AppError('PROFILE_NOT_FOUND', 'Profile not found');
    const id = this.idFactory();
    const timestamp = this.now();
    const target: Profile = {
      ...source, id, name: overrides.name ?? `${source.name} Copy`,
      groupId: overrides.groupId === undefined ? source.groupId : overrides.groupId,
      proxyId: overrides.proxyId === undefined ? source.proxyId : overrides.proxyId,
      browserVersion: overrides.browserVersion ?? source.browserVersion,
      createdAt: timestamp, updatedAt: timestamp, lastUsedAt: null, deletedAt: null
    };
    const tagIds = this.relations.getTagIds(sourceId);
    const extensionIds = this.relations.getExtensionIds(sourceId);
    try {
      await this.files.clone(sourceId, id, includeUserData);
      this.repository.create(target);
      await this.relations.setTagIds(id, [...tagIds]);
      await this.relations.setExtensionIds(id, [...extensionIds]);
      return target;
    } catch (error) {
      this.repository.deleteById(id);
      await this.files.remove(id).catch(() => undefined);
      throw error;
    }
  }
}
