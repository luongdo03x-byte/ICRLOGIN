import { access } from 'node:fs/promises';
import {
  AppError,
  DESKTOP_CHANNELS,
  DesktopPayloadSchemas,
  type ApiEnvelope,
  type BrowserDownloadProgressEvent,
  type ExtensionRecord,
  type ProxyPublic
} from '@icrlogin/shared';
import type { AppServices } from './app-services.js';
import { checkExecutableAvailable } from './browser-dto.js';

export interface IpcEventLike { sender: { send(channel:string,payload:unknown):void }; }
export interface IpcMainLike { handle(channel:string,handler:(event:IpcEventLike,payload?:unknown)=>unknown):void; }
export interface RegisterIpcOptions { dataRootLabel:string; }
interface Schema<T>{parse(value:unknown):T;}
interface InstalledBrowserLike{version:string;executablePath:string;sha256:string;artifactSize:number;installedAt:string;}

function parsePayload<T>(schema:Schema<T>,payload:unknown):T{try{return schema.parse(payload);}catch{throw new AppError('INVALID_REQUEST','Invalid desktop API payload');}}
function errorEnvelope(error:unknown):ApiEnvelope<never>{if(error instanceof AppError)return{ok:false,error:{code:error.code,message:error.message}};return{ok:false,error:{code:'INTERNAL_ERROR',message:'Internal error'}};}
async function respond<T>(operation:()=>Promise<T>|T):Promise<ApiEnvelope<T>>{try{return{ok:true,data:await operation()};}catch(error){return errorEnvelope(error) as ApiEnvelope<T>;}}
function sanitizeProxy(proxy:ProxyPublic):ProxyPublic{return{id:proxy.id,name:proxy.name,type:proxy.type,host:proxy.host,port:proxy.port,username:proxy.username,hasPassword:proxy.hasPassword,createdAt:proxy.createdAt,updatedAt:proxy.updatedAt};}
function sanitizeExtension(extension:any):ExtensionRecord{return{id:extension.id,name:extension.name,version:extension.version,sourceType:extension.sourceType,enabled:Boolean(extension.enabled),profileCount:Number(extension.profileCount??0),groupCount:Number(extension.groupCount??0),createdAt:extension.createdAt,updatedAt:extension.updatedAt};}
async function sanitizeInstalled(browser:InstalledBrowserLike,profilesUsing:number){return{version:browser.version,sha256:browser.sha256,artifactSize:browser.artifactSize,installedAt:browser.installedAt,executableAvailable:await checkExecutableAvailable(browser.executablePath,access),profilesUsing};}

async function ensureProfileStopped(services:AppServices,profileId:string,message='Stop the profile before changing this setting'):Promise<void>{
  if(services.browsers.getState(profileId)!=='stopped')throw new AppError('INVALID_REQUEST',message);
}

async function ensureExtensionMutationSafe(services:AppServices,extensionId:string):Promise<void>{
  const profiles=await services.profiles.list();
  for(const profile of profiles){
    if(services.browsers.getState(profile.id)==='stopped')continue;
    if(services.extensions.listForProfile(profile.id).some(extension=>extension.id===extensionId)){
      throw new AppError('INVALID_REQUEST','Stop affected profiles before changing this extension');
    }
  }
}

async function ensureGroupProfilesStopped(services:AppServices,groupId:string):Promise<void>{
  const profiles=await services.profiles.list();
  for(const profile of profiles){
    if(profile.groupId===groupId&&services.browsers.getState(profile.id)!=='stopped'){
      throw new AppError('INVALID_REQUEST','Stop affected profiles before changing group extensions');
    }
  }
}

