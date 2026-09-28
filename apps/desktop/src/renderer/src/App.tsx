import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DesktopProfileListItem } from '@icrlogin/shared';
import { AppShell } from './components/AppShell.js';
import { icrClient } from './api/icr-client.js';
import { ProfilesPage } from './pages/profiles/ProfilesPage.js';
import { ProfileWizard } from './pages/profiles/ProfileWizard.js';
import { GroupsPage } from './pages/groups/GroupsPage.js';
import { ProxyPage } from './pages/proxy/ProxyPage.js';
import { NAV_ITEMS, useUiStore } from './state/ui-store.js';

export function App() {
  const activeSection = useUiStore((state) => state.activeSection);
  const health = useQuery({ queryKey: ['health'], queryFn: icrClient.health, refetchInterval: 5000, retry: 1 });
  const current = NAV_ITEMS.find((item) => item.id === activeSection) ?? NAV_ITEMS[0]!;
  const status = health.isError ? 'error' : health.data ? 'online' : 'connecting';
  const [wizardProfile, setWizardProfile] = useState<DesktopProfileListItem | null | undefined>(undefined);

  let content;
  if (activeSection === 'profiles') content = <ProfilesPage onCreate={() => setWizardProfile(null)} onEdit={setWizardProfile} />;
  else if (activeSection === 'groups') content = <GroupsPage />;
  else if (activeSection === 'proxy') content = <ProxyPage />;
  else content = <div className="page-frame"><header className="page-header"><div><p className="eyebrow">LOCAL WORKSPACE</p><h1>{current.label}</h1></div><div className="header-meta">{health.data ? `${health.data.runningRuntimeCount} running` : 'Connecting…'}</div></header><section className="empty-panel"><div className="empty-icon">{current.glyph}</div><h2>{current.label}</h2><p>Phase 2 workspace is ready for this module.</p></section></div>;

  return <AppShell coreStatus={status}>{content}<ProfileWizard open={wizardProfile !== undefined} profile={wizardProfile ?? null} onClose={() => setWizardProfile(undefined)} /></AppShell>;
}
