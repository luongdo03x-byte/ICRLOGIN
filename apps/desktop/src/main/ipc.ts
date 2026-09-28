import { AppError, DESKTOP_CHANNELS, DesktopPayloadSchemas, type ApiEnvelope, type BrowserDownloadProgressEvent, type ProxyPublic } from '@icrlogin/shared';
import type { AppServices } from './app-services.js';

export interface IpcEventLike { sender: { send(channel:string,payload:unknown):void }; }
export interface IpcMainLike { handle(channel:string,handler:(event:IpcEventLike,payload?:unknown)=>unknown):void; }
export interface RegisterIpcOptions { dataRootLabel:string; }
interface Schema<T>{parse(value:unknown):T;}
interface InstalledBrowserLike{version:string;executablePath:string;sha256:string;artifactSize:number;installedAt:string;}

function parsePayload<T>(schema:Schema<T>,payload:unknown):T{try{return schema.parse(payload);}catch{throw new AppError('INVALID_REQUEST','Invalid desktop API payload');}}
function errorEnvelope(error:unknown):ApiEnvelope<never>{if(error instanceof AppError)return{ok:false,error:{code:error.code,message:error.message}};return{ok:false,error:{code:'INTERNAL_ERROR',message:'Internal error'}};}
async function respond<T>(operation:()=>Promise<T>|T):Promise<ApiEnvelope<T>>{try{return{ok:true,data:await operation()};}catch(error){return errorEnvelope(error) as ApiEnvelope<T>;}}
function sanitizeProxy(proxy:ProxyPublic):ProxyPublic{return{id:proxy.id,name:proxy.name,type:proxy.type,host:proxy.host,port:proxy.port,username:proxy.username,hasPassword:proxy.hasPassword,createdAt:proxy.createdAt,updatedAt:proxy.updatedAt};}
function sanitizeInstalled(browser:InstalledBrowserLike,profilesUsing:number){return{version:browser.version,sha256:browser.sha256,artifactSize:browser.artifactSize,installedAt:browser.installedAt,executableAvailable:Boolean(browser.executablePath),profilesUsing};}

