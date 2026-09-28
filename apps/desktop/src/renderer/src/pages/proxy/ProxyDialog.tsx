import { useEffect, useState } from 'react';
import type { CreateProxyInput, ProxyPublic, UpdateProxyInput } from '@icrlogin/shared';
import { buildProxySubmitInput, type ProxyFormState } from './proxy-form-model.js';

interface ProxyDialogProps {
  open: boolean;
  proxy: ProxyPublic | null;
  busy: boolean;
  onClose(): void;
  onSubmit(input: CreateProxyInput | UpdateProxyInput): Promise<void>;
}

const blank: ProxyFormState = { name: '', type: 'http', host: '', port: '8080', username: '', password: '' };

export function ProxyDialog({ open, proxy, busy, onClose, onSubmit }: ProxyDialogProps) {
  const [form, setForm] = useState<ProxyFormState>(blank);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(proxy ? {
      name: proxy.name,
      type: proxy.type,
      host: proxy.host,
      port: String(proxy.port),
      username: proxy.username ?? '',
      password: ''
    } : blank);
  }, [open, proxy]);

  if (!open) return null;
  const set = (patch: Partial<ProxyFormState>) => setForm((current) => ({ ...current, ...patch }));

  async function submit() {
    const result = buildProxySubmitInput(form, proxy !== null);
    if (!result.ok) { setError(result.message); return; }
    setError(null);
    await onSubmit(result.value);
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="wizard-modal" role="dialog" aria-modal="true" aria-label={proxy ? 'Edit proxy' : 'Add proxy'}>
      <header className="wizard-header"><div><p className="eyebrow">PROXY</p><h2>{proxy ? 'Edit proxy' : 'Add proxy'}</h2></div><button className="modal-close" aria-label="Close" onClick={onClose}>×</button></header>
      <div className="wizard-body"><div className="form-grid">
        <label className="field"><span>Name</span><input value={form.name} onChange={(event) => set({ name: event.target.value })} /></label>
        <label className="field"><span>Type</span><select value={form.type} onChange={(event) => set({ type: event.target.value as ProxyFormState['type'] })}><option value="http">HTTP</option><option value="https">HTTPS</option><option value="socks5">SOCKS5</option></select></label>
        <label className="field"><span>Host</span><input value={form.host} onChange={(event) => set({ host: event.target.value })} /></label>
        <label className="field"><span>Port</span><input inputMode="numeric" value={form.port} onChange={(event) => set({ port: event.target.value })} /></label>
        <label className="field"><span>Username</span><input value={form.username} onChange={(event) => set({ username: event.target.value })} /></label>
        <label className="field"><span>Password</span><input type="password" autoComplete="new-password" value={form.password} placeholder={proxy?.hasPassword ? 'Saved — leave blank to keep' : 'Optional'} onChange={(event) => set({ password: event.target.value })} /><small>{proxy?.hasPassword ? 'Leave blank to preserve the saved password.' : 'Stored encrypted by the main process.'}</small></label>
      </div>{error ? <div className="form-error">{error}</div> : null}</div>
      <footer className="wizard-footer"><span /><div className="wizard-footer-right"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={() => void submit()}>{proxy ? 'Save changes' : 'Add proxy'}</button></div></footer>
    </section>
  </div>;
}
