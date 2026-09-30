import { randomUUID } from 'node:crypto';
import { readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AppError,
  CreateProfileInputSchema,
  type Profile,
  type RestoreProfileResult
} from '@icrlogin/shared';
import type { ProfileOperationLock } from '../browsers/operation-lock.js';
import type { ProfileFiles } from '../profiles/profile-files.js';
import type { BackupArchiveReader, ValidatedBackupArchive } from './archive-reader.js';

const MAX_METADATA_BYTES = 2 * 1024 * 1024;

interface ProfileStore {
  getById(id: string, options?: { includeDeleted?: boolean }): Profile | null;
  create(profile: Profile): Profile;
  deleteById(id: string): void;
}

interface ReferenceResolver {
  groupExists(id: string): boolean;
  proxyExists(id: string): boolean;
  existingTagIds(ids: string[]): Set<string>;
  existingExtensionIds(ids: string[]): Set<string>;
}

interface RelationWriter {
  setProfileTags(profileId: string, ids: string[]): void;
  setProfileExtensionIds(profileId: string, ids: string[]): void;
}

interface RestoreArchiveReader {
  inspect(path: string): Promise<ValidatedBackupArchive>;
  extract(path: string, destination: string): Promise<void>;
}

export interface ProfileRestoreServiceOptions {
  idFactory?: () => string;
  now?: () => string;
}

export interface ProfileRestoreServiceDependencies {
  archive: RestoreArchiveReader | BackupArchiveReader;
  profiles: ProfileStore;
  references: ReferenceResolver;
  relations: RelationWriter;
  profileFiles: ProfileFiles;
  operationLock: ProfileOperationLock;
  options?: ProfileRestoreServiceOptions;
}

function invalid(message: string): AppError {
  return new AppError('INVALID_REQUEST', message);
}

async function readJson(path: string): Promise<unknown> {
  const info = await stat(path);
  if (!info.isFile() || info.size > MAX_METADATA_BYTES) throw invalid('Backup metadata payload is invalid');
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    throw invalid('Backup metadata payload is invalid');
  }
}

function parseStringIds(value: unknown, key: string): string[] {
  if (!value || typeof value !== 'object') throw invalid('Backup relation payload is invalid');
  const ids = (value as Record<string, unknown>)[key];
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) throw invalid('Backup relation payload is invalid');
  return [...new Set(ids as string[])];
}

function parseArchivedProfile(value: unknown, sourceProfileId: string, browserVersion: string): Profile {
  if (!value || typeof value !== 'object') throw invalid('Backup profile payload is invalid');
  const raw = value as Record<string, unknown>;
  if (raw.id !== sourceProfileId || raw.browserVersion !== browserVersion) throw invalid('Backup profile metadata does not match manifest');
  const parsed = CreateProfileInputSchema.safeParse({
    name: raw.name,
    browserVersion: raw.browserVersion,
    groupId: raw.groupId,
    proxyId: raw.proxyId,
    userAgent: raw.userAgent,
    language: raw.language,
    timezone: raw.timezone,
    windowWidth: raw.windowWidth,
    windowHeight: raw.windowHeight,
    screenWidth: raw.screenWidth,
    screenHeight: raw.screenHeight,
    webrtcEnabled: raw.webrtcEnabled,
    geolocationMode: raw.geolocationMode,
    startupUrls: raw.startupUrls,
    description: raw.description
  });
  if (!parsed.success) throw invalid('Backup profile payload is invalid');
  return value as Profile;
}

export class ProfileRestoreService {
  private readonly idFactory: () => string;
  private readonly now: () => string;

  constructor(private readonly deps: ProfileRestoreServiceDependencies) {
    this.idFactory = deps.options?.idFactory ?? randomUUID;
    this.now = deps.options?.now ?? (() => new Date().toISOString());
  }

  async restore(archivePath: string): Promise<RestoreProfileResult> {
    const inspected = await this.deps.archive.inspect(archivePath);
    const sourceProfileId = inspected.manifest.profileId;

    return this.deps.operationLock.runExclusive(sourceProfileId, async () => {
      const collision = this.deps.profiles.getById(sourceProfileId, { includeDeleted: true }) !== null;
      const createdProfileId = collision ? this.idFactory() : sourceProfileId;
      if (this.deps.profiles.getById(createdProfileId, { includeDeleted: true })) throw invalid('Unable to allocate restore profile id');

      const stagingDir = await this.deps.profileFiles.createRestoreStaging(createdProfileId);
      let profileCreated = false;
      try {
        await this.deps.archive.extract(archivePath, stagingDir);
        const archived = parseArchivedProfile(
          await readJson(join(stagingDir, 'profile.json')),
          sourceProfileId,
          inspected.manifest.browserVersion
        );
        const tagIds = parseStringIds(await readJson(join(stagingDir, 'tags.json')), 'tagIds');
        const extensionIds = parseStringIds(await readJson(join(stagingDir, 'extensions.json')), 'extensionIds');

        const warnings: string[] = [];
        const groupId = archived.groupId && this.deps.references.groupExists(archived.groupId)
          ? archived.groupId
          : null;
        if (archived.groupId && groupId === null) warnings.push('GROUP_REFERENCE_MISSING');
        const proxyId = archived.proxyId && this.deps.references.proxyExists(archived.proxyId)
          ? archived.proxyId
          : null;
        if (archived.proxyId && proxyId === null) warnings.push('PROXY_REFERENCE_MISSING');

        const existingTags = this.deps.references.existingTagIds(tagIds);
        const retainedTagIds = tagIds.filter((id) => existingTags.has(id));
        if (retainedTagIds.length !== tagIds.length) warnings.push('TAG_REFERENCES_SKIPPED');
        const existingExtensions = this.deps.references.existingExtensionIds(extensionIds);
        const retainedExtensionIds = extensionIds.filter((id) => existingExtensions.has(id));
        if (retainedExtensionIds.length !== extensionIds.length) warnings.push('EXTENSION_REFERENCES_SKIPPED');

        const timestamp = this.now();
        const profile: Profile = {
          ...archived,
          id: createdProfileId,
          groupId,
          proxyId,
          createdAt: timestamp,
          updatedAt: timestamp,
          lastUsedAt: null,
          deletedAt: null
        };

        this.deps.profiles.create(profile);
        profileCreated = true;
        this.deps.relations.setProfileTags(createdProfileId, retainedTagIds);
        this.deps.relations.setProfileExtensionIds(createdProfileId, retainedExtensionIds);

        await Promise.all([
          rm(join(stagingDir, 'profile.json'), { force: true }),
          rm(join(stagingDir, 'tags.json'), { force: true }),
          rm(join(stagingDir, 'extensions.json'), { force: true })
        ]);
        await this.deps.profileFiles.promoteRestore(stagingDir, createdProfileId);

        return {
          profile,
          sourceProfileId,
          createdProfileId,
          idCollision: collision,
          warnings
        };
      } catch (error) {
        if (profileCreated) {
          try { this.deps.profiles.deleteById(createdProfileId); } catch { /* preserve original restore error */ }
        }
        try { await this.deps.profileFiles.discardRestore(stagingDir); } catch { /* preserve original restore error */ }
        throw error;
      }
    });
  }
}
