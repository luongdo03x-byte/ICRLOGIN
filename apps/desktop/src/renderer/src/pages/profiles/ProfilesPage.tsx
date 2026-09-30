import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BulkItemResult, DesktopProfileListItem } from '@icrlogin/shared';
import { icrClient } from '../../api/icr-client.js';
import { BulkResultDialog } from './BulkResultDialog.js';
import { CloneProfileDialog } from './CloneProfileDialog.js';
import {
  availableBulkActions,
  filterAndSortProfiles,
  nextProfileAction,
  type BulkProfileAction,
  type ProfileSort,
  type ProfileStatusFilter,
  type ProxyPresenceFilter
} from './profiles-model.js';

export interface ProfilesPageProps {
  onCreate?(): void;
  onEdit?(profile: DesktopProfileListItem): void;
  onOpenTemplates?(): void;
}

type BulkIntent =
  | { kind: 'start' }
  | { kind: 'stop' }
  | { kind: 'delete' }
  | { kind: 'moveGroup'; groupId: string | null }
  | { kind: 'assignProxy'; proxyId: string | null }
  | { kind: 'addTags'; tagIds: string[] }
  | { kind: 'removeTags'; tagIds: string[] };

interface BulkDialogState {
  title: string;
  intent: BulkIntent;
  results: BulkItemResult<unknown>[];
}

function formatLastUsed(value: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}
function statusLabel(state: string): string { return state.charAt(0).toUpperCase() + state.slice(1); }
function canDeleteProfile(state: string): boolean { return state === 'stopped'; }
function actionLabel(state: string, action: 'start' | 'stop' | null): string { if (action === 'stop') return 'Stop'; if (action === 'start') return 'Open'; return state === 'starting' || state === 'stopping' ? 'Working…' : 'Unavailable'; }
function bulkTitle(intent: BulkIntent): string { switch (intent.kind) { case 'start': return 'Open selected profiles'; case 'stop': return 'Stop selected profiles'; case 'delete': return 'Delete selected profiles'; case 'moveGroup': return 'Move selected profiles'; case 'assignProxy': return 'Assign proxy'; case 'addTags': return 'Add tags'; case 'removeTags': return 'Remove tags'; } }
async function executeBulk(intent: BulkIntent, ids: string[]): Promise<BulkItemResult<unknown>[]> { switch (intent.kind) { case 'start': return icrClient.bulk.start(ids, 3); case 'stop': return icrClient.bulk.stop(ids); case 'delete': return icrClient.bulk.delete(ids); case 'moveGroup': return icrClient.bulk.moveGroup(ids, intent.groupId); case 'assignProxy': return icrClient.bulk.assignProxy(ids, intent.proxyId); case 'addTags': return icrClient.bulk.addTags(ids, intent.tagIds); case 'removeTags': return icrClient.bulk.removeTags(ids, intent.tagIds); } }

