import { access } from 'node:fs/promises';
import { AppError, HttpVersionParamsSchema, httpOk } from '@icrlogin/shared';
import type { InstalledBrowser } from '../../browsers/artifact-provider.js';
import type { LocalApiRouter } from '../local-api-router.js';

interface BrowserRouteServices {
  browserVersions: {
    listAvailable(): Promise<Array<{ version: string; size: number }>>;
    listInstalled(): InstalledBrowser[];
    getStable(): Promise<{ version: string }>;
    getUsageCount(version: string): number;
    download(version: string): Promise<InstalledBrowser>;
    remove(version: string): Promise<void>;
  };
}

function parseVersion(params: unknown): string {
  try { return HttpVersionParamsSchema.parse(params).version; }
  catch { throw new AppError('INVALID_REQUEST', 'Invalid browser version'); }
}

async function installedDto(browser: InstalledBrowser, services: BrowserRouteServices) {
  let executableAvailable = true;
  try { await access(browser.executablePath); } catch { executableAvailable = false; }
  return {
    version: browser.version,
    sha256: browser.sha256,
    artifactSize: browser.artifactSize,
    installedAt: browser.installedAt,
    executableAvailable,
    profilesUsing: services.browserVersions.getUsageCount(browser.version)
  };
}

export function registerBrowserRoutes(router: LocalApiRouter, services: BrowserRouteServices): void {
  router.register('GET', '/api/v1/browsers', async () => {
    const installed = services.browserVersions.listInstalled();
    const installedVersions = new Set(installed.map((item) => item.version));
    let available: Array<{ version: string; size: number }> = [];
    let stableVersion: string | null = null;
    let manifestAvailable = true;
    try {
      [available, stableVersion] = await Promise.all([
        services.browserVersions.listAvailable(),
        services.browserVersions.getStable().then((entry) => entry.version)
      ]);
    } catch {
      manifestAvailable = false;
    }
    return httpOk({
      manifestAvailable,
      available: available.map((entry) => ({
        version: entry.version,
        size: entry.size,
        isStable: entry.version === stableVersion,
        isInstalled: installedVersions.has(entry.version)
      })),
      installed: await Promise.all(installed.map((entry) => installedDto(entry, services)))
    });
  });

  router.register('POST', '/api/v1/browsers/:version/download', async ({ params }) => {
    const version = parseVersion(params);
    return httpOk(await installedDto(await services.browserVersions.download(version), services));
  });

  router.register('DELETE', '/api/v1/browsers/:version', async ({ params }) => {
    await services.browserVersions.remove(parseVersion(params));
    return httpOk(null);
  });
}
