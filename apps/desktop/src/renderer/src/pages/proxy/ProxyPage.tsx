import { useState } from 'react';
import type { CreateProxyInput, ProxyPublic, UpdateProxyInput } from '@icrlogin/shared';
import { ProxyDialog } from './ProxyDialog.js';
import { useCreateProxy, useDeleteProxy, useProxiesQuery, useUpdateProxy } from './proxy-queries.js';

export function ProxyPage() {
  const proxies = useProxiesQuery();
  const createProxy = useCreateProxy();
  const updateProxy = useUpdateProxy();
  const deleteProxy = useDeleteProxy();
  const [dialog, setDialog] = useState<ProxyPublic | null | undefined>(undefined);

  async function submit(input: CreateProxyInput | UpdateProxyInput) {
    if (dialog) await updateProxy.mutateAsync({ id: dialog.id, input });
    else await createProxy.mutateAsync(input as CreateProxyInput);
    setDialog(undefined);
  }

  async function remove(proxy: ProxyPublic) {
    if (!window.confirm(`Delete proxy “${proxy.name}”? Running Chromium processes are not changed. Profiles assigned to this proxy will switch to Direct for future starts unless you assign another proxy.`)) return;
    await deleteProxy.mutateAsync(proxy.id);
  }

  if (proxies.isError) return <div className="error-panel">Unable to load proxies.</div>;

  return <div className="page-frame">
    <header className="page-header"><div><p className="eyebrow">NETWORK CONFIGURATION</p><h1>Proxy</h1><p className="page-subtitle">Reusable HTTP, HTTPS and SOCKS5 proxy records. Secrets stay in the main process.</p></div><button className="btn primary" onClick={() => setDialog(null)}>Add proxy</button></header>
    <section className="table-card">
      {proxies.isLoading ? <div className="table-loading">Loading proxies…</div> : proxies.data?.length ? <table className="data-table"><thead><tr><th>Name</th><th>Type</th><th>Host</th><th>Port</th><th>Auth</th><th>Status</th><th className="actions-col">Actions</th></tr></thead><tbody>{proxies.data.map((proxy) => <tr key={proxy.id}>
        <td><strong>{proxy.name}</strong></td><td><span className="version-pill">{proxy.type.toUpperCase()}</span></td><td className="mono truncate-cell">{proxy.host}</td><td>{proxy.port}</td><td>{proxy.username || proxy.hasPassword ? `${proxy.username ?? 'user'}${proxy.hasPassword ? ' ••••••' : ''}` : 'None'}</td><td><span className="status-badge">Not tested</span></td><td><div className="row-actions"><button className="icon-btn" onClick={() => setDialog(proxy)}>Edit</button><button className="icon-btn danger-soft" onClick={() => void remove(proxy)}>Delete</button></div></td>
      </tr>)}</tbody></table> : <div className="table-empty">No proxies saved. Add one to reuse it across profiles.</div>}
    </section>
    <ProxyDialog open={dialog !== undefined} proxy={dialog ?? null} busy={createProxy.isPending || updateProxy.isPending} onClose={() => setDialog(undefined)} onSubmit={submit} />
  </div>;
}
