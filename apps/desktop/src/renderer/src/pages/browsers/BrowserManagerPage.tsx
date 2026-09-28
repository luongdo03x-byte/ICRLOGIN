import { useEffect, useMemo, useState } from 'react';
import type { BrowserDownloadProgressEvent } from '@icrlogin/shared';
import { icrClient } from '../../api/icr-client.js';
import { browserActionLabel, formatBytes, mergeBrowserRows } from './browser-manager-model.js';
import { useAvailableBrowsers, useDownloadBrowser, useInstalledBrowsers } from './browser-queries.js';

type Tab = 'available' | 'installed';

export function BrowserManagerPage() {
  const available = useAvailableBrowsers();
  const installed = useInstalledBrowsers();
  const download = useDownloadBrowser();
  const [tab, setTab] = useState<Tab>('available');
  const [progress, setProgress] = useState<Record<string, BrowserDownloadProgressEvent>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [activeVersion, setActiveVersion] = useState<string | null>(null);

  useEffect(() => icrClient.browsers.onDownloadProgress((event) => {
    setProgress((current) => ({ ...current, [event.version]: event }));
  }), []);

  const rows = useMemo(() => mergeBrowserRows(available.data ?? [], installed.data ?? []), [available.data, installed.data]);

  async function startDownload(version: string) {
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

  return <div className="page-frame">
    <header className="page-header"><div><p className="eyebrow">MANAGED CHROMIUM</p><h1>Browser Manager</h1><p className="page-subtitle">Install and keep the Chromium versions pinned by your profiles.</p></div></header>
    <div className="toolbar"><button className={`btn ${tab === 'available' ? 'primary' : ''}`} onClick={() => setTab('available')}>Available</button><button className={`btn ${tab === 'installed' ? 'primary' : ''}`} onClick={() => setTab('installed')}>Installed ({installed.data?.length ?? 0})</button></div>
    {available.isError ? <div className="form-error">Browser manifest is unavailable. Installed browsers remain usable offline; retry when connectivity returns.</div> : null}
    {tab === 'available' ? <section className="table-card">
      {available.isLoading ? <div className="table-loading">Loading browser manifest…</div> : rows.length ? <table className="data-table"><thead><tr><th>Version</th><th>Channel</th><th>Download size</th><th>State</th><th>Profiles using</th><th className="actions-col">Action</th></tr></thead><tbody>{rows.map((row) => {
        const event = progress[row.version];
        const downloading = activeVersion === row.version;
        const action = browserActionLabel({ installed: row.isInstalled, downloading, failed: Boolean(failed[row.version]) });
        return <tr key={row.version}><td><strong>{row.version}</strong></td><td>{row.isStable ? <span className="status-badge status-running">Stable</span> : <span className="status-badge">Supported</span>}</td><td>{formatBytes(row.size)}</td><td>{row.isInstalled ? 'Installed' : downloading && event ? `${event.percent === null ? formatBytes(event.receivedBytes) : `${event.percent.toFixed(0)}%`}` : failed[row.version] ? 'Download failed' : 'Not installed'}</td><td>{row.profilesUsing}</td><td><div className="row-actions"><button className={`btn ${row.isInstalled ? 'ghost' : 'primary'}`} disabled={row.isInstalled || downloading} onClick={() => void startDownload(row.version)}>{action}</button></div></td></tr>;
      })}</tbody></table> : <div className="table-empty">No browser versions available from the current manifest.</div>}
    </section> : <section className="table-card">{installed.isLoading ? <div className="table-loading">Loading installed browsers…</div> : installed.data?.length ? <table className="data-table"><thead><tr><th>Version</th><th>Artifact size</th><th>Installed</th><th>Executable</th><th>Profiles using</th></tr></thead><tbody>{installed.data.map((item) => <tr key={item.version}><td><strong>{item.version}</strong></td><td>{formatBytes(item.artifactSize)}</td><td className="muted">{new Date(item.installedAt).toLocaleString()}</td><td>{item.executableAvailable ? <span className="status-badge status-running">Ready</span> : <span className="status-badge status-error">Missing</span>}</td><td>{item.profilesUsing}</td></tr>)}</tbody></table> : <div className="table-empty">No Chromium versions installed yet.</div>}</section>}
  </div>;
}
