import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import * as yauzl from 'yauzl';
import { AppError, type BrowserManifestEntry } from '@icrlogin/shared';
import type { AppPaths } from '../app-paths.js';
import type { InstalledBrowser } from './artifact-provider.js';

function archiveInvalid(message: string): AppError {
  return new AppError('BROWSER_ARCHIVE_INVALID', message);
}

function ensureVersionSegment(version: string): string {
  if (!version || version === '.' || version === '..' || version.includes('/') || version.includes('\\')) {
    throw archiveInvalid('Browser version is not a safe path segment');
  }
  return version;
}

function safeRelativeParts(value: string): string[] {
  if (!value || value.includes('\0')) throw archiveInvalid('Archive path is empty or invalid');
  const portable = value.replace(/\\/g, '/');
  if (portable.startsWith('/') || /^[A-Za-z]:\//.test(portable)) throw archiveInvalid('Archive contains an absolute path');
  const parts = portable.split('/').filter((part) => part.length > 0 && part !== '.');
  if (parts.some((part) => part === '..')) throw archiveInvalid('Archive path escapes destination');
  if (parts.length === 0) throw archiveInvalid('Archive path is empty');
  return parts;
}

function safeTarget(root: string, portableRelativePath: string): string {
  const parts = safeRelativeParts(portableRelativePath);
  const target = resolve(root, ...parts);
  const rel = relative(resolve(root), target);
  if (rel === '..' || rel.startsWith(`..${sep}`)) throw archiveInvalid('Archive path escapes destination');
  return target;
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolvePromise, reject) => {
    yauzl.open(
      path,
      { lazyEntries: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: true },
      (error, zipFile) => {
        if (error || !zipFile) reject(error ?? archiveInvalid('Unable to open archive'));
        else resolvePromise(zipFile);
      }
    );
  });
}

function openEntryStream(zipFile: yauzl.ZipFile, entry: yauzl.Entry): Promise<any> {
  return new Promise((resolvePromise, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(error ?? archiveInvalid('Unable to read archive entry'));
      else resolvePromise(stream);
    });
  });
}

async function extractZip(path: string, stagingDir: string): Promise<void> {
  const zipFile = await openZip(path);
  await new Promise<void>((resolvePromise, reject) => {
    let settled = false;
    const finishWithError = (error: unknown) => {
      if (settled) return;
      settled = true;
      zipFile.close();
      reject(error);
    };

    zipFile.on('error', finishWithError);
    zipFile.on('end', () => {
      if (settled) return;
      settled = true;
      resolvePromise();
    });
    zipFile.on('entry', (entry) => {
      void (async () => {
        const target = safeTarget(stagingDir, entry.fileName);
        if (entry.fileName.replace(/\\/g, '/').endsWith('/')) {
          await mkdir(target, { recursive: true });
        } else {
          await mkdir(dirname(target), { recursive: true });
          const stream = await openEntryStream(zipFile, entry);
          await pipeline(stream, createWriteStream(target));
        }
        zipFile.readEntry();
      })().catch(finishWithError);
    });
    zipFile.readEntry();
  });
}

export async function installBrowserArtifact(
  entry: BrowserManifestEntry,
  artifactPath: string,
  paths: AppPaths
): Promise<InstalledBrowser> {
  const version = ensureVersionSegment(entry.version);
  const executableParts = safeRelativeParts(entry.executableRelativePath);
  const stagingDir = resolve(paths.browsersDir, `.staging-${version}`);
  const finalDir = resolve(paths.browsersDir, version);

  const artifactStat = await stat(artifactPath);
  const digest = await sha256File(artifactPath);
  if (artifactStat.size !== entry.size || digest.toLowerCase() !== entry.sha256.toLowerCase()) {
    throw new AppError('BROWSER_CHECKSUM_MISMATCH', 'Browser artifact failed size or SHA-256 verification');
  }

  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(stagingDir, { recursive: false });
  try {
    await extractZip(artifactPath, stagingDir);
    const executablePath = resolve(stagingDir, ...executableParts);
    const executableRel = relative(stagingDir, executablePath);
    if (executableRel === '..' || executableRel.startsWith(`..${sep}`)) throw archiveInvalid('Executable path escapes archive root');
    await access(executablePath);

    try {
      await access(finalDir);
      throw archiveInvalid(`Browser version ${version} already exists on disk`);
    } catch (error) {
      if (error instanceof AppError) throw error;
    }

    await rename(stagingDir, finalDir);
    return {
      version,
      executablePath: resolve(finalDir, ...executableParts),
      sha256: digest,
      artifactSize: artifactStat.size,
      installedAt: new Date().toISOString()
    };
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true });
    if (error instanceof AppError) throw error;
    throw archiveInvalid('Browser archive extraction failed');
  }
}
