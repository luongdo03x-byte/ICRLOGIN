import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { icrClient } from '../../api/icr-client.js';
import { extensionAssignmentSummary, extensionMutationDisabled, toExtensionRow } from './extensions-model.js';

type ExtensionAction =
  | { kind: 'toggle'; id: string; enabled: boolean }
  | { kind: 'delete'; id: string }
  | { kind: 'assignProfile' | 'removeProfile'; id: string; profileId: string }
  | { kind: 'assignGroup' | 'removeGroup'; id: string; groupId: string };

export function ExtensionsPage() {
  const queryClient = useQueryClient();
  const [sourcePath, setSourcePath] = useState('');
  const [importType, setImportType] = useState<'unpacked' | 'crx'>('unpacked');
  const [targetProfileId, setTargetProfileId] = useState('');
  const [targetGroupId, setTargetGroupId] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const extensions = useQuery({ queryKey: ['extensions'], queryFn: icrClient.extensions.list });
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: icrClient.profiles.list });
  const groups = useQuery({ queryKey: ['groups'], queryFn: icrClient.groups.list });
  const rows = useMemo(() => (extensions.data ?? []).map(toExtensionRow), [extensions.data]);
  const anyProfileRunning = (profiles.data ?? []).some((profile) => profile.runtimeState !== 'stopped');

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['extensions'] }),
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
    ]);
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      const path = sourcePath.trim();
      if (!path) throw new Error('Enter a local extension path.');
      return importType === 'crx' ? icrClient.extensions.importCrx(path) : icrClient.extensions.importUnpacked(path);
    },
    onSuccess: async () => { setSourcePath(''); setMessage(null); await refresh(); },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Unable to import extension')
  });

  const actionMutation = useMutation({
    mutationFn: async (action: ExtensionAction) => {
      switch (action.kind) {
        case 'toggle': return icrClient.extensions.setEnabled(action.id, action.enabled);
        case 'delete': return icrClient.extensions.delete(action.id);
        case 'assignProfile': return icrClient.extensions.assignToProfile(action.id, action.profileId);
        case 'removeProfile': return icrClient.extensions.removeFromProfile(action.id, action.profileId);
        case 'assignGroup': return icrClient.extensions.assignToGroup(action.id, action.groupId);
        case 'removeGroup': return icrClient.extensions.removeFromGroup(action.id, action.groupId);
      }
    },
    onSuccess: async () => { setMessage(null); await refresh(); },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Extension operation failed')
  });

  if (extensions.isError) return <div className="error-panel">Unable to load extensions.</div>;

  return <div className="page-frame extensions-page">
    <header className="page-header">
      <div><p className="eyebrow">LOCAL EXTENSIONS</p><h1>Extensions</h1><p className="page-subtitle">Import local Chromium extensions and assign them to profiles or groups.</p></div>
    </header>

    <div className="toolbar extension-import-toolbar">
      <select aria-label="Extension source type" value={importType} onChange={(event) => setImportType(event.target.value as 'unpacked' | 'crx')}>
        <option value="unpacked">Unpacked folder</option><option value="crx">CRX package</option>
      </select>
      <input className="search-input" aria-label="Local extension path" value={sourcePath} onChange={(event) => setSourcePath(event.target.value)} placeholder={importType === 'crx' ? 'C:\\path\\extension.crx' : 'C:\\path\\unpacked-extension'} />
      <button className="btn primary" disabled={importMutation.isPending || !sourcePath.trim()} onClick={() => importMutation.mutate()}>{importMutation.isPending ? 'Importing…' : 'Import'}</button>
      <span className="muted">Paths are handled only by the main process; managed internal paths are never returned to the renderer.</span>
    </div>

    <div className="toolbar">
      <select aria-label="Target profile" value={targetProfileId} onChange={(event) => setTargetProfileId(event.target.value)}>
        <option value="">Select profile</option>{(profiles.data ?? []).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
      </select>
      <select aria-label="Target group" value={targetGroupId} onChange={(event) => setTargetGroupId(event.target.value)}>
        <option value="">Select group</option>{(groups.data ?? []).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
      </select>
      {anyProfileRunning && <span className="warning-note">Some extension mutations are temporarily disabled while Chromium profiles are running.</span>}
    </div>

    {message && <div className="form-error">{message}</div>}

    <div className="table-card">
      <table className="data-table">
        <thead><tr><th>Name</th><th>Version</th><th>Source</th><th>Status</th><th>Assignments</th><th className="actions-col">Actions</th></tr></thead>
        <tbody>
          {rows.map((row) => {
            const locked = extensionMutationDisabled(row, anyProfileRunning);
            return <tr key={row.id}>
              <td><div className="profile-name">{row.name}</div><div className="muted mono">{row.id.slice(0, 8)}</div></td>
              <td><span className="version-pill">{row.version}</span></td>
              <td>{row.sourceType === 'crx' ? 'CRX' : 'Unpacked'}</td>
              <td><span className={`status-badge ${row.enabled ? 'status-running' : 'status-stopped'}`}>{row.enabled ? 'Enabled' : 'Disabled'}</span></td>
              <td>{extensionAssignmentSummary(row)}</td>
              <td><div className="row-actions wrap-actions">
                <button className="btn ghost" disabled={locked || actionMutation.isPending} onClick={() => actionMutation.mutate({ kind:'toggle', id:row.id, enabled:!row.enabled })}>{row.enabled ? 'Disable' : 'Enable'}</button>
                <button className="btn ghost" disabled={locked || !targetProfileId || actionMutation.isPending} onClick={() => actionMutation.mutate({ kind:'assignProfile', id:row.id, profileId:targetProfileId })}>Assign profile</button>
                <button className="btn ghost" disabled={locked || !targetProfileId || actionMutation.isPending} onClick={() => actionMutation.mutate({ kind:'removeProfile', id:row.id, profileId:targetProfileId })}>Unassign profile</button>
                <button className="btn ghost" disabled={locked || !targetGroupId || actionMutation.isPending} onClick={() => actionMutation.mutate({ kind:'assignGroup', id:row.id, groupId:targetGroupId })}>Assign group</button>
                <button className="btn ghost" disabled={locked || !targetGroupId || actionMutation.isPending} onClick={() => actionMutation.mutate({ kind:'removeGroup', id:row.id, groupId:targetGroupId })}>Unassign group</button>
                <button className="btn danger-soft" disabled={locked || actionMutation.isPending} onClick={() => actionMutation.mutate({ kind:'delete', id:row.id })}>Delete</button>
              </div></td>
            </tr>;
          })}
          {rows.length === 0 && !extensions.isLoading && <tr><td colSpan={6}><div className="table-empty">No extensions imported yet.</div></td></tr>}
        </tbody>
      </table>
      {extensions.isLoading && <div className="table-loading">Loading extensions…</div>}
    </div>
  </div>;
}
