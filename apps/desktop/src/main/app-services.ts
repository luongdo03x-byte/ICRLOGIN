import { join } from 'node:path';
import {
  BackupArchiveReader,
  BackupArchiveWriter,
  BackupHistoryRepository,
  BrowserDownloadInstaller,
  BrowserEnvironmentApplier,
  BrowserService,
  BrowserVersionRepository,
  BrowserVersionService,
  BulkOperationService,
  ChromiumLauncher,
  DatabaseBackupService,
  EgressIpResolver,
  ExtensionImporter,
  ExtensionRepository,
  ExtensionService,
  GeoIpService,
  GroupRepository,
  GroupService,
  NetworkIdentityCacheRepository,
  NetworkIdentityResolver,
  PortAllocator,
  ProcessMonitor,
  ProcessRegistry,
  ProfileBackupService,
  ProfileCloneService,
  ProfileConfigTransferService,
  ProfileFiles,
  ProfileLaunchCoordinator,
  ProfileLaunchProgressHub,
  ProfileMutationCoordinator,
  ProfileOperationLock,
  ProfileRepository,
  ProfileRestoreService,
  ProfileService,
  ProfileTemplateRepository,
  ProfileTemplateService,
  ProxyConnectivityService,
  ProxyRepository,
  ProxyRuntimeExtensionBuilder,
  ProxyService,
  RuntimeEnvironmentResolver,
  RuntimeSessionRepository,
  TagRepository,
  TagService,
  removeManagedBrowser,
  waitForCdp,
  type AppPaths,
  type BrowserArtifactInstaller,
  type BrowserArtifactProvider,
  type CdpWaiter,
  type Database,
  type ProcessMetricsReader,
  type SecretStore
} from '@icrlogin/core';
import { AppError, type ProfileTemplate } from '@icrlogin/shared';

export interface AppServices {
  profiles: ProfileService; groups: GroupService; proxies: ProxyService; proxyConnectivity: ProxyConnectivityService;
  tags: TagService; extensions: ExtensionService; browserVersions: BrowserVersionService; browsers: BrowserService;
  profileClones: ProfileCloneService; templates: ProfileTemplateService; bulk: BulkOperationService;
  profileMutations: ProfileMutationCoordinator; registry: ProcessRegistry; runtimeSessions: RuntimeSessionRepository;
  backups: BackupHistoryRepository; profileBackups: ProfileBackupService; profileRestore: ProfileRestoreService;
  profileConfigTransfer: ProfileConfigTransferService; databaseBackups: DatabaseBackupService; monitoring: ProcessMonitor;
  launchProgress: ProfileLaunchProgressHub; geoIp: GeoIpService;
}
export interface CreateAppServicesOptions { db: Database; paths: AppPaths; secretStore: SecretStore; browserArtifactProvider: BrowserArtifactProvider; browserArtifactInstaller?: BrowserArtifactInstaller; cdpWaiter?: CdpWaiter; registry?: ProcessRegistry; processMetricsReader?: ProcessMetricsReader; }