export function registerIpcHandlers(ipcMain:IpcMainLike,services:AppServices,options:RegisterIpcOptions):void{
  ipcMain.handle(DESKTOP_CHANNELS.health,()=>respond(()=>({status:'ok' as const,dataRoot:options.dataRootLabel,runningRuntimeCount:services.registry.list().length})));
  ipcMain.handle(DESKTOP_CHANNELS.profilesList,()=>respond(async()=>{const profiles=await services.profiles.list();return profiles.map(profile=>{const runtime=services.registry.get(profile.id);return{...profile,runtimeState:runtime?.state??'stopped',runtimeStartedAt:runtime?.startedAt??null};});}));
  ipcMain.handle(DESKTOP_CHANNELS.profilesGet,(_event,payload)=>respond(async()=>{const{id}=parsePayload(DesktopPayloadSchemas.id,payload);const profile=await services.profiles.get(id);if(!profile)throw new AppError('PROFILE_NOT_FOUND','Profile not found');const runtime=services.registry.get(id);return{...profile,runtimeState:runtime?.state??'stopped',runtimeStartedAt:runtime?.startedAt??null};}));
  ipcMain.handle(DESKTOP_CHANNELS.profilesCreate,(_event,payload)=>respond(async()=>{const{input}=parsePayload(DesktopPayloadSchemas.profileCreate,payload);return services.profiles.create(input);}));
  ipcMain.handle(DESKTOP_CHANNELS.profilesUpdate,(_event,payload)=>respond(async()=>{const{id,input}=parsePayload(DesktopPayloadSchemas.profileUpdate,payload);if(services.registry.get(id)&&input.browserVersion!==undefined)throw new AppError('INVALID_REQUEST','Stop the profile before changing browser version');return services.profiles.update(id,input);}));
  ipcMain.handle(DESKTOP_CHANNELS.profilesDelete,(_event,payload)=>respond(async()=>{const{id}=parsePayload(DesktopPayloadSchemas.id,payload);if(services.registry.get(id))throw new AppError('INVALID_REQUEST','Stop the profile before deleting it');await services.profiles.softDelete(id);return null;}));
  ipcMain.handle(DESKTOP_CHANNELS.profilesRestore,(_event,payload)=>respond(async()=>{const{id}=parsePayload(DesktopPayloadSchemas.id,payload);return services.profiles.restore(id);}));
  ipcMain.handle(DESKTOP_CHANNELS.profilesStart,(_event,payload)=>respond(async()=>{const{id}=parsePayload(DesktopPayloadSchemas.id,payload);const runtime=await services.browsers.start(id);return{state:runtime.state,startedAt:runtime.startedAt};}));
  ipcMain.handle(DESKTOP_CHANNELS.profilesStop,(_event,payload)=>respond(async()=>{const{id}=parsePayload(DesktopPayloadSchemas.id,payload);await services.browsers.stop(id);return null;}));
  ipcMain.handle(DESKTOP_CHANNELS.groupsList,()=>respond(()=>services.groups.list()));
  ipcMain.handle(DESKTOP_CHANNELS.groupsCreate,(_event,payload)=>respond(()=>{const{input}=parsePayload(DesktopPayloadSchemas.groupCreate,payload);return services.groups.create(input);}));
  ipcMain.handle(DESKTOP_CHANNELS.groupsUpdate,(_event,payload)=>respond(()=>{const{id,input}=parsePayload(DesktopPayloadSchemas.groupUpdate,payload);return services.groups.update(id,input);}));
  ipcMain.handle(DESKTOP_CHANNELS.groupsDelete,(_event,payload)=>respond(()=>{const{id}=parsePayload(DesktopPayloadSchemas.id,payload);services.groups.delete(id);return null;}));
  ipcMain.handle(DESKTOP_CHANNELS.proxiesList,()=>respond(async()=> (await services.proxies.list()).map(sanitizeProxy)));
  ipcMain.handle(DESKTOP_CHANNELS.proxiesGet,(_event,payload)=>respond(async()=>{const{id}=parsePayload(DesktopPayloadSchemas.id,payload);const proxy=await services.proxies.get(id);if(!proxy)throw new AppError('PROXY_INVALID','Proxy not found');return sanitizeProxy(proxy);}));
  ipcMain.handle(DESKTOP_CHANNELS.proxiesCreate,(_event,payload)=>respond(async()=>{const{input}=parsePayload(DesktopPayloadSchemas.proxyCreate,payload);return sanitizeProxy(await services.proxies.create(input));}));
  ipcMain.handle(DESKTOP_CHANNELS.proxiesUpdate,(_event,payload)=>respond(async()=>{const{id,input}=parsePayload(DesktopPayloadSchemas.proxyUpdate,payload);return sanitizeProxy(await services.proxies.update(id,input));}));
  ipcMain.handle(DESKTOP_CHANNELS.proxiesDelete,(_event,payload)=>respond(async()=>{const{id}=parsePayload(DesktopPayloadSchemas.id,payload);if(!(await services.proxies.get(id)))throw new AppError('PROXY_INVALID','Proxy not found');await services.proxies.delete(id);return null;}));
  ipcMain.handle(DESKTOP_CHANNELS.browsersAvailable,()=>respond(async()=>{const[available,installed,stable]=await Promise.all([services.browserVersions.listAvailable(),Promise.resolve(services.browserVersions.listInstalled()),services.browserVersions.getStable()]);const installedVersions=new Set(installed.map(item=>item.version));return available.map(entry=>({version:entry.version,size:entry.size,isStable:entry.version===stable.version,isInstalled:installedVersions.has(entry.version)}));}));
  ipcMain.handle(DESKTOP_CHANNELS.browsersInstalled,()=>respond(async()=>{const profiles=await services.profiles.list();const usage=new Map<string,number>();for(const profile of profiles)usage.set(profile.browserVersion,(usage.get(profile.browserVersion)??0)+1);return services.browserVersions.listInstalled().map(browser=>sanitizeInstalled(browser,usage.get(browser.version)??0));}));
  ipcMain.handle(DESKTOP_CHANNELS.browsersDownload,(event,payload)=>respond(async()=>{const{version}=parsePayload(DesktopPayloadSchemas.browserDownload,payload);const installed=await services.browserVersions.download(version,progress=>{const update:BrowserDownloadProgressEvent={version,...progress};event.sender.send(DESKTOP_CHANNELS.browserDownloadProgress,update);});const profiles=await services.profiles.list();const profilesUsing=profiles.filter(profile=>profile.browserVersion===version).length;return sanitizeInstalled(installed,profilesUsing);}));
}
