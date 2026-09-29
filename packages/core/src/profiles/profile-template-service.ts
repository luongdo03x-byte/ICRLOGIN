import { randomUUID } from 'node:crypto';
import {
  AppError,
  PROFILE_DEFAULTS,
  type Profile,
  type ProfileTemplate,
  type ProfileTemplateConfig
} from '@icrlogin/shared';
import { ProfileFiles } from './profile-files.js';

interface TemplateRepositoryLike {
  create(template: ProfileTemplate): ProfileTemplate;
  list(): ProfileTemplate[];
  getById(id: string): ProfileTemplate | null;
  delete(id: string): void;
}

interface ProfileRepositoryLike {
  getById(id: string): Profile | null;
  create(profile: Profile): Profile;
  deleteById(id: string): void;
}

interface ProfileTemplateRelations {
  getTagIds(profileId: string): string[];
  getExtensionIds(profileId: string): string[];
  setTagIds(profileId: string, ids: string[]): void | Promise<void>;
  setExtensionIds(profileId: string, ids: string[]): void | Promise<void>;
}

export interface TemplateReferenceValidator {
  validate(template: ProfileTemplate): void | Promise<void>;
}

export interface TemplateProfileOverrides {
  name?: string;
  groupId?: string | null;
  proxyId?: string | null;
  browserVersion?: string;
}

export interface ProfileTemplateServiceOptions {
  idFactory?: () => string;
  now?: () => string;
}

export class ProfileTemplateService {
  private readonly idFactory: () => string;
  private readonly now: () => string;

  constructor(
    private readonly templates: TemplateRepositoryLike,
    private readonly profiles: ProfileRepositoryLike,
    private readonly files: ProfileFiles,
    private readonly relations: ProfileTemplateRelations,
    private readonly validator: TemplateReferenceValidator,
    options: ProfileTemplateServiceOptions = {}
  ) {
    this.idFactory = options.idFactory ?? randomUUID;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  list(): ProfileTemplate[] {
    return this.templates.list();
  }

  delete(id: string): void {
    if (!this.templates.getById(id)) throw new AppError('INVALID_REQUEST', 'Template not found');
    this.templates.delete(id);
  }

  saveFromProfile(profileId: string, name: string): ProfileTemplate {
    const profile = this.profiles.getById(profileId);
    if (!profile) throw new AppError('PROFILE_NOT_FOUND', 'Profile not found');
    const cleanName = name.trim();
    if (!cleanName) throw new AppError('INVALID_REQUEST', 'Invalid template name');

    const config: ProfileTemplateConfig = {
      browserVersion: profile.browserVersion,
      groupId: profile.groupId,
      proxyId: profile.proxyId,
      userAgent: profile.userAgent,
      language: profile.language,
      timezone: profile.timezone,
      windowWidth: profile.windowWidth,
      windowHeight: profile.windowHeight,
      screenWidth: profile.screenWidth,
      screenHeight: profile.screenHeight,
      webrtcEnabled: profile.webrtcEnabled,
      geolocationMode: profile.geolocationMode,
      startupUrls: [...profile.startupUrls],
      description: profile.description
    };
    const timestamp = this.now();
    const template: ProfileTemplate = {
      id: this.idFactory(),
      name: cleanName,
      config,
      tagIds: [...this.relations.getTagIds(profileId)],
      extensionIds: [...this.relations.getExtensionIds(profileId)],
      createdAt: timestamp,
      updatedAt: timestamp
    };

    try {
      return this.templates.create(template);
    } catch {
      throw new AppError('INVALID_REQUEST', 'Template name already exists');
    }
  }

  async createProfile(templateId: string, overrides: TemplateProfileOverrides = {}): Promise<Profile> {
    const template = this.templates.getById(templateId);
    if (!template) throw new AppError('INVALID_REQUEST', 'Template not found');
    await this.validator.validate(template);

    const id = this.idFactory();
    const timestamp = this.now();
    const config = template.config;
    const profile: Profile = {
      id,
      name: overrides.name ?? template.name,
      description: config.description ?? PROFILE_DEFAULTS.description,
      groupId: overrides.groupId === undefined ? (config.groupId ?? PROFILE_DEFAULTS.groupId) : overrides.groupId,
      browserVersion: overrides.browserVersion ?? config.browserVersion,
      proxyId: overrides.proxyId === undefined ? (config.proxyId ?? PROFILE_DEFAULTS.proxyId) : overrides.proxyId,
      userAgent: config.userAgent ?? PROFILE_DEFAULTS.userAgent,
      language: config.language ?? PROFILE_DEFAULTS.language,
      timezone: config.timezone ?? PROFILE_DEFAULTS.timezone,
      windowWidth: config.windowWidth ?? PROFILE_DEFAULTS.windowWidth,
      windowHeight: config.windowHeight ?? PROFILE_DEFAULTS.windowHeight,
      screenWidth: config.screenWidth ?? PROFILE_DEFAULTS.screenWidth,
      screenHeight: config.screenHeight ?? PROFILE_DEFAULTS.screenHeight,
      webrtcEnabled: config.webrtcEnabled ?? PROFILE_DEFAULTS.webrtcEnabled,
      geolocationMode: config.geolocationMode ?? PROFILE_DEFAULTS.geolocationMode,
      startupUrls: config.startupUrls ? [...config.startupUrls] : [...PROFILE_DEFAULTS.startupUrls],
      createdAt: timestamp,
      updatedAt: timestamp,
      lastUsedAt: null,
      deletedAt: null
    };

    try {
      await this.files.create(id);
      this.profiles.create(profile);
      await this.relations.setTagIds(id, [...template.tagIds]);
      await this.relations.setExtensionIds(id, [...template.extensionIds]);
      return profile;
    } catch (error) {
      this.profiles.deleteById(id);
      await this.files.remove(id).catch(() => undefined);
      throw error;
    }
  }
}
