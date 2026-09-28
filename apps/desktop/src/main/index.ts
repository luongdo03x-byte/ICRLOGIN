import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import { ensureAppPaths, HttpBrowserArtifactProvider, JsonFileBrowserArtifactProvider, openDatabase, runMigrations, RuntimeReconciler, waitForCdp } from '@icrlogin/core';
import { createAppServices } from './app-services.js';
import { createSecureWindowOptions, maskDataRoot, moduleDirectory, prepareUserDataRoot, resolveBrowserManifestSettings } from './config.js';
import { registerIpcHandlers } from './ipc.js';
import { ElectronSafeStorageSecretStore } from './secret-store.js';
import { WindowsProcessInspector } from './windows-process-inspector.js';

async function bootstrap():Promise<void>{const localBase=process.env.LOCALAPPDATA??app.getPath('appData');const{dataRoot,paths}=await prepareUserDataRoot(localBase,ensureAppPaths,(name,path)=>app.setPath(name,path));await app.whenReady();const db=openDatabase(join(paths.dataDir,'icrlogin.db'));runMigrations(db);const secretStore=new ElectronSafeStorageSecretStore(safeStorage);const manifestSettings=resolveBrowserManifestSettings(paths,process.env.ICRLOGIN_BROWSER_MANIFEST_URL);const browserArtifactProvider=manifestSettings.manifestUrl?new HttpBrowserArtifactProvider(manifestSettings.manifestUrl,manifestSettings.cachePath):new JsonFileBrowserArtifactProvider(manifestSettings.cachePath);const services=createAppServices({db,paths,secretStore,browserArtifactProvider});const reconciler=new RuntimeReconciler({runtimeSessions:services.runtimeSessions,registry:services.registry,processInspector:new WindowsProcessInspector(),cdpProbe:waitForCdp,paths});await reconciler.reconcile();registerIpcHandlers(ipcMain,services,{dataRootLabel:maskDataRoot(dataRoot)});const mainDir=moduleDirectory(import.meta.url);const window=new BrowserWindow(createSecureWindowOptions(join(mainDir,'../preload/index.js')));const devUrl=process.env.ELECTRON_RENDERER_URL;if(devUrl)await window.loadURL(devUrl);else await window.loadFile(join(mainDir,'../renderer/index.html'));app.on('before-quit',()=>db.close());}
void bootstrap();app.on('window-all-closed',()=>app.quit());
