import type { ProfileLaunchProgress } from '@icrlogin/shared';

export type ProfileStatusFilter='all'|'running'|'stopped'|'error';
export type ProfileSort='lastUsed'|'name'|'browser';
export type ProxyPresenceFilter='all'|'with'|'without';
export type BulkProfileAction='start'|'stop'|'moveGroup'|'assignProxy'|'addTags'|'removeTags'|'delete';
export interface ProfileListLike{id:string;name:string;browserVersion:string;groupId:string|null;proxyId:string|null;userAgent:string|null;runtimeState:string;lastUsedAt:string|null;groupName?:string;proxyName?:string;tagIds?:readonly string[];tagNames?:readonly string[];}
export interface ProfileFilterOptions{search:string;status:ProfileStatusFilter;groupId:string|'all'|'ungrouped';proxyPresence:ProxyPresenceFilter;sort:ProfileSort;tagIds?:readonly string[];}
function matchesStatus(state:string,filter:ProfileStatusFilter):boolean{if(filter==='all')return true;if(filter==='running')return state==='running';if(filter==='stopped')return state==='stopped';return state==='crashed'||state==='error';}
export function filterAndSortProfiles<T extends ProfileListLike>(rows:readonly T[],options:ProfileFilterOptions):T[]{const search=options.search.trim().toLowerCase();const requiredTags=new Set(options.tagIds??[]);return[...rows].filter(row=>{const searchable=`${row.name} ${row.browserVersion} ${row.userAgent??''} ${row.groupName??''} ${row.proxyName??''} ${(row.tagNames??[]).join(' ')}`.toLowerCase();if(search&&!searchable.includes(search))return false;if(requiredTags.size>0&&![...requiredTags].every(id=>(row.tagIds??[]).includes(id)))return false;if(!matchesStatus(row.runtimeState,options.status))return false;if(options.groupId==='ungrouped'&&row.groupId!==null)return false;if(options.groupId!=='all'&&options.groupId!=='ungrouped'&&row.groupId!==options.groupId)return false;if(options.proxyPresence==='with'&&row.proxyId===null)return false;if(options.proxyPresence==='without'&&row.proxyId!==null)return false;return true;}).sort((a,b)=>{if(options.sort==='name')return a.name.localeCompare(b.name);if(options.sort==='browser')return b.browserVersion.localeCompare(a.browserVersion,undefined,{numeric:true});const at=a.lastUsedAt?Date.parse(a.lastUsedAt):-Infinity;const bt=b.lastUsedAt?Date.parse(b.lastUsedAt):-Infinity;return bt-at||a.name.localeCompare(b.name);});}
export function nextProfileAction(runtimeState:string):'start'|'stop'|null{if(runtimeState==='running')return'stop';if(runtimeState==='stopped')return'start';return null;}
export function availableBulkActions(states:readonly string[]):BulkProfileAction[]{if(states.length===0)return[];const shared:BulkProfileAction[]=['moveGroup','assignProxy','addTags','removeTags'];if(states.every(state=>state==='stopped'))return['start',...shared,'delete'];if(states.every(state=>state==='running'))return['stop',...shared];return shared;}
export function failedBulkIds(results:readonly {id:string;success:boolean}[]):string[]{return results.filter(result=>!result.success).map(result=>result.id);}
export function profileCloneLabels(){return{config:'Clone configuration',full:'Clone full profile',template:'Save as template'} as const;}

const PROFILE_LAUNCH_LABELS: Record<ProfileLaunchProgress['stage'], string> = {
  idle: 'Idle',
  'resolving-network': 'Resolving network…',
  'resolving-geo': 'Resolving GeoIP…',
  'downloading-browser': 'Downloading Chromium…',
  'verifying-browser': 'Verifying Chromium…',
  'installing-browser': 'Installing Chromium…',
  'preparing-runtime': 'Preparing runtime…',
  launching: 'Launching…',
  'waiting-cdp': 'Connecting CDP…',
  'applying-environment': 'Applying environment…',
  running: 'Running',
  failed: 'Failed'
};

export function profileLaunchProgressLabel(progress: ProfileLaunchProgress): string {
  const percent = progress.percent === null ? '' : ` ${Math.round(progress.percent)}%`;
  const stale = progress.staleNetworkIdentity ? ' · Geo cache' : '';
  return `${PROFILE_LAUNCH_LABELS[progress.stage]}${percent}${stale}`;
}

export function isProfileLaunchActive(progress: ProfileLaunchProgress | undefined): boolean {
  return Boolean(progress && progress.stage !== 'running' && progress.stage !== 'failed' && progress.stage !== 'idle');
}
