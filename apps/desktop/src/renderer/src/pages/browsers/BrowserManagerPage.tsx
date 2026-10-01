import { useEffect, useMemo, useState } from 'react';
import type { BrowserDownloadProgressEvent } from '@icrlogin/shared';
import { icrClient } from '../../api/icr-client.js';
import { browserActionLabel, canRemoveBrowser, formatBytes, mergeBrowserRows, totalInstalledBytes } from './browser-manager-model.js';
import { useAvailableBrowsers, useDownloadBrowser, useInstalledBrowsers, useRefreshBrowsers, useRemoveBrowser } from './browser-queries.js';

type Tab = 'available' | 'installed';

export function BrowserManagerPage() {
  const available = useAvailableBrowsers();
  const installed = useInstalledBrowsers();
  const download = useDownloadBrowser();
  const remove = useRemoveBrowser();
  const refreshBrowsers = useRefreshBrowsers();
  const [tab, setTab] = useState<Tab>('available');
  const [progress, setProgress] = useState<Record<string, BrowserDownloadProgressEvent>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [activeVersion, setActiveVersion] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => icrClient.browsers.onDownloadProgress((event) => {
    setProgress((current) => ({ ...current, [event.version]: event }));
  }), []);

  const rows = useMemo(() => mergeBrowserRows(available.data ?? [], installed.data ?? []), [available.data, installed.data]);
  const installedBytes = useMemo(() => totalInstalledBytes(installed.data ?? []), [installed.data]);

  async function startDownload(version: string) {
    setMessage('');
    setFailed((current) => ({ ...current, [version]: false }));
    setActiveVersion(version);
    try {
      await download.mutateAsync(version);
    } catch {
      setFailed((current) => ({ ...current, [version]: true }));
    } finally {
      setActiveVersion(null);
    }
  }

  async function refresh() {
    setRefreshing(true);
    setMessage('');
    try { await refreshBrowsers(); }
    catch { setMessage('Unable to refresh browser data. Installed versions remain available offline.'); }
    finally { setRefreshing(false); }
  }

  async function removeVersion(version: string) {
    if (!window.confirm(`Remove managed Chromium ${version}? Profiles using other versions are not affected.`)) return;
    setMessage('');
    try {
      await remove.mutateAsync(version);
      setMessage(`Chromium ${version} removed.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to remove browser version.');
    }
  }

  return <div className="page-frame">
    <header className="page-header"><div><p className="eyebrow">MANAGED CHROMIUM</p><h1>Browser Manager</h1><p className="page-subtitle">Install, verify and remove the Chromium versions pinned by your profiles.</p></div><div className="page-header-actions"><button className="btn" type="button" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? 'Refreshing…' : 'Refresh'}</button></div></header>
    {message && <div className="info-panel">{message}</div>}
    <div className="toolbar"><button className={`btn ${tab === 'available' ? 'primary' : ''}`} onClick={() => setTab('available')}>Available</button><button className={`btn ${tab === 'installed' ? 'primary' : ''}`} onClick={() => setTab('installed')}>Installed ({installed.data?.length ?? 0})</button></div>
    {available.isError ? <div className="form-error">Browser manifest is unavailable. Installed browsers remain usable offline; retry when connectivity returns.</div> : null}
    {tab === 'available' ? <section className="table-card">
      {available.isLoading ? <div className="table-loading">Loading browser manifest…</div> : rows.length ? <table className="data-table"><thead><tr><th>Version</th><th>Channel</th><th>Download size</th><th>State</th><th>Profiles using</th><th className="actions-col">Action</th></tr></thead><tbody>{rows.map((row) => {
        const event = progress[row.version];
        const downloading = activeVersion === row.version;
        const action = browserActionLabel({ installed: row.isInstalled, downloading, failed: Boolean(failed[row.version]) });
        return <tr key={row.version}><td><strong>{row.version}</strong></td><td>{row.isStable ? <span className="status-badge status-running">Stable</span> : <span className="status-badge">Supported</span>}</td><td>{formatBytes(row.size)}</td><td>{row.isInstalled ? row.executableAvailable ? 'Installed' : 'Installed — executable missing' : downloading && event ? `${event.percent === null ? formatBytes(event.receivedBytes) : `${event.percent.toFixed(0)}%`}` : failed[row.version] ? 'Download failed' : 'Not installed'}</td><td>{row.profilesUsing}</td><td><div className="row-actions"><button className={`btn ${row.isInstalled ? 'ghost' : 'primary'}`} disabled={row.isInstalled || downloading} onClick={() => void startDownload(row.version)}>{action}</button></div></td></tr>;
      })}</tbody></table> : <div className="table-empty">No browser versions available from the current manifest.</div>}
    </section> : <section className="table-card">
      <div className="section-header"><div><h2>Installed Chromium</h2><p className="muted">{installed.data?.length ?? 0} version(s) · {formatBytes(installedBytes)} managed artifacts</p></div></div>
      {installed.isLoading ? <div className="table-loading">Loading installed browsers…</div> : installed.data?.length ? <table className="data-table"><thead><tr><th>Version</th><th>Artifact size</th><th>Installed</th><th>Executable</th><th>Profiles using</th><th className="actions-col">Action</th></tr></thead><tbody>{installed.data.map((item) => <tr key={item.version}><td><strong>{item.version}</strong></td><td>{formatBytes(item.artifactSize)}</td><td className="muted">{new Date(item.installedAt).toLocaleString()}</td><td>{item.executableAvailable ? <span className="status-badge status-running">Ready</span> : <span className="status-badge status-error">Missing</span>}</td><td>{item.profilesUsing}</td><td><button className="btn danger-soft" type="button" disabled={!canRemoveBrowser(item) || remove.isPending} title={item.profilesUsing > 0 ? 'Move profiles to another Chromium version before removing this version.' : undefined} onClick={() => void removeVersion(item.version)}>{item.executableAvailable ? 'Remove' : 'Remove broken install'}</button></td></tr>)}</tbody></table> : <div className="table-empty">No Chromium versions installed yet.</div>}
    </section>}
  </div>;
}
