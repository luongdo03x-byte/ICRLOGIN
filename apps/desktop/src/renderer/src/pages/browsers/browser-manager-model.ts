export interface AvailableBrowserRow {
  version: string;
  size: number;
  isStable: boolean;
  isInstalled: boolean;
}

export interface InstalledBrowserRow {
  version: string;
  sha256: string;
  artifactSize: number;
  installedAt: string;
  executableAvailable: boolean;
  profilesUsing: number;
}

export interface BrowserManagerRow extends AvailableBrowserRow {
  profilesUsing: number;
  executableAvailable: boolean;
  installedAt: string | null;
}

export function mergeBrowserRows(available: readonly AvailableBrowserRow[], installed: readonly InstalledBrowserRow[]): BrowserManagerRow[] {
  const installedMap = new Map(installed.map((item) => [item.version, item] as const));
  return available.map((item) => {
    const installedItem = installedMap.get(item.version);
    return {
      ...item,
      isInstalled: item.isInstalled || Boolean(installedItem),
      profilesUsing: installedItem?.profilesUsing ?? 0,
      executableAvailable: installedItem?.executableAvailable ?? false,
      installedAt: installedItem?.installedAt ?? null
    };
  });
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function browserActionLabel(state: { installed: boolean; downloading: boolean; failed: boolean }): string {
  if (state.installed) return 'Installed';
  if (state.downloading) return 'Downloading…';
  if (state.failed) return 'Retry';
  return 'Download';
}

export function canRemoveBrowser(browser: Pick<InstalledBrowserRow, 'profilesUsing'>): boolean {
  return browser.profilesUsing === 0;
}

export function totalInstalledBytes(installed: readonly Pick<InstalledBrowserRow, 'artifactSize'>[]): number {
  return installed.reduce((sum, item) => sum + item.artifactSize, 0);
}
