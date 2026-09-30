import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DesktopProfileListItem, ProfileCloneMode } from '@icrlogin/shared';
import { icrClient } from '../../api/icr-client.js';
import { profileCloneLabels } from './profiles-model.js';

export interface CloneProfileDialogProps {
  profile: DesktopProfileListItem | null;
  onClose(): void;
}

export function CloneProfileDialog({ profile, onClose }: CloneProfileDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const labels = profileCloneLabels();

  const clone = useMutation({
    mutationFn: async (mode: ProfileCloneMode) => {
      if (!profile) return null;
      return icrClient.profiles.clone(profile.id, mode, name.trim() ? { name: name.trim() } : undefined);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profiles'] });
      onClose();
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Unable to clone profile')
  });

  const saveTemplate = useMutation({
    mutationFn: async () => {
      if (!profile) return null;
      const templateName = name.trim() || `${profile.name} template`;
      return icrClient.templates.saveFromProfile(profile.id, templateName);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
      onClose();
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Unable to save template')
  });

  if (!profile) return null;
  const busy = clone.isPending || saveTemplate.isPending;

  return <div className="modal-backdrop" role="presentation">
    <section className="wizard-modal compact-modal" role="dialog" aria-modal="true" aria-label={`Clone ${profile.name}`}>
      <header className="wizard-header">
        <div><p className="eyebrow">PROFILE OPERATIONS</p><h2>{profile.name}</h2></div>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="wizard-body">
        <label className="field wide"><span>New profile / template name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder={`${profile.name} copy`} /></label>
        <div className="stack-actions">
          <button className="btn primary" disabled={busy} onClick={() => clone.mutate('config')}>{labels.config}</button>
          <button className="btn" disabled={busy || profile.runtimeState !== 'stopped'} title={profile.runtimeState !== 'stopped' ? 'Stop the profile before a full clone.' : undefined} onClick={() => clone.mutate('full')}>{labels.full}</button>
          <button className="btn" disabled={busy} onClick={() => saveTemplate.mutate()}>{labels.template}</button>
        </div>
        {profile.runtimeState !== 'stopped' && <small>Full clone is disabled until this profile is stopped.</small>}
        {message && <div className="form-error">{message}</div>}
      </div>
      <footer className="wizard-footer"><button className="btn" onClick={onClose}>Close</button></footer>
    </section>
  </div>;
}
