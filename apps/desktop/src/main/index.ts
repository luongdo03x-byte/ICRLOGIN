import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import {
  createAppPaths,
  ensureAppPaths,
  openDatabase,
  runMigrations,
  ProcessRegistry,
  ProfileFiles,
  ProfileRepository,
  ProfileService,
  ProxyRepository,
  ProxyService,
  RuntimeSessionRepository,
  RuntimeReconciler,
  waitForCdp
} from '@icrlogin/core';
import { createSecureWindowOptions, maskDataRoot, moduleDirectory, prepareUserDataRoot } from './config.js';
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
  const profileRepository = new ProfileRepository(db);
  const proxyRepository = new ProxyRepository(db);
  // Construct Phase-1 services in main only; renderer never receives these objects.
  void new ProfileService(profileRepository, new ProfileFiles(paths));
  void new ProxyService(proxyRepository, secretStore);

  const runtimeSessions = new RuntimeSessionRepository(db);
  const registry = new ProcessRegistry();
  const reconciler = new RuntimeReconciler({
    runtimeSessions,
    registry,
    processInspector: new WindowsProcessInspector(),
    cdpProbe: waitForCdp,
    paths
  });
  await reconciler.reconcile();

  ipcMain.handle('icr:health', () => ({
    status: 'ok' as const,
    dataRoot: maskDataRoot(dataRoot),
    runningRuntimeCount: registry.list().length
  }));

  const mainDir = moduleDirectory(import.meta.url);
  const window = new BrowserWindow(createSecureWindowOptions(join(mainDir, '../preload/index.js')));
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) await window.loadURL(devUrl);
  else await window.loadFile(join(mainDir, '../renderer/index.html'));

  app.on('before-quit', () => db.close());
}

void bootstrap();
app.on('window-all-closed', () => app.quit());