export function ProfilesPage({ onCreate, onEdit, onOpenTemplates }: ProfilesPageProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(''); const [status, setStatus] = useState<ProfileStatusFilter>('all'); const [groupId, setGroupId] = useState<string>('all'); const [proxyPresence, setProxyPresence] = useState<ProxyPresenceFilter>('all'); const [tagFilter, setTagFilter] = useState<string>('all'); const [sort, setSort] = useState<ProfileSort>('lastUsed');
  const [selected, setSelected] = useState<Set<string>>(() => new Set()); const [bulkGroupId, setBulkGroupId] = useState(''); const [bulkProxyId, setBulkProxyId] = useState(''); const [bulkTagId, setBulkTagId] = useState(''); const [bulkDialog, setBulkDialog] = useState<BulkDialogState | null>(null); const [cloneTarget, setCloneTarget] = useState<DesktopProfileListItem | null>(null);
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: icrClient.profiles.list, refetchInterval: (query) => query.state.data?.some((row) => row.runtimeState !== 'stopped') ? 2000 : false });
  const groups = useQuery({ queryKey: ['groups'], queryFn: icrClient.groups.list }); const proxies = useQuery({ queryKey: ['proxies'], queryFn: icrClient.proxies.list }); const tags = useQuery({ queryKey: ['tags'], queryFn: icrClient.tags.list });
  const action = useMutation({ mutationFn: async ({ id, kind }: { id: string; kind: 'start' | 'stop' }) => kind === 'start' ? icrClient.profiles.start(id) : icrClient.profiles.stop(id), onSettled: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['profiles'] }), queryClient.invalidateQueries({ queryKey: ['health'] })]); } });
  const remove = useMutation({ mutationFn: icrClient.profiles.delete, onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['profiles'] }) });
  const bulk = useMutation({ mutationFn: async ({ intent, ids }: { intent: BulkIntent; ids: string[] }) => ({ intent, results: await executeBulk(intent, ids) }), onSuccess: async ({ intent, results }) => { setBulkDialog({ title: bulkTitle(intent), intent, results }); setSelected(new Set()); await Promise.all([queryClient.invalidateQueries({ queryKey: ['profiles'] }), queryClient.invalidateQueries({ queryKey: ['groups'] }), queryClient.invalidateQueries({ queryKey: ['tags'] }), queryClient.invalidateQueries({ queryKey: ['health'] })]); } });
  const groupNames = useMemo(() => new Map((groups.data ?? []).map((item) => [item.id, item.name])), [groups.data]); const proxyNames = useMemo(() => new Map((proxies.data ?? []).map((item) => [item.id, item.name])), [proxies.data]); const tagNames = useMemo(() => new Map((tags.data ?? []).map((item) => [item.id, item.name])), [tags.data]);
  const rows = useMemo(() => filterAndSortProfiles((profiles.data ?? []).map((row) => ({ ...row, groupName: row.groupId ? groupNames.get(row.groupId) : 'Ungrouped', proxyName: row.proxyId ? proxyNames.get(row.proxyId) : 'Direct', tagNames: row.tagIds.map((id) => tagNames.get(id) ?? id) })), { search, status, groupId, proxyPresence, tagIds: tagFilter === 'all' ? [] : [tagFilter], sort }), [profiles.data, groupNames, proxyNames, tagNames, search, status, groupId, proxyPresence, tagFilter, sort]);
  const selectedProfiles = (profiles.data ?? []).filter((row) => selected.has(row.id)); const allowedBulkActions = new Set<BulkProfileAction>(availableBulkActions(selectedProfiles.map((row) => row.runtimeState)));
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const runBulk = (intent: BulkIntent, ids = [...selected]) => { if (ids.length === 0) return; bulk.mutate({ intent, ids }); };
  if (profiles.isError) return <div className="error-panel">Unable to load profiles.</div>;

  return <div className="page-frame profiles-page">
    <header className="page-header"><div><p className="eyebrow">BROWSER PROFILES</p><h1>Profiles</h1><p className="page-subtitle">Isolated Chromium workspaces, runtime state and launch controls.</p></div><div className="page-header-actions"><button className="btn" type="button" onClick={onOpenTemplates}>Templates</button><button className="btn primary" type="button" onClick={onCreate}>+ Create profile</button></div></header>
    <div className="toolbar"><input className="search-input" aria-label="Search profiles" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search profiles, browser, proxy, tag…"/><select aria-label="Filter status" value={status} onChange={(event) => setStatus(event.target.value as ProfileStatusFilter)}><option value="all">All statuses</option><option value="running">Running</option><option value="stopped">Stopped</option><option value="error">Error</option></select><select aria-label="Filter group" value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="all">All groups</option><option value="ungrouped">Ungrouped</option>{(groups.data ?? []).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><select aria-label="Filter proxy" value={proxyPresence} onChange={(event) => setProxyPresence(event.target.value as ProxyPresenceFilter)}><option value="all">Any proxy</option><option value="with">Has proxy</option><option value="without">No proxy</option></select><select aria-label="Filter tag" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="all">All tags</option>{(tags.data ?? []).map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select><select aria-label="Sort profiles" value={sort} onChange={(event) => setSort(event.target.value as ProfileSort)}><option value="lastUsed">Last used</option><option value="name">Name</option><option value="browser">Browser</option></select></div>
    {selected.size > 0 && <div className="bulk-toolbar"><strong>{selected.size} selected</strong>{allowedBulkActions.has('start')&&<button className="btn ghost" disabled={bulk.isPending} onClick={()=>runBulk({kind:'start'})}>Open</button>}{allowedBulkActions.has('stop')&&<button className="btn ghost" disabled={bulk.isPending} onClick={()=>runBulk({kind:'stop'})}>Stop</button>}{allowedBulkActions.has('moveGroup')&&<><select value={bulkGroupId} onChange={(event)=>setBulkGroupId(event.target.value)}><option value="">Ungrouped</option>{(groups.data??[]).map((group)=><option key={group.id} value={group.id}>{group.name}</option>)}</select><button className="btn ghost" disabled={bulk.isPending} onClick={()=>runBulk({kind:'moveGroup',groupId:bulkGroupId||null})}>Move group</button></>}{allowedBulkActions.has('assignProxy')&&<><select value={bulkProxyId} onChange={(event)=>setBulkProxyId(event.target.value)}><option value="">Direct</option>{(proxies.data??[]).map((proxy)=><option key={proxy.id} value={proxy.id}>{proxy.name}</option>)}</select><button className="btn ghost" disabled={bulk.isPending} onClick={()=>runBulk({kind:'assignProxy',proxyId:bulkProxyId||null})}>Assign proxy</button></>}{(allowedBulkActions.has('addTags')||allowedBulkActions.has('removeTags'))&&<select value={bulkTagId} onChange={(event)=>setBulkTagId(event.target.value)}><option value="">Select tag</option>{(tags.data??[]).map((tag)=><option key={tag.id} value={tag.id}>{tag.name}</option>)}</select>}{allowedBulkActions.has('addTags')&&<button className="btn ghost" disabled={bulk.isPending||!bulkTagId} onClick={()=>runBulk({kind:'addTags',tagIds:[bulkTagId]})}>Add tag</button>}{allowedBulkActions.has('removeTags')&&<button className="btn ghost" disabled={bulk.isPending||!bulkTagId} onClick={()=>runBulk({kind:'removeTags',tagIds:[bulkTagId]})}>Remove tag</button>}{allowedBulkActions.has('delete')&&<button className="btn danger-soft" disabled={bulk.isPending} onClick={()=>runBulk({kind:'delete'})}>Delete</button>}<button className="btn ghost" onClick={()=>setSelected(new Set())}>Clear</button></div>}
    <div className="table-card"><table className="data-table"><thead><tr><th className="check-col"><input type="checkbox" aria-label="Select all profiles" checked={rows.length>0&&rows.every((row)=>selected.has(row.id))} onChange={()=>setSelected(rows.every((row)=>selected.has(row.id))?new Set():new Set(rows.map((row)=>row.id)))}/></th><th>Name</th><th>Status</th><th>Group</th><th>Browser</th><th>Proxy</th><th>User-Agent</th><th>Last used</th><th className="actions-col">Actions</th></tr></thead><tbody>{rows.map((row)=>{const nextAction=nextProfileAction(row.runtimeState);return <tr key={row.id}><td><input type="checkbox" aria-label={`Select ${row.name}`} checked={selected.has(row.id)} onChange={()=>toggle(row.id)}/></td><td><div className="profile-name">{row.name}</div><div className="tag-row">{row.tagNames.map((name)=><span className="tag-chip" key={name}>{name}</span>)}</div><div className="muted mono">{row.id.slice(0,8)}</div></td><td><span className={`status-badge status-${row.runtimeState}`}>{statusLabel(row.runtimeState)}</span></td><td>{row.groupName}</td><td><span className="version-pill">{row.browserVersion}</span></td><td>{row.proxyName}</td><td className="truncate-cell" title={row.userAgent??'Default'}>{row.userAgent??'Default'}</td><td className="muted">{formatLastUsed(row.lastUsedAt)}</td><td><div className="row-actions"><button className={nextAction==='stop'?'btn danger-soft':'btn success-soft'} disabled={action.isPending||nextAction===null} onClick={()=>{if(nextAction)action.mutate({id:row.id,kind:nextAction});}}>{actionLabel(row.runtimeState,nextAction)}</button><button className="icon-btn" aria-label={`Edit ${row.name}`} onClick={()=>onEdit?.(row)}>Edit</button><button className="icon-btn" aria-label={`Clone ${row.name}`} onClick={()=>setCloneTarget(row)}>Clone</button><button className="icon-btn" aria-label={`Delete ${row.name}`} disabled={!canDeleteProfile(row.runtimeState)||remove.isPending} onClick={()=>remove.mutate(row.id)}>Delete</button></div></td></tr>;})}{rows.length===0&&!profiles.isLoading&&<tr><td colSpan={9}><div className="table-empty">No profiles match the current filters.</div></td></tr>}</tbody></table>{profiles.isLoading&&<div className="table-loading">Loading profiles…</div>}</div>
    <CloneProfileDialog profile={cloneTarget} onClose={()=>setCloneTarget(null)}/><BulkResultDialog title={bulkDialog?.title??'Bulk operation'} results={bulkDialog?.results??null} onClose={()=>setBulkDialog(null)} onRetry={(ids)=>{if(bulkDialog)bulk.mutate({intent:bulkDialog.intent,ids});}}/>
  </div>;
}
