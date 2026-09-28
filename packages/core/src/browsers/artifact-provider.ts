import { readFile } from 'node:fs/promises';
import { BrowserManifestSchema, type BrowserManifest } from '@icrlogin/shared';

export interface BrowserArtifactProvider {
  getManifest(): Promise<BrowserManifest>;
}

export interface InstalledBrowser {
  version: string;
  executablePath: string;
  sha256: string;
  artifactSize: number;
  installedAt: string;
}

function parseManifest(value: unknown): BrowserManifest {
  return BrowserManifestSchema.parse(value) as BrowserManifest;
}

export class InMemoryBrowserArtifactProvider implements BrowserArtifactProvider {
  constructor(private readonly value: unknown) {}

  async getManifest(): Promise<BrowserManifest> {
    return parseManifest(this.value);
  }
}

export class JsonFileBrowserArtifactProvider implements BrowserArtifactProvider {
  constructor(private readonly manifestPath: string) {}

  async getManifest(): Promise<BrowserManifest> {
    const text = await readFile(this.manifestPath, 'utf8');
    return parseManifest(JSON.parse(text) as unknown);
  }
}
