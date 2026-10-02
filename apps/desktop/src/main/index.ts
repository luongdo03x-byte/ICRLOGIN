import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, Tray } from 'electron';
import {
  AppSettingsStore,
  CURRENT_DB_SCHEMA_VERSION,
  DatabaseBackupService,
  ensureAppPaths,
  HttpBrowserArtifactProvider,
  JsonFileBrowserArtifactProvider,
  LocalApiServer,
  openDatabase,
  runMigrations,
  RuntimeReconciler,
  StartupRecoveryService,
  waitForCdp
} from '@icrlogin/core';
import { AppError, BACKUP_FORMAT_VERSION, LOCAL_API_VERSION } from '@icrlogin/shared';
import { AppUpdateService } from './app-update-service.js';
import { EncryptedApiTokenStore, resolveApiToken } from './api-token-store.js';
import { createAppServices, type AppServices } from './app-services.js';
import {
  createSecureWindowOptions,
  maskDataRoot,
  moduleDirectory,
  prepareUserDataRoot,
  resolveBrowserManifestSettings,
  resolveLocalApiSettings
} from './config.js';
import { createElectronUpdateAdapter } from './electron-update-adapter.js';
import { GeoIpRuntimeController } from './geoip-runtime-controller.js';
import { registerIpcHandlers } from './ipc.js';
import { registerRuntimeIpcHandlers } from './ipc-runtime.js';
import { registerPhase5IpcHandlers } from './ipc-phase5.js';
import { registerPhase6IpcHandlers } from './ipc-phase6.js';
import { registerPhase7IpcHandlers } from './ipc-phase7.js';
import { registerPhase8IpcHandlers } from './ipc-phase8.js';
import { registerPhase10IpcHandlers } from './ipc-phase10.js';
import { ElectronSafeStorageSecretStore } from './secret-store.js';
import { acquireSingleInstance } from './single-instance.js';
import { bindTray, createTrayMenuTemplate, showAndFocusMainWindow, type TrayPort } from './tray-controller.js';
import { resolveWindowCloseAction } from './window-close-policy.js';
import { WindowsProcessInspector } from './windows-process-inspector.js';
import { WindowsProcessMetricsReader } from './windows-process-metrics.js';

let mainWindow: BrowserWindow | null = null;

