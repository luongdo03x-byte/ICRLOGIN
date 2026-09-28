import { describe,expect,it } from 'vitest';
import { filterAndSortProfiles,nextProfileAction } from '../../src/renderer/src/pages/profiles/profiles-model.js';
const rows:any[]=[
{id:'1',name:'Beta Shop',browserVersion:'143',groupId:'g1',proxyId:'p1',userAgent:'UA',runtimeState:'running',lastUsedAt:'2026-09-28T10:00:00Z'},
{id:'2',name:'Alpha QA',browserVersion:'142',groupId:null,proxyId:null,userAgent:null,runtimeState:'stopped',lastUsedAt:null},
{id:'3',name:'Gamma',browserVersion:'143',groupId:'g2',proxyId:'p2',userAgent:'Mobile',runtimeState:'crashed',lastUsedAt:'2026-09-28T09:00:00Z'}
];
describe('profiles model',()=>{
it('combines search/status/group/proxy filters and deterministic sorting',()=>{expect(filterAndSortProfiles(rows,{search:'shop',status:'running',groupId:'g1',proxyPresence:'with',sort:'name'}).map(x=>x.id)).toEqual(['1']);expect(filterAndSortProfiles(rows,{search:'',status:'all',groupId:'all',proxyPresence:'all',sort:'name'}).map(x=>x.name)).toEqual(['Alpha QA','Beta Shop','Gamma']);expect(filterAndSortProfiles(rows,{search:'',status:'all',groupId:'all',proxyPresence:'all',sort:'lastUsed'}).map(x=>x.id)).toEqual(['1','3','2']);expect(filterAndSortProfiles(rows,{search:'',status:'all',groupId:'all',proxyPresence:'without',sort:'name'}).map(x=>x.id)).toEqual(['2']);expect(filterAndSortProfiles(rows,{search:'',status:'all',groupId:'all',proxyPresence:'with',sort:'name'}).map(x=>x.id)).toEqual(['1','3']);});
it('maps only stable runtime states to profile actions',()=>{expect(nextProfileAction('running')).toBe('stop');expect(nextProfileAction('stopped')).toBe('start');for(const state of ['starting','stopping','crashed','error'])expect(nextProfileAction(state)).toBe(null);});});
