import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { icrClient } from '../../api/icr-client.js';

export function RecoveryPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string>('');
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: icrClient.profiles.list });
  const backups = useQuery({ queryKey: ['backups'], queryFn: icrClient.recovery.listBackups });
  const trash = useQuery({ queryKey: ['trash'], queryFn: icrClient.recovery.listTrash });

  const refresh = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['profiles'] }),
    queryClient.invalidateQueries({ queryKey: ['backups'] }),
    queryClient.invalidateQueries({ queryKey: ['trash'] })
  ]);
  const operation = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: async () => { setMessage('Operation completed.'); await refresh(); },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Operation failed.')
  });

  const restoreBackup = () => operation.mutate(async () => {
    const result = await icrClient.recovery.restoreBackup();
    if (result) setMessage(result.warnings.length ? `Restored with warnings: ${result.warnings.join(', ')}` : 'Backup restored.');
    return result;
  });
  const importConfig = () => operation.mutate(async () => {
    const result = await icrClient.recovery.importConfig();
    if (result) setMessage(result.warnings.length ? `Imported with warnings: ${result.warnings.join(', ')}` : 'Profile imported.');
    return result;
  });

  return <div className="page-frame">
    <header className="page-header">
      <div><p className="eyebrow">DATA & RECOVERY</p><h1>Backup & Recovery</h1><p className="page-subtitle">Profile archives, config transfer, restore history and Trash.</p></div>
      <div className="page-header-actions">
        <button className="btn" type="button" disabled={operation.isPending} onClick={importConfig}>Import config</button>
        <button className="btn primary" type="button" disabled={operation.isPending} onClick={restoreBackup}>Restore backup</button>
      </div>
    </header>
    {message && <div className="info-panel">{message}</div>}

    <section className="table-card">
      <div className="section-header"><div><h2>Profiles</h2><p className="muted">Metadata backup works while stopped or running; full backup requires stopped.</p></div></div>
      <table className="data-table"><thead><tr><th>Name</th><th>Browser</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {(profiles.data ?? []).map((profile) => <tr key={profile.id}><td>{profile.name}</td><td>{profile.browserVersion}</td><td><span className={`status-badge status-${profile.runtimeState}`}>{profile.runtimeState}</span></td><td><div className="row-actions">
          <button className="btn ghost" disabled={operation.isPending} onClick={() => operation.mutate(() => icrClient.recovery.backup(profile.id, 'metadata'))}>Backup metadata</button>
          <button className="btn ghost" disabled={operation.isPending || profile.runtimeState !== 'stopped'} onClick={() => operation.mutate(() => icrClient.recovery.backup(profile.id, 'full'))}>Full backup</button>
          <button className="btn ghost" disabled={operation.isPending} onClick={() => operation.mutate(() => icrClient.recovery.exportConfig(profile.id))}>Export config</button>
        </div></td></tr>)}
        {!profiles.isLoading && (profiles.data ?? []).length === 0 && <tr><td colSpan={4}><div className="table-empty">No active profiles.</div></td></tr>}
      </tbody></table>
    </section>

    <section className="table-card">
      <div className="section-header"><div><h2>Backup history</h2><p className="muted">History contains public backup metadata only.</p></div></div>
      <table className="data-table"><thead><tr><th>Created</th><th>Mode</th><th>Status</th><th>File</th></tr></thead><tbody>
        {(backups.data ?? []).map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString()}</td><td>{item.mode}</td><td>{item.status}</td><td className="mono">{item.fileName}</td></tr>)}
        {!backups.isLoading && (backups.data ?? []).length === 0 && <tr><td colSpan={4}><div className="table-empty">No backups yet.</div></td></tr>}
      </tbody></table>
    </section>

    <section className="table-card">
      <div className="section-header"><div><h2>Trash</h2><p className="muted">Restore a profile or permanently remove its data.</p></div></div>
      <table className="data-table"><thead><tr><th>Name</th><th>Deleted</th><th>Browser</th><th>Actions</th></tr></thead><tbody>
        {(trash.data ?? []).map((profile) => <tr key={profile.id}><td>{profile.name}</td><td>{profile.deletedAt ? new Date(profile.deletedAt).toLocaleString() : '—'}</td><td>{profile.browserVersion}</td><td><div className="row-actions">
          <button className="btn ghost" disabled={operation.isPending} onClick={() => operation.mutate(() => icrClient.recovery.restoreTrash(profile.id))}>Restore</button>
          <button className="btn danger-soft" disabled={operation.isPending} onClick={() => { if (window.confirm(`Permanently delete ${profile.name}? This cannot be undone.`)) operation.mutate(() => icrClient.recovery.permanentDelete(profile.id)); }}>Delete permanently</button>
        </div></td></tr>)}
        {!trash.isLoading && (trash.data ?? []).length === 0 && <tr><td colSpan={4}><div className="table-empty">Trash is empty.</div></td></tr>}
      </tbody></table>
    </section>
  </div>;
}
