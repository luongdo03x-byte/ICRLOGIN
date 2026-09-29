import {
  BrowserDownloadInstaller,
  BrowserService,
  BrowserVersionRepository,
  BrowserVersionService,
  BulkOperationService,
  ChromiumLauncher,
  ExtensionImporter,
  ExtensionRepository,
  ExtensionService,
  GroupRepository,
  GroupService,
  PortAllocator,
  ProcessRegistry,
  ProfileCloneService,
  ProfileFiles,
  ProfileOperationLock,
  ProfileRepository,
  ProfileService,
  ProfileTemplateRepository,
  ProfileTemplateService,
  ProxyConnectivityService,
  ProxyRepository,
  ProxyService,
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
  type SecretStore
} from '@icrlogin/core';
import { AppError, type ProfileTemplate } from '@icrlogin/shared';

export interface AppServices {
  profiles: ProfileService;
  groups: GroupService;
  proxies: ProxyService;
  proxyConnectivity: ProxyConnectivityService;
  tags: TagService;
  extensions: ExtensionService;
  browserVersions: BrowserVersionService;
  browsers: BrowserService;
  profileClones: ProfileCloneService;
  templates: ProfileTemplateService;
  bulk: BulkOperationService;
  registry: ProcessRegistry;
  runtimeSessions: RuntimeSessionRepository;
}

export interface CreateAppServicesOptions {
  db: Database;
  paths: AppPaths;
  secretStore: SecretStore;
  browserArtifactProvider: BrowserArtifactProvider;
  browserArtifactInstaller?: BrowserArtifactInstaller;
  cdpWaiter?: CdpWaiter;
  registry?: ProcessRegistry;
}

export function createAppServices(options: CreateAppServicesOptions): AppServices {
  const profileRepository = new ProfileRepository(options.db);
  const groupRepository = new GroupRepository(options.db);
  const proxyRepository = new ProxyRepository(options.db);
  const tagRepository = new TagRepository(options.db);
  const extensionRepository = new ExtensionRepository(options.db);
  const templateRepository = new ProfileTemplateRepository(options.db);
  const browserVersionRepository = new BrowserVersionRepository(options.db);
  const runtimeSessions = new RuntimeSessionRepository(options.db);
  const registry = options.registry ?? new ProcessRegistry();
  const profileFiles = new ProfileFiles(options.paths);

  const profiles = new ProfileService(profileRepository, profileFiles);
  const groups = new GroupService(groupRepository);
  const proxies = new ProxyService(proxyRepository, options.secretStore);
  const proxyConnectivity = new ProxyConnectivityService(proxies);
  const tags = new TagService(tagRepository, profileRepository);
  const extensions = new ExtensionService(extensionRepository, new ExtensionImporter(options.paths));
  const downloader = new BrowserDownloadInstaller(options.paths);
  const artifactInstaller: BrowserArtifactInstaller = options.browserArtifactInstaller
    ?? ((entry, onProgress) => downloader.install(entry, onProgress));
  const browserVersions = new BrowserVersionService(
    options.browserArtifactProvider,
    browserVersionRepository,
    artifactInstaller,
    {
      usageCounter: (version) => profileRepository.countByBrowserVersion(version),
      uninstaller: (browser) => removeManagedBrowser(options.paths, browser.version)
    }
  );
  const browsers = new BrowserService({
    profiles: profileRepository,
    browserVersions,
    proxies,
    extensions,
    portAllocator: new PortAllocator(),
    launcher: new ChromiumLauncher(),
    cdpWaiter: options.cdpWaiter ?? waitForCdp,
    registry,
    operationLock: new ProfileOperationLock(),
    runtimeSessions,
    paths: options.paths
  });

  const relations = {
    getTagIds: (profileId: string) => profileRepository.listTagIds(profileId),
    getExtensionIds: (profileId: string) => extensions.getDirectExtensionIds(profileId),
    setTagIds: (profileId: string, ids: string[]) => tags.setProfileTags(profileId, ids),
    setExtensionIds: (profileId: string, ids: string[]) => extensions.setProfileExtensionIds(profileId, ids)
  };

  const profileClones = new ProfileCloneService(
    profileRepository,
    profileFiles,
    relations,
    browsers
  );

  const templates = new ProfileTemplateService(
    templateRepository,
    profileRepository,
    profileFiles,
    relations,
    {
      validate(template: ProfileTemplate) {
        if (template.config.groupId && !groupRepository.getById(template.config.groupId)) {
          throw new AppError('INVALID_REQUEST', 'Template group no longer exists');
        }
        if (template.config.proxyId && !proxyRepository.getInternalById(template.config.proxyId)) {
          throw new AppError('INVALID_REQUEST', 'Template proxy no longer exists');
        }
        if (tagRepository.existingIds(template.tagIds).size !== template.tagIds.length) {
          throw new AppError('INVALID_REQUEST', 'Template tag no longer exists');
        }
        if (extensionRepository.existingIds(template.extensionIds).size !== template.extensionIds.length) {
          throw new AppError('INVALID_REQUEST', 'Template extension no longer exists');
        }
      }
    }
  );

  const bulk = new BulkOperationService({ browsers, profiles, tags });

  return {
    profiles,
    groups,
    proxies,
    proxyConnectivity,
    tags,
    extensions,
    browserVersions,
    browsers,
    profileClones,
    templates,
    bulk,
    registry,
    runtimeSessions
  };
}
