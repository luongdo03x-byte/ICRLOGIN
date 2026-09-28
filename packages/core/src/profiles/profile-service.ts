import { randomUUID } from 'node:crypto';
import {
  AppError,
  CreateProfileInputSchema,
  PROFILE_DEFAULTS,
  UpdateProfileInputSchema,
  type CreateProfileInput,
  type Profile,
  type UpdateProfileInput
} from '@icrlogin/shared';
import { ProfileFiles } from './profile-files.js';
import { ProfileRepository } from '../repositories/profile-repository.js';

export interface ProfileServiceOptions {
  idFactory?: () => string;
  now?: () => string;
}

function invalidRequest(): AppError {
  return new AppError('INVALID_REQUEST', 'Invalid profile input');
}

export class ProfileService {
  private readonly idFactory: () => string;
  private readonly now: () => string;

  constructor(
    private readonly repository: ProfileRepository,
    private readonly files: ProfileFiles,
    options: ProfileServiceOptions = {}
  ) {
    this.idFactory = options.idFactory ?? randomUUID;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async create(input: CreateProfileInput): Promise<Profile> {
    let parsed: CreateProfileInput;
    try {
      parsed = CreateProfileInputSchema.parse(input) as CreateProfileInput;
    } catch {
      throw invalidRequest();
    }

    const timestamp = this.now();
    const profile: Profile = {
      id: this.idFactory(),
      name: parsed.name,
      browserVersion: parsed.browserVersion,
      groupId: parsed.groupId ?? PROFILE_DEFAULTS.groupId,
      proxyId: parsed.proxyId ?? PROFILE_DEFAULTS.proxyId,
      userAgent: parsed.userAgent ?? PROFILE_DEFAULTS.userAgent,
      language: parsed.language ?? PROFILE_DEFAULTS.language,
      timezone: parsed.timezone ?? PROFILE_DEFAULTS.timezone,
      windowWidth: parsed.windowWidth ?? PROFILE_DEFAULTS.windowWidth,
      windowHeight: parsed.windowHeight ?? PROFILE_DEFAULTS.windowHeight,
      screenWidth: parsed.screenWidth ?? PROFILE_DEFAULTS.screenWidth,
      screenHeight: parsed.screenHeight ?? PROFILE_DEFAULTS.screenHeight,
      webrtcEnabled: parsed.webrtcEnabled ?? PROFILE_DEFAULTS.webrtcEnabled,
      geolocationMode: parsed.geolocationMode ?? PROFILE_DEFAULTS.geolocationMode,
      startupUrls: parsed.startupUrls ? [...parsed.startupUrls] : [...PROFILE_DEFAULTS.startupUrls],
      description: parsed.description ?? PROFILE_DEFAULTS.description,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastUsedAt: null,
      deletedAt: null
    };

    this.repository.create(profile);
    try {
      await this.files.create(profile.id);
    } catch (error) {
      this.repository.deleteById(profile.id);
      throw error;
    }
    return profile;
  }

  async get(id: string): Promise<Profile | null> {
    return this.repository.getById(id);
  }

  async update(id: string, input: UpdateProfileInput): Promise<Profile> {
    let parsed: UpdateProfileInput;
    try {
      parsed = UpdateProfileInputSchema.parse(input) as UpdateProfileInput;
    } catch {
      throw invalidRequest();
    }

    if (!this.repository.getById(id)) throw new AppError('PROFILE_NOT_FOUND', 'Profile not found');
    const updated = this.repository.update(id, parsed, this.now());
    if (!updated) throw new AppError('PROFILE_NOT_FOUND', 'Profile not found');
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    if (!this.repository.getById(id)) throw new AppError('PROFILE_NOT_FOUND', 'Profile not found');
    await this.files.moveToTrash(id);
    try {
      this.repository.softDelete(id, this.now());
    } catch (error) {
      await this.files.restoreFromTrash(id);
      throw error;
    }
  }

  async restore(id: string): Promise<Profile> {
    const existing = this.repository.getById(id, { includeDeleted: true });
    if (!existing) throw new AppError('PROFILE_NOT_FOUND', 'Profile not found');
    if (existing.deletedAt === null) return existing;

    await this.files.restoreFromTrash(id);
    try {
      const restored = this.repository.restore(id, this.now());
      if (!restored) throw new AppError('PROFILE_NOT_FOUND', 'Profile not found');
      return restored;
    } catch (error) {
      await this.files.moveToTrash(id);
      throw error;
    }
  }
}
