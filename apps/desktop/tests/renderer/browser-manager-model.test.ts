import { describe, expect, it } from 'vitest';
import { browserActionLabel, canRemoveBrowser, formatBytes, mergeBrowserRows, totalInstalledBytes } from '../../src/renderer/src/pages/browsers/browser-manager-model.js';

describe('browser manager model', () => {
  it('marks stable and installed versions from available/install data', () => {
    const rows = mergeBrowserRows(
      [{ version: '143', size: 2000, isStable: true, isInstalled: false }, { version: '142', size: 1000, isStable: false, isInstalled: true }],
      [{ version: '142', sha256: 'a', artifactSize: 1000, installedAt: '2026-09-28T00:00:00Z', executableAvailable: true, profilesUsing: 2 }]
    );
    expect(rows[0]?.isStable).toBe(true);
    expect(rows[1]?.isInstalled).toBe(true);
    expect(rows[1]?.profilesUsing).toBe(2);
  });

  it('formats sizes and progress/retry labels', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(browserActionLabel({ installed: false, downloading: true, failed: false })).toBe('Downloading…');
    expect(browserActionLabel({ installed: false, downloading: false, failed: true })).toBe('Retry');
    expect(browserActionLabel({ installed: true, downloading: false, failed: false })).toBe('Installed');
  });

  it('only allows removing unused versions and totals installed artifact size', () => {
    const installed = [
      { version: '144', sha256: 'a', artifactSize: 1024, installedAt: 'x', executableAvailable: true, profilesUsing: 0 },
      { version: '143', sha256: 'b', artifactSize: 2048, installedAt: 'y', executableAvailable: false, profilesUsing: 3 }
    ];
    expect(canRemoveBrowser(installed[0]!)).toBe(true);
    expect(canRemoveBrowser(installed[1]!)).toBe(false);
    expect(totalInstalledBytes(installed)).toBe(3072);
  });
});
