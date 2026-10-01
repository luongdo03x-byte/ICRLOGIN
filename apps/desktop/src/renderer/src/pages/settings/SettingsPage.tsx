import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppSettings, UpdateAppSettings } from '@icrlogin/shared';
import { icrClient } from '../../api/icr-client.js';
import { RecoveryPage } from '../recovery/RecoveryPage.js';
import { buildSettingsPatch, settingsDraftRequiresRestart } from './settings-model.js';

type SettingsTab = 'general' | 'api' | 'recovery';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<SettingsTab>('general');
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [message, setMessage] = useState('');
  const settings = useQuery({ queryKey: ['settings'], queryFn: icrClient.settings.get, staleTime: 30_000 });

  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);

  const patch = useMemo<UpdateAppSettings>(() => {
    if (!settings.data || !draft) return {};
    return buildSettingsPatch(settings.data, draft);
  }, [settings.data, draft]);
  const dirty = Object.keys(patch).length > 0;
  const restartDraft = Boolean(settings.data && draft && settingsDraftRequiresRestart(settings.data, draft));

  const save = useMutation({
    mutationFn: () => icrClient.settings.update(patch),
    onSuccess: async (result) => {
      setDraft(result.settings);
      queryClient.setQueryData(['settings'], result.settings);
      setMessage(result.restartRequired ? 'Settings saved. Restart ICRLogin to apply the new local API port.' : 'Settings saved.');
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Unable to save settings.')
  });

  if (settings.isLoading || !draft) return <div className="page-frame"><div className="table-loading">Loading settings…</div></div>;
  if (settings.isError) return <div className="page-frame"><div className="form-error">Unable to load settings.</div></div>;

  return <div className="page-frame settings-page">
    <header className="page-header">
      <div><p className="eyebrow">APPLICATION SETTINGS</p><h1>Settings</h1><p className="page-subtitle">Windows startup, desktop behavior, local API and recovery controls.</p></div>
      {tab !== 'recovery' && <div className="page-header-actions"><button className="btn primary" type="button" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save settings'}</button></div>}
    </header>

    <div className="toolbar settings-tabs">
      <button className={`btn ${tab === 'general' ? 'primary' : ''}`} onClick={() => setTab('general')}>General</button>
      <button className={`btn ${tab === 'api' ? 'primary' : ''}`} onClick={() => setTab('api')}>Local API</button>
      <button className={`btn ${tab === 'recovery' ? 'primary' : ''}`} onClick={() => setTab('recovery')}>Recovery & Monitoring</button>
    </div>

    {message && <div className="info-panel settings-message">{message}</div>}

    {tab === 'general' && <div className="settings-grid">
      <section className="settings-card">
        <div><h2>Windows startup</h2><p className="muted">Start ICRLogin automatically after you sign in to Windows.</p></div>
        <label className="settings-toggle"><input type="checkbox" checked={draft.launchAtLogin} onChange={(event) => setDraft({ ...draft, launchAtLogin: event.target.checked })}/><span>Launch ICRLogin with Windows</span></label>
      </section>
      <section className="settings-card">
        <div><h2>Close behavior</h2><p className="muted">Running Chromium profiles are never force-stopped when the desktop closes.</p></div>
        <label className="field"><span>When closing ICRLogin</span><select value={draft.closeBehavior} onChange={(event) => setDraft({ ...draft, closeBehavior: event.target.value as AppSettings['closeBehavior'] })}><option value="ask">Ask if browser profiles are still running</option><option value="quit">Quit without prompting</option></select></label>
      </section>
    </div>}

    {tab === 'api' && <div className="settings-grid">
      <section className="settings-card">
        <div><h2>Local automation API</h2><p className="muted">The listener remains bound to 127.0.0.1 only.</p></div>
        <label className="field"><span>Port</span><input type="number" min={1} max={65535} value={draft.localApiPort} onChange={(event) => setDraft({ ...draft, localApiPort: Number(event.target.value) })}/><small>Default: 9495. Port changes take effect after restarting ICRLogin.</small></label>
        {restartDraft && <div className="settings-restart-note">Restart required after saving this port change.</div>}
      </section>
    </div>}

    {tab === 'recovery' && <div className="settings-recovery"><RecoveryPage /></div>}
  </div>;
}