export function createAppServices(options: CreateAppServicesOptions): AppServices {
  const profileRepository = new ProfileRepository(options.db);
  const groupRepository = new GroupRepository(options.db);
  const proxyRepository = new ProxyRepository(options.db);
  const tagRepository = new TagRepository(options.db);
  const extensionRepository = new ExtensionRepository(options.db);
  const templateRepository = new ProfileTemplateRepository(options.db);
  const browserVersionRepository = new BrowserVersionRepository(options.db);
  const runtimeSessions = new RuntimeSessionRepository(options.db);
  const backupHistory = new BackupHistoryRepository(options.db);
  const networkIdentityCache = new NetworkIdentityCacheRepository(options.db);
  const registry = options.registry ?? new ProcessRegistry();
  const profileFiles = new ProfileFiles(options.paths);
  const operationLock = new ProfileOperationLock();
  const profileMutations = new ProfileMutationCoordinator(operationLock, registry);
  const monitoring = new ProcessMonitor({ registry, reader: options.processMetricsReader ?? { read: async () => null } });

  const groups = new GroupService(groupRepository, { profileMutations });
  const proxies = new ProxyService(proxyRepository, options.secretStore);
  const proxyConnectivity = new ProxyConnectivityService(proxies);
  const tags = new TagService(tagRepository, profileRepository);
  const extensions = new ExtensionService(extensionRepository, new ExtensionImporter(options.paths), profileMutations);
  const downloader = new BrowserDownloadInstaller(options.paths);
  const artifactInstaller: BrowserArtifactInstaller = options.browserArtifactInstaller ?? ((entry, onProgress) => downloader.install(entry, onProgress));
  const browserVersions = new BrowserVersionService(options.browserArtifactProvider, browserVersionRepository, artifactInstaller, { usageCounter: (version) => profileRepository.countByBrowserVersion(version), uninstaller: (browser) => removeManagedBrowser(options.paths, browser.version) });

  const geoIp = new GeoIpService(join(options.paths.geoIpDir, 'GeoLite2-City.mmdb'));
  const networkIdentity = new NetworkIdentityResolver(new EgressIpResolver(), geoIp, networkIdentityCache);
  const environmentResolver = new RuntimeEnvironmentResolver();
  const proxyRuntimeExtension = new ProxyRuntimeExtensionBuilder(options.paths);
  const launchProgress = new ProfileLaunchProgressHub();
  const launchCoordinator = new ProfileLaunchCoordinator({
    proxies,
    proxyConnectivity,
    networkIdentity,
    browserVersions,
    environmentResolver,
    proxyRuntimeExtension,
    publish: (event) => launchProgress.publish(event)
  });
  const environmentApplier = new BrowserEnvironmentApplier();

  const browsers = new BrowserService({ profiles: profileRepository, browserVersions, proxies, extensions, portAllocator: new PortAllocator(), launcher: new ChromiumLauncher(), cdpWaiter: options.cdpWaiter ?? waitForCdp, registry, operationLock, runtimeSessions, paths: options.paths, launchCoordinator, environmentApplier });
  const profiles = new ProfileService(profileRepository, profileFiles, { browsers, operationLock });

  const relations = { getTagIds: (profileId: string) => profileRepository.listTagIds(profileId), getExtensionIds: (profileId: string) => extensions.getDirectExtensionIds(profileId), setTagIds: (profileId: string, ids: string[]) => tags.setProfileTags(profileId, ids), setExtensionIds: (profileId: string, ids: string[]) => extensions.setProfileExtensionIds(profileId, ids) };
  const profileClones = new ProfileCloneService(profileRepository, profileFiles, relations, browsers, { operationLock });
  const templates = new ProfileTemplateService(templateRepository, profileRepository, profileFiles, relations, { validate(template: ProfileTemplate) { if (template.config.groupId && !groupRepository.getById(template.config.groupId)) throw new AppError('INVALID_REQUEST', 'Template group no longer exists'); if (template.config.proxyId && !proxyRepository.getInternalById(template.config.proxyId)) throw new AppError('INVALID_REQUEST', 'Template proxy no longer exists'); if (tagRepository.existingIds(template.tagIds).size !== template.tagIds.length) throw new AppError('INVALID_REQUEST', 'Template tag no longer exists'); if (extensionRepository.existingIds(template.extensionIds).size !== template.extensionIds.length) throw new AppError('INVALID_REQUEST', 'Template extension no longer exists'); } });
  const bulk = new BulkOperationService({ browsers, profiles, tags, profileMutations });

  const databaseBackups = new DatabaseBackupService(options.db, options.paths);
  const profileBackups = new ProfileBackupService({
    profiles: profileRepository,
    profileFiles,
    relations: { getTagIds: (id) => profileRepository.listTagIds(id), getExtensionIds: (id) => extensionRepository.directIds(id) },
    browsers,
    operationLock,
    writer: new BackupArchiveWriter(),
    history: backupHistory,
    paths: options.paths,
    options: { appVersion: '0.1.0' }
  });
  const profileRestore = new ProfileRestoreService({
    archive: new BackupArchiveReader(),
    profiles: profileRepository,
    references: {
      groupExists: (id) => groupRepository.getById(id) !== null,
      proxyExists: (id) => proxyRepository.getInternalById(id) !== null,
      existingTagIds: (ids) => tagRepository.existingIds(ids),
      existingExtensionIds: (ids) => extensionRepository.existingIds(ids)
    },
    relations: {
      setProfileTags: (id, ids) => tagRepository.setProfileTags(id, ids),
      setProfileExtensionIds: (id, ids) => extensionRepository.setDirectIds(id, ids)
    },
    profileFiles,
    operationLock,
    options: { beforeMutation: () => databaseBackups.create('restore').then(() => undefined) }
  });
  const profileConfigTransfer = new ProfileConfigTransferService({
    profiles: {
      getById: (id) => profileRepository.getById(id),
      create: (input) => profiles.create(input),
      removeCreated: async (id) => { profileRepository.deleteById(id); await profileFiles.remove(id); }
    },
    relations: {
      getTagIds: (id) => profileRepository.listTagIds(id),
      getExtensionIds: (id) => extensionRepository.directIds(id),
      existingTagIds: (ids) => tagRepository.existingIds(ids),
      existingExtensionIds: (ids) => extensionRepository.existingIds(ids),
      setProfileTags: (id, ids) => tagRepository.setProfileTags(id, ids),
      setProfileExtensionIds: (id, ids) => extensionRepository.setDirectIds(id, ids)
    },
    references: {
      groupExists: (id) => groupRepository.getById(id) !== null,
      proxyExists: (id) => proxyRepository.getInternalById(id) !== null
    }
  });

  return { profiles, groups, proxies, proxyConnectivity, tags, extensions, browserVersions, browsers, profileClones, templates, bulk, profileMutations, registry, runtimeSessions, backups: backupHistory, profileBackups, profileRestore, profileConfigTransfer, databaseBackups, monitoring, launchProgress, geoIp };
}