export function registerIpcHandlers(ipcMain:IpcMainLike,services:AppServices,options:RegisterIpcOptions):void{
  ipcMain.handle(DESKTOP_CHANNELS.health,()=>respond(()=>({status:'ok' as const,dataRoot:options.dataRootLabel,runningRuntimeCount:services.registry.list().length})));
  ipcMain.handle(DESKTOP_CHANNELS.profilesList,()=>respond(async()=>{const profiles=await services.profiles.list();const tags=services.tags.listTagIdsByProfileIds(profiles.map(profile=>profile.id));return profiles.map(profile=>{const runtime=services.browsers.getRuntime(profile.id);return{...profile,runtimeState:services.browsers.getState(profile.id),runtimeStartedAt:runtime?.startedAt??null,tagIds:tags[profile.id]??[]};});}));
  ipcMain.handle(DESKTOP_CHANNELS.profilesGet,(_event,payload)=>respond(async()=>{const{id}=parsePayload(DesktopPayloadSchemas.id,payload);const profile=await services.profiles.get(id);if(!profile)throw new AppError('PROFILE_NOT_FOUND','Profile not found');const runtime=services.browsers.getRuntime(id);return{...profile,runtimeState:services.browsers.getState(id),runtimeStartedAt:runtime?.startedAt??null,tagIds:services.tags.listProfileTagIds(id)};}));
  ipcMain.handle(DESKTOP_CHANNELS.profilesCreate,(_event,payload)=>respond(async()=>{const{input}=parsePayload(DesktopPayloadSchemas.profileCreate,payload);return services.profiles.create(input);}));
  ipcMain.handle(DESKTOP_CHANNELS.profilesUpdate,(_event,payload)=>respond(async()=>{const{id,input}=parsePayload(DesktopPayloadSchemas.profileUpdate,payload);if(services.browsers.getState(id)!=='stopped'&&input.browserVersion!==undefined)throw new AppError('INVALID_REQUEST','Stop the profile before changing browser version');return services.profiles.update(id,input);}));
  ipcMain.handle(DESKTOP_CHANNELS.profilesDelete,(_event,payload)=>respond(async()=>{const{id}=parsePayload(DesktopPayloadSchemas.id,payload);await ensureProfileStopped(services,id,'Stop the profile before deleting it');await services.profiles.softDelete(id);return null;}));
  ipcMain.handle(DESKTOP_CHANNELS.profilesRestore,(_event,payload)=>respond(async()=>{const{id}=parsePayload(DesktopPayloadSchemas.id,payload);return services.profiles.restore(id);}));
  ipcMain.handle(DESKTOP_CHANNELS.profilesStart,(_event,payload)=>respond(async()=>{const{id}=parsePayload(DesktopPayloadSchemas.id,payload);const runtime=await services.browsers.start(id);return{state:runtime.state,startedAt:runtime.startedAt};}));
  ipcMain.handle(DESKTOP_CHANNELS.profilesStop,(_event,payload)=>respond(async()=>{const{id}=parsePayload(DesktopPayloadSchemas.id,payload);await services.browsers.stop(id);return null;}));
  ipcMain.handle(DESKTOP_CHANNELS.profilesClone,(_event,payload)=>respond(async()=>{const input=parsePayload(DesktopPayloadSchemas.profileClone,payload);if(input.mode==='full'){await ensureProfileStopped(services,input.sourceId,'Stop the source profile before full clone');return services.profileClones.cloneFull(input.sourceId,input.overrides);}return services.profileClones.cloneConfig(input.sourceId,input.overrides);}));

  ipcMain.handle(DESKTOP_CHANNELS.groupsList,()=>respond(()=>services.groups.list()));
  ipcMain.handle(DESKTOP_CHANNELS.groupsCreate,(_event,payload)=>respond(()=>{const{input}=parsePayload(DesktopPayloadSchemas.groupCreate,payload);return services.groups.create(input);}));
  ipcMain.handle(DESKTOP_CHANNELS.groupsUpdate,(_event,payload)=>respond(()=>{const{id,input}=parsePayload(DesktopPayloadSchemas.groupUpdate,payload);return services.groups.update(id,input);}));
  ipcMain.handle(DESKTOP_CHANNELS.groupsDelete,(_event,payload)=>respond(()=>{const{id}=parsePayload(DesktopPayloadSchemas.id,payload);services.groups.delete(id);return null;}));

  ipcMain.handle(DESKTOP_CHANNELS.proxiesList,()=>respond(async()=> (await services.proxies.list()).map(sanitizeProxy)));
  ipcMain.handle(DESKTOP_CHANNELS.proxiesGet,(_event,payload)=>respond(async()=>{const{id}=parsePayload(DesktopPayloadSchemas.id,payload);const proxy=await services.proxies.get(id);if(!proxy)throw new AppError('PROXY_INVALID','Proxy not found');return sanitizeProxy(proxy);}));
  ipcMain.handle(DESKTOP_CHANNELS.proxiesCreate,(_event,payload)=>respond(async()=>{const{input}=parsePayload(DesktopPayloadSchemas.proxyCreate,payload);return sanitizeProxy(await services.proxies.create(input));}));
  ipcMain.handle(DESKTOP_CHANNELS.proxiesUpdate,(_event,payload)=>respond(async()=>{const{id,input}=parsePayload(DesktopPayloadSchemas.proxyUpdate,payload);return sanitizeProxy(await services.proxies.update(id,input));}));
  ipcMain.handle(DESKTOP_CHANNELS.proxiesDelete,(_event,payload)=>respond(async()=>{const{id}=parsePayload(DesktopPayloadSchemas.id,payload);if(!(await services.proxies.get(id)))throw new AppError('PROXY_INVALID','Proxy not found');await services.proxies.delete(id);return null;}));

  ipcMain.handle(DESKTOP_CHANNELS.tagsList,()=>respond(()=>services.tags.list()));
  ipcMain.handle(DESKTOP_CHANNELS.tagsCreate,(_event,payload)=>respond(()=>{const{input}=parsePayload(DesktopPayloadSchemas.tagCreate,payload);return services.tags.create(input);}));
  ipcMain.handle(DESKTOP_CHANNELS.tagsUpdate,(_event,payload)=>respond(()=>{const{id,input}=parsePayload(DesktopPayloadSchemas.tagUpdate,payload);return services.tags.rename(id,input);}));
  ipcMain.handle(DESKTOP_CHANNELS.tagsDelete,(_event,payload)=>respond(()=>{const{id}=parsePayload(DesktopPayloadSchemas.id,payload);services.tags.delete(id);return null;}));
  ipcMain.handle(DESKTOP_CHANNELS.tagsSetProfile,(_event,payload)=>respond(()=>{const{id,tagIds}=parsePayload(DesktopPayloadSchemas.profileTags,payload);services.tags.setProfileTags(id,tagIds);return null;}));

  ipcMain.handle(DESKTOP_CHANNELS.templatesList,()=>respond(()=>services.templates.list()));
  ipcMain.handle(DESKTOP_CHANNELS.templatesSave,(_event,payload)=>respond(()=>{const{profileId,name}=parsePayload(DesktopPayloadSchemas.templateSave,payload);return services.templates.saveFromProfile(profileId,name);}));
  ipcMain.handle(DESKTOP_CHANNELS.templatesDelete,(_event,payload)=>respond(()=>{const{id}=parsePayload(DesktopPayloadSchemas.id,payload);services.templates.delete(id);return null;}));
  ipcMain.handle(DESKTOP_CHANNELS.templatesCreateProfile,(_event,payload)=>respond(async()=>{const{templateId,overrides}=parsePayload(DesktopPayloadSchemas.templateCreateProfile,payload);return services.templates.createProfile(templateId,overrides);}));

  ipcMain.handle(DESKTOP_CHANNELS.extensionsList,()=>respond(()=>services.extensions.list().map(sanitizeExtension)));
  ipcMain.handle(DESKTOP_CHANNELS.extensionsImportUnpacked,(_event,payload)=>respond(async()=>{const{sourcePath}=parsePayload(DesktopPayloadSchemas.extensionImport,payload);return sanitizeExtension(await services.extensions.importUnpacked(sourcePath));}));
  ipcMain.handle(DESKTOP_CHANNELS.extensionsImportCrx,(_event,payload)=>respond(async()=>{const{sourcePath}=parsePayload(DesktopPayloadSchemas.extensionImport,payload);return sanitizeExtension(await services.extensions.importCrx(sourcePath));}));
  ipcMain.handle(DESKTOP_CHANNELS.extensionsSetEnabled,(_event,payload)=>respond(async()=>{const{id,enabled}=parsePayload(DesktopPayloadSchemas.extensionEnabled,payload);await ensureExtensionMutationSafe(services,id);return sanitizeExtension(services.extensions.setEnabled(id,enabled));}));
  ipcMain.handle(DESKTOP_CHANNELS.extensionsDelete,(_event,payload)=>respond(async()=>{const{id}=parsePayload(DesktopPayloadSchemas.id,payload);await ensureExtensionMutationSafe(services,id);await services.extensions.delete(id);return null;}));
  ipcMain.handle(DESKTOP_CHANNELS.extensionsAssignProfile,(_event,payload)=>respond(async()=>{const{extensionId,targetId}=parsePayload(DesktopPayloadSchemas.extensionAssignment,payload);await ensureProfileStopped(services,targetId,'Stop the profile before changing extensions');services.extensions.assignToProfile(extensionId,targetId);return null;}));
  ipcMain.handle(DESKTOP_CHANNELS.extensionsRemoveProfile,(_event,payload)=>respond(async()=>{const{extensionId,targetId}=parsePayload(DesktopPayloadSchemas.extensionAssignment,payload);await ensureProfileStopped(services,targetId,'Stop the profile before changing extensions');services.extensions.removeFromProfile(extensionId,targetId);return null;}));
  ipcMain.handle(DESKTOP_CHANNELS.extensionsAssignGroup,(_event,payload)=>respond(async()=>{const{extensionId,targetId}=parsePayload(DesktopPayloadSchemas.extensionAssignment,payload);await ensureGroupProfilesStopped(services,targetId);services.extensions.assignToGroup(extensionId,targetId);return null;}));
  ipcMain.handle(DESKTOP_CHANNELS.extensionsRemoveGroup,(_event,payload)=>respond(async()=>{const{extensionId,targetId}=parsePayload(DesktopPayloadSchemas.extensionAssignment,payload);await ensureGroupProfilesStopped(services,targetId);services.extensions.removeFromGroup(extensionId,targetId);return null;}));
  ipcMain.handle(DESKTOP_CHANNELS.extensionsListForProfile,(_event,payload)=>respond(()=>{const{id}=parsePayload(DesktopPayloadSchemas.id,payload);return services.extensions.listForProfile(id).map(sanitizeExtension);}));

  ipcMain.handle(DESKTOP_CHANNELS.bulkStart,(_event,payload)=>respond(async()=>{const{ids,concurrency}=parsePayload(DesktopPayloadSchemas.bulkStart,payload);const results=await services.bulk.startProfiles(ids,concurrency);return results.map(item=>item.success?{id:item.id,success:true as const,data:{profileId:item.data.profileId,state:item.data.state,startedAt:item.data.startedAt}}:item);}));
  ipcMain.handle(DESKTOP_CHANNELS.bulkStop,(_event,payload)=>respond(async()=>{const{ids}=parsePayload(DesktopPayloadSchemas.bulkIds,payload);return services.bulk.stopProfiles(ids);}));
  ipcMain.handle(DESKTOP_CHANNELS.bulkMoveGroup,(_event,payload)=>respond(async()=>{const{ids,groupId}=parsePayload(DesktopPayloadSchemas.bulkMoveGroup,payload);return services.bulk.moveGroup(ids,groupId);}));
  ipcMain.handle(DESKTOP_CHANNELS.bulkAssignProxy,(_event,payload)=>respond(async()=>{const{ids,proxyId}=parsePayload(DesktopPayloadSchemas.bulkAssignProxy,payload);return services.bulk.assignProxy(ids,proxyId);}));
  ipcMain.handle(DESKTOP_CHANNELS.bulkAddTags,(_event,payload)=>respond(async()=>{const{ids,tagIds}=parsePayload(DesktopPayloadSchemas.bulkTags,payload);return services.bulk.addTags(ids,tagIds);}));
  ipcMain.handle(DESKTOP_CHANNELS.bulkRemoveTags,(_event,payload)=>respond(async()=>{const{ids,tagIds}=parsePayload(DesktopPayloadSchemas.bulkTags,payload);return services.bulk.removeTags(ids,tagIds);}));
  ipcMain.handle(DESKTOP_CHANNELS.bulkDelete,(_event,payload)=>respond(async()=>{const{ids}=parsePayload(DesktopPayloadSchemas.bulkIds,payload);return services.bulk.softDelete(ids);}));

  ipcMain.handle(DESKTOP_CHANNELS.browsersAvailable,()=>respond(async()=>{const[available,installed,stable]=await Promise.all([services.browserVersions.listAvailable(),Promise.resolve(services.browserVersions.listInstalled()),services.browserVersions.getStable()]);const installedVersions=new Set(installed.map(item=>item.version));return available.map(entry=>({version:entry.version,size:entry.size,isStable:entry.version===stable.version,isInstalled:installedVersions.has(entry.version)}));}));
  ipcMain.handle(DESKTOP_CHANNELS.browsersInstalled,()=>respond(async()=>{const profiles=await services.profiles.list();const usage=new Map<string,number>();for(const profile of profiles)usage.set(profile.browserVersion,(usage.get(profile.browserVersion)??0)+1);return Promise.all(services.browserVersions.listInstalled().map(browser=>sanitizeInstalled(browser,usage.get(browser.version)??0)));}));
  ipcMain.handle(DESKTOP_CHANNELS.browsersDownload,(event,payload)=>respond(async()=>{const{version}=parsePayload(DesktopPayloadSchemas.browserDownload,payload);const installed=await services.browserVersions.download(version,progress=>{const update:BrowserDownloadProgressEvent={version,...progress};event.sender.send(DESKTOP_CHANNELS.browserDownloadProgress,update);});const profiles=await services.profiles.list();const profilesUsing=profiles.filter(profile=>profile.browserVersion===version).length;return sanitizeInstalled(installed,profilesUsing);}));
}
