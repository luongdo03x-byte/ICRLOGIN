import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppSettings, UpdateAppSettings } from '@icrlogin/shared';
import { icrClient } from '../../api/icr-client.js';
import { RecoveryPage } from '../recovery/RecoveryPage.js';
import { buildSettingsPatch, settingsDraftRequiresRestart } from './settings-model.js';
import { updateAction, updateStateLabel } from './update-model.js';

type SettingsTab = 'general' | 'api' | 'updates' | 'recovery';

function formatUpdateBytes(value: number | null): string {
  if (value === null) return '—';
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<SettingsTab>('general');
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [message, setMessage] = useState('');
  const settings = useQuery({ queryKey: ['settings'], queryFn: icrClient.settings.get, staleTime: 30_000 });
  const updates = useQuery({
    queryKey: ['app-update'],
    queryFn: icrClient.updates.status,
    refetchInterval: (query) => ['checking', 'downloading'].includes(query.state.data?.state ?? '') ? 1000 : false
  });

  useEffect(() => { if (settings.data) setDraft(settings.data); }, [settings.data]);

  const patch = useMemo<UpdateAppSettings>(() => {
    if (!settings.data || !draft) return {};
    return buildSettingsPatch(settings.data, draft);
  }, [settings.data, draft]);
  const dirty = Object.keys(patch).length > 0;
  const restartDraft = Boolean(settings.data && draft && settingsDraftRequiresRestart(settings.data, draft));

  const save = useMutation({
    mutationFn: () => icrClient.settings.update(patch),
    onSuccess: (result) => {
      setDraft(result.settings);
      queryClient.setQueryData(['settings'], result.settings);
      setMessage(result.restartRequired ? 'Settings saved. Restart ICRLogin to apply the new local API port.' : 'Settings saved.');
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Unable to save settings.')
  });

  const updateOperation = useMutation({
    mutationFn: (action: 'check' | 'download') => action === 'check' ? icrClient.updates.check() : icrClient.updates.download(),
    onSuccess: (result) => queryClient.setQueryData(['app-update'], result),
    onError: () => setMessage('Unable to complete the update operation.')
  });

  if (settings.isError) return <div className="page-frame"><div className="form-error">Unable to load settings.</div></div>;
  if (settings.isLoading || !draft) return <div className="page-frame"><div className="table-loading">Loading settings…</div></div>;

  const update = updates.data;
  const action = update ? updateAction(update) : null;
  return <div className="page-frame settings-page">
    <header className="page-header">
      <div><p className="eyebrow">APPLICATION SETTINGS</p><h1>Settings</h1><p className="page-subtitle">Windows startup, desktop behavior, local API, updates and recovery controls.</p></div>
      {(tab === 'general' || tab === 'api') && <div className="page-header-actions"><button className="btn primary" type="button" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save settings'}</button></div>}
    </header>

    <div className="toolbar settings-tabs">
      <button className={`btn ${tab === 'general' ? 'primary' : ''}`} onClick={() => setTab('general')}>General</button>
      <button className={`btn ${tab === 'api' ? 'primary' : ''}`} onClick={() => setTab('api')}>Local API</button>
      <button className={`btn ${tab === 'updates' ? 'primary' : ''}`} onClick={() => setTab('updates')}>Updates</button>
      <button className={`btn ${tab === 'recovery' ? 'primary' : ''}`} onClick={() => setTab('recovery')}>Recovery & Monitoring</button>
    </div>

    {message && <div className="info-panel settings-message">{message}</div>}

    {tab === 'general' && <div className="settings-grid">
      <section className="settings-card"><div><h2>Windows startup</h2><p className="muted">Start ICRLogin automatically after you sign in to Windows.</p></div><label className="settings-toggle"><input type="checkbox" checked={draft.launchAtLogin} onChange={(event) => setDraft({ ...draft, launchAtLogin: event.target.checked })}/><span>Launch ICRLogin with Windows</span></label></section>
      <section className="settings-card"><div><h2>Close behavior</h2><p className="muted">Running Chromium profiles are never force-stopped when the desktop closes.</p></div><label className="field"><span>When closing ICRLogin</span><select value={draft.closeBehavior} onChange={(event) => setDraft({ ...draft, closeBehavior: event.target.value as AppSettings['closeBehavior'] })}><option value="ask">Ask if browser profiles are still running</option><option value="tray">Hide ICRLogin to the system tray</option><option value="quit">Quit without prompting</option></select><small>Tray mode keeps the desktop process available while managed Chromium continues running independently.</small></label></section>
    </div>}

    {tab === 'api' && <div className="settings-grid"><section className="settings-card"><div><h2>Local automation API</h2><p className="muted">The listener remains bound to 127.0.0.1 only.</p></div><label className="field"><span>Port</span><input type="number" min={1} max={65535} value={draft.localApiPort} onChange={(event) => setDraft({ ...draft, localApiPort: Number(event.target.value) })}/><small>Default: 9495. Port changes take effect after restarting ICRLogin.</small></label>{restartDraft && <div className="settings-restart-note">Restart required after saving this port change.</div>}</section></div>}

    {tab === 'updates' && <div className="settings-grid"><section className="settings-card settings-update-card">
      <div><h2>ICRLogin application updates</h2><p className="muted">Updates affect the desktop application only. Managed Chromium versions are updated separately in Browser Manager.</p></div>
      {updates.isLoading ? <div className="table-loading">Loading update status…</div> : updates.isError || !update ? <div className="form-error">Unable to read update status.</div> : <>
        <div className="review-grid"><div><span>Installed</span><strong>{update.currentVersion}</strong></div><div><span>Available</span><strong>{update.availableVersion ?? '—'}</strong></div><div><span>Status</span><strong>{updateStateLabel(update)}</strong></div><div><span>Progress</span><strong>{update.progressPercent === null ? '—' : `${update.progressPercent.toFixed(0)}%`} {update.totalBytes ? `(${formatUpdateBytes(update.transferredBytes)} / ${formatUpdateBytes(update.totalBytes)})` : ''}</strong></div></div>
        {update.state === 'disabled' && <div className="settings-restart-note">Application updates are disabled in unpackaged development builds or when no valid HTTPS update feed is configured.</div>}
        {update.state === 'downloaded' && <div className="info-panel">The signed update is downloaded. It will be installed on the next normal ICRLogin quit. Running Chromium profiles are not force-stopped.</div>}
        {action && <div><button className="btn primary" type="button" disabled={updateOperation.isPending} onClick={() => updateOperation.mutate(action)}>{updateOperation.isPending ? 'Working…' : action === 'check' ? 'Check for updates' : 'Download update'}</button></div>}
      </>}
    </section></div>}

    {tab === 'recovery' && <div className="settings-recovery"><RecoveryPage /></div>}
  </div>;
}
