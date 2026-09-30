import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { icrClient } from '../../api/icr-client.js';

export interface TemplatesPageProps { onBack(): void; }

export function TemplatesPage({ onBack }: TemplatesPageProps) {
  const queryClient = useQueryClient();
  const [profileName, setProfileName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const templates = useQuery({ queryKey: ['templates'], queryFn: icrClient.templates.list });

  const create = useMutation({
    mutationFn: async ({ id, fallbackName }: { id: string; fallbackName: string }) =>
      icrClient.templates.createProfile(id, { name: profileName.trim() || `${fallbackName} profile` }),
    onSuccess: async () => {
      setMessage('Profile created from template.');
      setProfileName('');
      await queryClient.invalidateQueries({ queryKey: ['profiles'] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Unable to create profile')
  });
  const remove = useMutation({
    mutationFn: icrClient.templates.delete,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Unable to delete template')
  });

  if (templates.isError) return <div className="error-panel">Unable to load templates.</div>;

  return <div className="page-frame templates-page">
    <header className="page-header">
      <div><p className="eyebrow">PROFILE TEMPLATES</p><h1>Templates</h1><p className="page-subtitle">Reusable profile configuration, tags and extension assignments without browser session data.</p></div>
      <button className="btn" onClick={onBack}>← Back to Profiles</button>
    </header>

    <div className="toolbar">
      <input className="search-input" aria-label="New profile name" value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="Optional name for created profile" />
      <span className="muted">Profiles created here always receive a new UUID and a clean user-data directory.</span>
    </div>
    {message && <div className="form-note">{message}</div>}

    <div className="table-card">
      <table className="data-table">
        <thead><tr><th>Name</th><th>Browser</th><th>Group</th><th>Tags</th><th>Extensions</th><th>Updated</th><th className="actions-col">Actions</th></tr></thead>
        <tbody>
          {(templates.data ?? []).map((template) => <tr key={template.id}>
            <td><div className="profile-name">{template.name}</div><div className="muted mono">{template.id.slice(0,8)}</div></td>
            <td><span className="version-pill">{template.config.browserVersion}</span></td>
            <td>{template.config.groupId ? template.config.groupId.slice(0,8) : 'Ungrouped'}</td>
            <td>{template.tagIds.length}</td>
            <td>{template.extensionIds.length}</td>
            <td className="muted">{new Date(template.updatedAt).toLocaleString()}</td>
            <td><div className="row-actions">
              <button className="btn primary" disabled={create.isPending} onClick={() => create.mutate({ id:template.id, fallbackName:template.name })}>Create profile</button>
              <button className="btn danger-soft" disabled={remove.isPending} onClick={() => remove.mutate(template.id)}>Delete</button>
            </div></td>
          </tr>)}
          {(templates.data ?? []).length === 0 && !templates.isLoading && <tr><td colSpan={7}><div className="table-empty">No templates saved yet. Save one from a profile's Clone menu.</div></td></tr>}
        </tbody>
      </table>
      {templates.isLoading && <div className="table-loading">Loading templates…</div>}
    </div>
  </div>;
}
