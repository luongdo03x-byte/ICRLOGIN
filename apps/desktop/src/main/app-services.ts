import {
  BrowserDownloadInstaller,
  BrowserService,
  BrowserVersionRepository,
  BrowserVersionService,
  ChromiumLauncher,
  GroupRepository,
  GroupService,
  PortAllocator,
  ProcessRegistry,
  ProfileFiles,
  ProfileOperationLock,
  ProfileRepository,
  ProfileService,
  ProxyConnectivityService,
  ProxyRepository,
  ProxyService,
  RuntimeSessionRepository,
  removeManagedBrowser,
  waitForCdp,
  type AppPaths,
  type BrowserArtifactInstaller,
  type BrowserArtifactProvider,
  type CdpWaiter,
  type Database,
  type SecretStore
} from '@icrlogin/core';

export interface AppServices {
  profiles: ProfileService;
  groups: GroupService;
  proxies: ProxyService;
  proxyConnectivity: ProxyConnectivityService;
  browserVersions: BrowserVersionService;
  browsers: BrowserService;
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
  const browserVersionRepository = new BrowserVersionRepository(options.db);
  const runtimeSessions = new RuntimeSessionRepository(options.db);
  const registry = options.registry ?? new ProcessRegistry();

  const profiles = new ProfileService(profileRepository, new ProfileFiles(options.paths));
  const groups = new GroupService(groupRepository);
  const proxies = new ProxyService(proxyRepository, options.secretStore);
  const proxyConnectivity = new ProxyConnectivityService(proxies);
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
    portAllocator: new PortAllocator(),
    launcher: new ChromiumLauncher(),
    cdpWaiter: options.cdpWaiter ?? waitForCdp,
    registry,
    operationLock: new ProfileOperationLock(),
    runtimeSessions,
    paths: options.paths
  });

  return { profiles, groups, proxies, proxyConnectivity, browserVersions, browsers, registry, runtimeSessions };
}