async function bootstrap(): Promise<void> {
  const localBase = process.env.LOCALAPPDATA ?? app.getPath('appData');
  const { dataRoot, paths } = await prepareUserDataRoot(localBase, ensureAppPaths, (name, path) => app.setPath(name, path));

  await app.whenReady();

  const updates = new AppUpdateService(createElectronUpdateAdapter({
    isPackaged: app.isPackaged,
    feedUrl: process.env.ICRLOGIN_UPDATE_URL
  }), app.getVersion());
  registerPhase8IpcHandlers(ipcMain, updates);

  const settingsStore = new AppSettingsStore(paths);
  const bootSettings = await settingsStore.read();
  try { app.setLoginItemSettings({ openAtLogin: bootSettings.launchAtLogin }); }
  catch { /* Settings UI can retry; startup remains usable. */ }

  const db = openDatabase(join(paths.dataDir, 'icrlogin.db'));
  const startupRecovery = await new StartupRecoveryService({ db, paths }).run();
  registerPhase10IpcHandlers(ipcMain, {
    appVersion: app.getVersion(),
    localApiVersion: LOCAL_API_VERSION,
    databaseSchemaVersion: CURRENT_DB_SCHEMA_VERSION,
    backupFormatVersion: BACKUP_FORMAT_VERSION,
    databaseHealthy: startupRecovery.databaseHealthy,
    packaged: app.isPackaged,
    runtimeReadiness: startupRecovery.databaseHealthy ? 'operational' : 'recovery-required'
  });

  let services: AppServices | null = null;
  let apiServer: LocalApiServer | null = null;

  if (startupRecovery.databaseHealthy) {
    const databaseBackups = new DatabaseBackupService(db, paths);
    await runMigrations(db, { beforeMigration: () => databaseBackups.create('migration').then(() => undefined) });

    const secretStore = new ElectronSafeStorageSecretStore(safeStorage);
    const geoIpRuntime = new GeoIpRuntimeController(paths, safeStorage);
    await geoIpRuntime.initialize().catch(() => undefined);

    const manifestSettings = resolveBrowserManifestSettings(paths, process.env.ICRLOGIN_BROWSER_MANIFEST_URL);
    const browserArtifactProvider = manifestSettings.manifestUrl
      ? new HttpBrowserArtifactProvider(manifestSettings.manifestUrl, manifestSettings.cachePath)
      : new JsonFileBrowserArtifactProvider(manifestSettings.cachePath);

    services = createAppServices({ db, paths, secretStore, browserArtifactProvider, processMetricsReader: new WindowsProcessMetricsReader() });

    const reconciler = new RuntimeReconciler({
      runtimeSessions: services.runtimeSessions,
      registry: services.registry,
      processInspector: new WindowsProcessInspector(),
      cdpProbe: waitForCdp,
      paths
    });
    await reconciler.reconcile();
    services.monitoring.start();

    registerIpcHandlers(ipcMain, services, { dataRootLabel: maskDataRoot(dataRoot) });
    registerRuntimeIpcHandlers(ipcMain, services, geoIpRuntime);
    registerPhase5IpcHandlers(ipcMain, services, {
      async selectRestoreBackup() {
        const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'ICRLogin Backup', extensions: ['icrbackup'] }] });
        return result.canceled ? null : result.filePaths[0] ?? null;
      },
      async selectConfigImport() {
        const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'ICRLogin Profile', extensions: ['json'] }] });
        return result.canceled ? null : result.filePaths[0] ?? null;
      },
      async selectConfigExport(profileName) {
        const safeName = profileName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'profile';
        const result = await dialog.showSaveDialog({ defaultPath: `${safeName}.icrprofile.json`, filters: [{ name: 'ICRLogin Profile', extensions: ['json'] }] });
        return result.canceled ? null : result.filePath ?? null;
      }
    });

    try {
      const apiSettings = resolveLocalApiSettings(process.env, paths, bootSettings.localApiPort);
      const tokenStore = new EncryptedApiTokenStore(apiSettings.tokenFile, secretStore);
      const bearerToken = await resolveApiToken(process.env, tokenStore);
      apiServer = new LocalApiServer({ port: apiSettings.port, services, ...(bearerToken ? { bearerToken } : {}) });
      await apiServer.start();
    } catch (error) {
      const code = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
      console.error(`[ICRLogin] Local API unavailable (${code})`);
      apiServer = null;
    }
  }

  registerPhase6IpcHandlers(ipcMain, services, startupRecovery);
  registerPhase7IpcHandlers(ipcMain, {
    settings: settingsStore,
    setLaunchAtLogin: (enabled) => app.setLoginItemSettings({ openAtLogin: enabled }),
    browserVersions: services?.browserVersions ?? null
  });

  const mainDir = moduleDirectory(import.meta.url);
  const window = new BrowserWindow(createSecureWindowOptions(join(mainDir, '../preload/index.js')));
  mainWindow = window;
  window.on('closed', () => { if (mainWindow === window) mainWindow = null; });
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) await window.loadURL(devUrl);
  else await window.loadFile(join(mainDir, '../renderer/index.html'));

  let disposeTray: (() => void) | null = null;
  try {
    const icon = await app.getFileIcon(process.execPath, { size: 'small' });
    const tray = new Tray(icon);
    const onShow = () => { showAndFocusMainWindow(window); };
    const menu = Menu.buildFromTemplate(createTrayMenuTemplate(onShow, () => app.quit()));
    disposeTray = bindTray(tray as unknown as TrayPort, { menu, onShow });
  } catch {
    disposeTray = null;
  }

  let shutdownStarted = false;
  let closeFlowStarted = false;
  let closeApproved = false;
  window.on('close', (event) => {
    if (shutdownStarted || closeApproved) return;
    event.preventDefault();
    if (closeFlowStarted) return;
    closeFlowStarted = true;
    void (async () => {
      const currentSettings = await settingsStore.read();
      const runningRuntimeCount = services?.registry.list().length ?? 0;
      let action = resolveWindowCloseAction(currentSettings.closeBehavior, runningRuntimeCount);
      if (action === 'tray' && !disposeTray) action = runningRuntimeCount > 0 ? 'prompt' : 'quit';
      if (action === 'tray') {
        window.hide();
        closeFlowStarted = false;
        return;
      }
      if (action === 'prompt') {
        const answer = await dialog.showMessageBox(window, {
          type: 'warning',
          title: 'Running browser profiles',
          message: `${runningRuntimeCount} managed Chromium profile${runningRuntimeCount === 1 ? ' is' : 's are'} still running.`,
          detail: 'Quitting ICRLogin will leave those Chromium processes running. They can be reconciled the next time ICRLogin starts.',
          buttons: ['Cancel', 'Quit ICRLogin'], defaultId: 0, cancelId: 0, noLink: true
        });
        if (answer.response !== 1) { closeFlowStarted = false; return; }
      }
      closeApproved = true;
      window.close();
    })().catch(() => { closeFlowStarted = false; });
  });

  app.on('before-quit', (event) => {
    if (shutdownStarted) return;
    event.preventDefault();
    shutdownStarted = true;
    void (async () => {
      services?.monitoring.stop();
      updates.dispose();
      try { disposeTray?.(); } catch { /* best effort */ }
      try { await apiServer?.stop(); }
      catch { /* Shutdown remains best-effort; never log tokens or internal paths. */ }
      finally { db.close(); app.quit(); }
    })();
  });
}

const ownsInstance = acquireSingleInstance({
  requestLock: () => app.requestSingleInstanceLock(),
  registerSecondInstance: (listener) => { app.on('second-instance', listener); },
  quit: () => app.quit()
}, () => mainWindow);
if (ownsInstance) void bootstrap();
app.on('window-all-closed', () => app.quit());
