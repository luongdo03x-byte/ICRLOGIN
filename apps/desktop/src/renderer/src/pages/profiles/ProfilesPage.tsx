import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DesktopProfileListItem } from '@icrlogin/shared';
import { icrClient } from '../../api/icr-client.js';
import {
  filterAndSortProfiles,
  nextProfileAction,
  type ProfileSort,
  type ProfileStatusFilter,
  type ProxyPresenceFilter
} from './profiles-model.js';

export interface ProfilesPageProps {
  onCreate?(): void;
  onEdit?(profile: DesktopProfileListItem): void;
}

function formatLastUsed(value: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function statusLabel(state: string): string {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

function canDeleteProfile(state: string): boolean {
  return state === 'stopped';
}

function actionLabel(state: string, action: 'start' | 'stop' | null): string {
  if (action === 'stop') return 'Stop';
  if (action === 'start') return 'Open';
  return state === 'starting' || state === 'stopping' ? 'Working…' : 'Unavailable';
}

export function ProfilesPage({ onCreate, onEdit }: ProfilesPageProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ProfileStatusFilter>('all');
  const [groupId, setGroupId] = useState<string>('all');
  const [proxyPresence, setProxyPresence] = useState<ProxyPresenceFilter>('all');
  const [sort, setSort] = useState<ProfileSort>('lastUsed');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const profiles = useQuery({
    queryKey: ['profiles'],
    queryFn: icrClient.profiles.list,
    refetchInterval: (query) => query.state.data?.some((row) => row.runtimeState !== 'stopped') ? 2000 : false
  });
  const groups = useQuery({ queryKey: ['groups'], queryFn: icrClient.groups.list });
  const proxies = useQuery({ queryKey: ['proxies'], queryFn: icrClient.proxies.list });

  const action = useMutation({
    mutationFn: async ({ id, kind }: { id: string; kind: 'start' | 'stop' }) =>
      kind === 'start' ? icrClient.profiles.start(id) : icrClient.profiles.stop(id),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profiles'] }),
        queryClient.invalidateQueries({ queryKey: ['health'] })
      ]);
    }
  });
  const remove = useMutation({
    mutationFn: icrClient.profiles.delete,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['profiles'] })
  });

  const groupNames = useMemo(() => new Map((groups.data ?? []).map((item) => [item.id, item.name])), [groups.data]);
  const proxyNames = useMemo(() => new Map((proxies.data ?? []).map((item) => [item.id, item.name])), [proxies.data]);
  const rows = useMemo(
    () => filterAndSortProfiles(
      (profiles.data ?? []).map((row) => ({
        ...row,
        groupName: row.groupId ? groupNames.get(row.groupId) : 'Ungrouped',
        proxyName: row.proxyId ? proxyNames.get(row.proxyId) : 'Direct'
      })),
      { search, status, groupId, proxyPresence, sort }
    ),
    [profiles.data, groupNames, proxyNames, search, status, groupId, proxyPresence, sort]
  );

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const runSelected = async (kind: 'start' | 'stop') => {
    const targets = (profiles.data ?? []).filter(
      (row) => selected.has(row.id) && nextProfileAction(row.runtimeState) === kind
    );
    await Promise.allSettled(targets.map((row) =>
      kind === 'start' ? icrClient.profiles.start(row.id) : icrClient.profiles.stop(row.id)
    );
    setSelected(new Set());
    await queryClient.invalidateQueries({ queryKey: ['profiles'] });
  };

  if (profiles.isError) return <div className="error-panel">Unable to load profiles.</div>;

  return <div className="page-frame profiles-page">
    <header className="page-header">
      <div>
        <p className="eyebrow">BROWSER PROFILES</p>
        <h1>Profiles</h1>
        <p className="page-subtitle">Isolated Chromium workspaces, runtime state and launch controls.</p>
      </div>
      <button className="btn primary" type="button" onClick={onCreate}>+ Create profile</button>
    </header>

    <div className="toolbar">
      <input className="search-input" aria-label="Search profiles" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search profiles, browser, proxy…" />
      <select aria-label="Filter status" value={status} onChange={(event) => setStatus(event.target.value as ProfileStatusFilter)}>
        <option value="all">All statuses</option>
        <option value="running">Running</option>
        <option value="stopped">Stopped</option>
        <option value="error">Error</option>
      </select>
      <select aria-label="Filter group" value={groupId} onChange={(event) => setGroupId(event.target.value)}>
        <option value="all">All groups</option>
        <option value="ungrouped">Ungrouped</option>
        {(groups.data ?? []).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
      </select>
      <select aria-label="Filter proxy" value={proxyPresence} onChange={(event) => setProxyPresence(event.target.value as ProxyPresenceFilter)}>
        <option value="all">Any proxy</option>
        <option value="with">Has proxy</option>
        <option value="without">No proxy</option>
      </select>
      <select aria-label="Sort profiles" value={sort} onChange={(event) => setSort(event.target.value as ProfileSort)}>
        <option value="lastUsed">Last used</option>
        <option value="name">Name</option>
        <option value="browser">Browser</option>
      </select>
      {selected.size > 0 && <div className="selection-tools">
        <span>{selected.size} selected</span>
        <button className="btn ghost" onClick={() => void runSelected('start')}>Open selected</button>
        <button className="btn ghost" onClick={() => void runSelected('stop')}>Stop selected</button>
      </div>}
    </div>

    <div className="table-card">
      <table className="data-table">
        <thead><tr>
          <th className="check-col"><input type="checkbox" aria-label="Select all profiles" checked={rows.length > 0 && rows.every((row) => selected.has(row.id))} onChange={() => setSelected(rows.every((row) => selected.has(row.id)) ? new Set() : new Set(rows.map((row) => row.id)))} /></th>
          <th>Name</th><th>Status</th><th>Group</th><th>Browser</th><th>Proxy</th><th>User-Agent</th><th>Last used</th><th className="actions-col">Actions</th>
        </tr></thead>
        <tbody>
          {rows.map((row) => {
            const nextAction = nextProfileAction(row.runtimeState);
            return <tr key={row.id}>
              <td><input type="checkbox" aria-label={`Select ${row.name}`} checked={selected.has(row.id)} onChange={() => toggle(row.id)} /></td>
              <td><div className="profile-name">{row.name}</div><div className="muted mono">{row.id.slice(0, 8)}</div></td>
              <td><span className={`status-badge status-${row.runtimeState}`}>{statusLabel(row.runtimeState)}</span></td>
              <td>{row.groupName}</td>
              <td><span className="version-pill">{row.browserVersion}</span></td>
              <td>{row.proxyName}</td>
              <td className="truncate-cell" title={row.userAgent ?? 'Default'}>{row.userAgent ?? 'Default'}</td>
              <td className="muted">{formatLastUsed(row.lastUsedAt)}</td>
              <td><div className="row-actions">
                <button className={nextAction === 'stop' ? 'btn danger-soft' : 'btn success-soft'} disabled={action.isPending || nextAction === null} onClick={() => { if (nextAction) action.mutate({ id: row.id, kind: nextAction }); }}>{actionLabel(row.runtimeState, nextAction)}</button>
                <button className="icon-btn" aria-label={`Edit ${row.name}`} onClick={() => onEdit?.(row)}>Edit</button>
                <button className="icon-btn" aria-label={`Delete ${row.name}`} disabled={!canDeleteProfile(row.runtimeState) || remove.isPending} onClick={() => remove.mutate(row.id)}>Delete</button>
              </div></td>
            </tr>;
          })}
          {rows.length === 0 && !profiles.isLoading && <tr><td colSpan={9}><div className="table-empty">No profiles match the current filters.</div></td></tr>}
        </tbody>
      </table>
      {profiles.isLoading && <div className="table-loading">Loading profiles…</div>}
    </div>
  </div>;
}
