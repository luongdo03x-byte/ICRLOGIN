import { randomUUID } from 'node:crypto';
import {
  AppError,
  CreateTagInputSchema,
  UpdateTagInputSchema,
  type CreateTagInput,
  type Tag,
  type UpdateTagInput
} from '@icrlogin/shared';
import { ProfileRepository } from '../repositories/profile-repository.js';
import { TagRepository } from '../repositories/tag-repository.js';

export interface TagServiceOptions {
  idFactory?: () => string;
  now?: () => string;
}

function invalidTag(message: string): AppError {
  return new AppError('INVALID_REQUEST', message);
}

export class TagService {
  private readonly idFactory: () => string;
  private readonly now: () => string;

  constructor(
    private readonly repository: TagRepository,
    private readonly profiles: ProfileRepository,
    options: TagServiceOptions = {}
  ) {
    this.idFactory = options.idFactory ?? randomUUID;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  list(): Tag[] {
    return this.repository.list();
  }

  create(input: CreateTagInput): Tag {
    let parsed: CreateTagInput;
    try {
      parsed = CreateTagInputSchema.parse(input) as CreateTagInput;
    } catch {
      throw invalidTag('Invalid tag input');
    }

    const timestamp = this.now();
    try {
      return this.repository.create({
        id: this.idFactory(),
        name: parsed.name,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    } catch {
      throw invalidTag('Tag name already exists');
    }
  }

  rename(id: string, input: UpdateTagInput): Tag {
    let parsed: UpdateTagInput;
    try {
      parsed = UpdateTagInputSchema.parse(input) as UpdateTagInput;
    } catch {
      throw invalidTag('Invalid tag input');
    }

    try {
      const updated = this.repository.updateName(id, parsed.name, this.now());
      if (!updated) throw invalidTag('Tag not found');
      return updated;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw invalidTag('Tag name already exists');
    }
  }

  delete(id: string): void {
    if (!this.repository.getById(id)) throw invalidTag('Tag not found');
    this.repository.delete(id);
  }

  setProfileTags(profileId: string, tagIds: string[]): void {
    const ids = [...new Set(tagIds)];
    this.validateReferences(profileId, ids);
    this.repository.setProfileTags(profileId, ids);
  }

  addProfileTags(profileId: string, tagIds: string[]): void {
    const ids = [...new Set(tagIds)];
    this.validateReferences(profileId, ids);
    this.repository.addProfileTags(profileId, ids);
  }

  removeProfileTags(profileId: string, tagIds: string[]): void {
    const ids = [...new Set(tagIds)];
    this.validateReferences(profileId, ids);
    this.repository.removeProfileTags(profileId, ids);
  }

  listProfileTagIds(profileId: string): string[] {
    if (!this.profiles.getById(profileId)) throw invalidTag('Profile not found');
    return this.profiles.listTagIds(profileId);
  }

  listTagIdsByProfileIds(profileIds: string[]): Record<string, string[]> {
    return this.profiles.listTagIdsByProfileIds(profileIds);
  }

  private validateReferences(profileId: string, tagIds: string[]): void {
    if (!this.profiles.getById(profileId)) throw invalidTag('Profile not found');
    if (this.repository.existingIds(tagIds).size !== tagIds.length) throw invalidTag('Tag not found');
  }
}
