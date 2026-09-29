import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import {
  ensureAppPaths,
  HttpBrowserArtifactProvider,
  JsonFileBrowserArtifactProvider,
  LocalApiServer,
  openDatabase,
  runMigrations,
  RuntimeReconciler,
  waitForCdp
} from '@icrlogin/core';
import { AppError } from '@icrlogin/shared';
import { EncryptedApiTokenStore, resolveApiToken } from './api-token-store.js';
import { createAppServices } from './app-services.js';
import {
  createSecureWindowOptions,
  maskDataRoot,
  moduleDirectory,
  prepareUserDataRoot,
  resolveBrowserManifestSettings,
  resolveLocalApiSettings
} from './config.js';
import { registerIpcHandlers } from './ipc.js';
import { ElectronSafeStorageSecretStore } from './secret-store.js';
import { WindowsProcessInspector } from './windows-process-inspector.js';

async function bootstrap(): Promise<void> {
  const localBase = process.env.LOCALAPPDATA ?? app.getPath('appData');
  const { dataRoot, paths } = await prepareUserDataRoot(
    localBase,
    ensureAppPaths,
    (name, path) => app.setPath(name, path)
  );

  await app.whenReady();

  const db = openDatabase(join(paths.dataDir, 'icrlogin.db'));
  runMigrations(db);

  const secretStore = new ElectronSafeStorageSecretStore(safeStorage);
  const manifestSettings = resolveBrowserManifestSettings(paths, process.env.ICRLOGIN_BROWSER_MANIFEST_URL);
  const browserArtifactProvider = manifestSettings.manifestUrl
    ? new HttpBrowserArtifactProvider(manifestSettings.manifestUrl, manifestSettings.cachePath)
    : new JsonFileBrowserArtifactProvider(manifestSettings.cachePath);

  const services = createAppServices({ db, paths, secretStore, browserArtifactProvider });
  const reconciler = new RuntimeReconciler({
    runtimeSessions: services.runtimeSessions,
    registry: services.registry,
    processInspector: new WindowsProcessInspector(),
    cdpProbe: waitForCdp,
    paths
  });
  await reconciler.reconcile();

  registerIpcHandlers(ipcMain, services, { dataRootLabel: maskDataRoot(dataRoot) });

  let apiServer: LocalApiServer | null = null;
  try {
    const apiSettings = resolveLocalApiSettings(process.env, paths);
    const tokenStore = new EncryptedApiTokenStore(apiSettings.tokenFile, secretStore);
    const bearerToken = await resolveApiToken(process.env, tokenStore);
    apiServer = new LocalApiServer({
      port: apiSettings.port,
      services,
      ...(bearerToken ? { bearerToken } : {})
    });
    await apiServer.start();
  } catch (error) {
    const code = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
    console.error(`[ICRLogin] Local API unavailable (${code})`);
    apiServer = null;
  }

  const mainDir = moduleDirectory(import.meta.url);
  const window = new BrowserWindow(createSecureWindowOptions(join(mainDir, '../preload/index.js')));
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) await window.loadURL(devUrl);
  else await window.loadFile(join(mainDir, '../renderer/index.html'));

  let shutdownStarted = false;
  app.on('before-quit', (event) => {
    if (shutdownStarted) return;
    event.preventDefault();
    shutdownStarted = true;
    void (async () => {
      try {
        await apiServer?.stop();
      } catch {
        // Shutdown remains best-effort; never log tokens or internal paths.
      } finally {
        db.close();
        app.quit();
      }
    })();
  });
}

void bootstrap();
app.on('window-all-closed', () => app.quit());
