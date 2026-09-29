import {
  DESKTOP_CHANNELS,
  type ApiEnvelope,
  type BrowserDownloadProgressEvent,
  type IcrDesktopApi,
  type ProfileCloneMode
} from '@icrlogin/shared';

export type DesktopInvoke=(channel:string,payload?:unknown)=>Promise<ApiEnvelope<unknown>>;
export type DesktopSubscribe=(channel:string,listener:(payload:unknown)=>void)=>(()=>void);

export function createPublicBridge(invoke:DesktopInvoke,subscribe:DesktopSubscribe):IcrDesktopApi{
  return Object.freeze({
    health:()=>invoke(DESKTOP_CHANNELS.health),
    profiles:Object.freeze({
      list:()=>invoke(DESKTOP_CHANNELS.profilesList),
      get:(id:string)=>invoke(DESKTOP_CHANNELS.profilesGet,{id}),
      create:(input:unknown)=>invoke(DESKTOP_CHANNELS.profilesCreate,{input}),
      update:(id:string,input:unknown)=>invoke(DESKTOP_CHANNELS.profilesUpdate,{id,input}),
      delete:(id:string)=>invoke(DESKTOP_CHANNELS.profilesDelete,{id}),
      restore:(id:string)=>invoke(DESKTOP_CHANNELS.profilesRestore,{id}),
      start:(id:string)=>invoke(DESKTOP_CHANNELS.profilesStart,{id}),
      stop:(id:string)=>invoke(DESKTOP_CHANNELS.profilesStop,{id}),
      clone:(sourceId:string,mode:ProfileCloneMode,overrides?:unknown)=>invoke(DESKTOP_CHANNELS.profilesClone,{sourceId,mode,overrides})
    }),
    groups:Object.freeze({
      list:()=>invoke(DESKTOP_CHANNELS.groupsList),
      create:(input:unknown)=>invoke(DESKTOP_CHANNELS.groupsCreate,{input}),
      update:(id:string,input:unknown)=>invoke(DESKTOP_CHANNELS.groupsUpdate,{id,input}),
      delete:(id:string)=>invoke(DESKTOP_CHANNELS.groupsDelete,{id})
    }),
    proxies:Object.freeze({
      list:()=>invoke(DESKTOP_CHANNELS.proxiesList),
      get:(id:string)=>invoke(DESKTOP_CHANNELS.proxiesGet,{id}),
      create:(input:unknown)=>invoke(DESKTOP_CHANNELS.proxiesCreate,{input}),
      update:(id:string,input:unknown)=>invoke(DESKTOP_CHANNELS.proxiesUpdate,{id,input}),
      delete:(id:string)=>invoke(DESKTOP_CHANNELS.proxiesDelete,{id})
    }),
    tags:Object.freeze({
      list:()=>invoke(DESKTOP_CHANNELS.tagsList),
      create:(input:unknown)=>invoke(DESKTOP_CHANNELS.tagsCreate,{input}),
      update:(id:string,input:unknown)=>invoke(DESKTOP_CHANNELS.tagsUpdate,{id,input}),
      delete:(id:string)=>invoke(DESKTOP_CHANNELS.tagsDelete,{id}),
      setProfile:(id:string,tagIds:string[])=>invoke(DESKTOP_CHANNELS.tagsSetProfile,{id,tagIds})
    }),
    templates:Object.freeze({
      list:()=>invoke(DESKTOP_CHANNELS.templatesList),
      saveFromProfile:(profileId:string,name:string)=>invoke(DESKTOP_CHANNELS.templatesSave,{profileId,name}),
      delete:(id:string)=>invoke(DESKTOP_CHANNELS.templatesDelete,{id}),
      createProfile:(templateId:string,overrides?:unknown)=>invoke(DESKTOP_CHANNELS.templatesCreateProfile,{templateId,overrides})
    }),
    extensions:Object.freeze({
      list:()=>invoke(DESKTOP_CHANNELS.extensionsList),
      importUnpacked:(sourcePath:string)=>invoke(DESKTOP_CHANNELS.extensionsImportUnpacked,{sourcePath}),
      importCrx:(sourcePath:string)=>invoke(DESKTOP_CHANNELS.extensionsImportCrx,{sourcePath}),
      setEnabled:(id:string,enabled:boolean)=>invoke(DESKTOP_CHANNELS.extensionsSetEnabled,{id,enabled}),
      delete:(id:string)=>invoke(DESKTOP_CHANNELS.extensionsDelete,{id}),
      assignToProfile:(extensionId:string,profileId:string)=>invoke(DESKTOP_CHANNELS.extensionsAssignProfile,{extensionId,targetId:profileId}),
      removeFromProfile:(extensionId:string,profileId:string)=>invoke(DESKTOP_CHANNELS.extensionsRemoveProfile,{extensionId,targetId:profileId}),
      assignToGroup:(extensionId:string,groupId:string)=>invoke(DESKTOP_CHANNELS.extensionsAssignGroup,{extensionId,targetId:groupId}),
      removeFromGroup:(extensionId:string,groupId:string)=>invoke(DESKTOP_CHANNELS.extensionsRemoveGroup,{extensionId,targetId:groupId}),
      listForProfile:(profileId:string)=>invoke(DESKTOP_CHANNELS.extensionsListForProfile,{id:profileId})
    }),
    bulk:Object.freeze({
      start:(ids:string[],concurrency?:number)=>invoke(DESKTOP_CHANNELS.bulkStart,{ids,concurrency}),
      stop:(ids:string[])=>invoke(DESKTOP_CHANNELS.bulkStop,{ids}),
      moveGroup:(ids:string[],groupId:string|null)=>invoke(DESKTOP_CHANNELS.bulkMoveGroup,{ids,groupId}),
      assignProxy:(ids:string[],proxyId:string|null)=>invoke(DESKTOP_CHANNELS.bulkAssignProxy,{ids,proxyId}),
      addTags:(ids:string[],tagIds:string[])=>invoke(DESKTOP_CHANNELS.bulkAddTags,{ids,tagIds}),
      removeTags:(ids:string[],tagIds:string[])=>invoke(DESKTOP_CHANNELS.bulkRemoveTags,{ids,tagIds}),
      delete:(ids:string[])=>invoke(DESKTOP_CHANNELS.bulkDelete,{ids})
    }),
    browsers:Object.freeze({
      available:()=>invoke(DESKTOP_CHANNELS.browsersAvailable),
      installed:()=>invoke(DESKTOP_CHANNELS.browsersInstalled),
      download:(version:string)=>invoke(DESKTOP_CHANNELS.browsersDownload,{version}),
      onDownloadProgress:(listener:(progress:BrowserDownloadProgressEvent)=>void)=>subscribe(DESKTOP_CHANNELS.browserDownloadProgress,payload=>listener(payload as BrowserDownloadProgressEvent))
    })
  }) as unknown as IcrDesktopApi;
}
