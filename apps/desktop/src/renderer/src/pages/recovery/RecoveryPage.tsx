import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { icrClient } from '../../api/icr-client.js';

function formatBytes(value: number | null): string {
  if (value === null) return 'Unavailable';
  const mib = value / (1024 * 1024);
  return `${mib.toFixed(mib >= 100 ? 0 : 1)} MiB`;
}

export function RecoveryPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string>('');
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: icrClient.profiles.list });
  const backups = useQuery({ queryKey: ['backups'], queryFn: icrClient.recovery.listBackups });
  const trash = useQuery({ queryKey: ['trash'], queryFn: icrClient.recovery.listTrash });
  const recoveryStatus = useQuery({ queryKey: ['startup-recovery'], queryFn: icrClient.monitoring.recoveryStatus, staleTime: Infinity });
  const metrics = useQuery({ queryKey: ['process-metrics'], queryFn: icrClient.monitoring.snapshot, refetchInterval: 5000 });

  const refresh = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['profiles'] }),
    queryClient.invalidateQueries({ queryKey: ['backups'] }),
    queryClient.invalidateQueries({ queryKey: ['trash'] }),
    queryClient.invalidateQueries({ queryKey: ['process-metrics'] })
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

  const profileNames = new Map((profiles.data ?? []).map((profile) => [profile.id, profile.name]));
  return <div className="page-frame">
    <header className="page-header">
      <div><p className="eyebrow">DATA & RECOVERY</p><h1>Backup & Recovery</h1><p className="page-subtitle">Profile archives, config transfer, startup health, monitoring and Trash.</p></div>
      <div className="page-header-actions">
        <button className="btn" type="button" disabled={operation.isPending} onClick={importConfig}>Import config</button>
        <button className="btn primary" type="button" disabled={operation.isPending} onClick={restoreBackup}>Restore backup</button>
      </div>
    </header>
    {message && <div className="info-panel">{message}</div>}

    <section className="table-card">
      <div className="section-header"><div><h2>Startup health</h2><p className="muted">Integrity checks are non-destructive; corruption never triggers an automatic database reset.</p></div></div>
      <table className="data-table"><thead><tr><th>Database</th><th>SQLite quick check</th><th>Recovered staging</th><th>Cleanup errors</th></tr></thead><tbody>
        <tr><td>{recoveryStatus.data?.databaseHealthy ? 'Healthy' : recoveryStatus.isLoading ? 'Checking…' : 'Recovery required'}</td><td>{recoveryStatus.data?.quickCheck ?? '—'}</td><td>{recoveryStatus.data?.cleanedEntries ?? 0}</td><td>{recoveryStatus.data?.cleanupErrors ?? 0}</td></tr>
      </tbody></table>
    </section>

    <section className="table-card">
      <div className="section-header"><div><h2>Running browser resources</h2><p className="muted">Managed Chromium CPU and RAM are sampled every 5 seconds.</p></div></div>
      <table className="data-table"><thead><tr><th>Profile</th><th>PID</th><th>CPU</th><th>RAM</th><th>Status</th></tr></thead><tbody>
        {(metrics.data ?? []).map((item) => <tr key={`${item.profileId}-${item.pid}`}><td>{profileNames.get(item.profileId) ?? item.profileId}</td><td>{item.pid}</td><td>{item.cpuPercent === null ? 'Unavailable' : `${item.cpuPercent.toFixed(1)}%`}</td><td>{formatBytes(item.workingSetBytes)}</td><td>{item.status}</td></tr>)}
        {!metrics.isLoading && (metrics.data ?? []).length === 0 && <tr><td colSpan={5}><div className="table-empty">No managed Chromium process is running.</div></td></tr>}
      </tbody></table>
    </section>

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
