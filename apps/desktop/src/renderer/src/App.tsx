import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DesktopProfileListItem } from '@icrlogin/shared';
import { AppShell } from './components/AppShell.js';
import { icrClient } from './api/icr-client.js';
import { ProfilesPage } from './pages/profiles/ProfilesPage.js';
import { ProfileWizard } from './pages/profiles/ProfileWizard.js';
import { GroupsPage } from './pages/groups/GroupsPage.js';
import { ProxyPage } from './pages/proxy/ProxyPage.js';
import { BrowserManagerPage } from './pages/browsers/BrowserManagerPage.js';
import { ExtensionsPage } from './pages/extensions/ExtensionsPage.js';
import { TemplatesPage } from './pages/templates/TemplatesPage.js';
import { RecoveryPage } from './pages/recovery/RecoveryPage.js';
import { getSectionView } from './navigation/navigation-model.js';
import { useUiStore } from './state/ui-store.js';

export function App() {
  const activeSection = useUiStore((state) => state.activeSection);
  const health = useQuery({ queryKey: ['health'], queryFn: icrClient.health, refetchInterval: 5000, retry: 1 });
  const status = health.isError ? 'error' : health.data ? 'online' : 'connecting';
  const [wizardProfile, setWizardProfile] = useState<DesktopProfileListItem | null | undefined>(undefined);
  const [showTemplates, setShowTemplates] = useState(false);
  const view = getSectionView(activeSection);
  useEffect(() => { if (view !== 'profiles') setShowTemplates(false); }, [view]);

  let content;
  if (view === 'profiles' && showTemplates) content = <TemplatesPage onBack={() => setShowTemplates(false)} />;
  else if (view === 'profiles') content = <ProfilesPage onCreate={() => { setShowTemplates(false); setWizardProfile(null); }} onEdit={setWizardProfile} onOpenTemplates={() => setShowTemplates(true)} />;
  else if (view === 'groups') content = <GroupsPage />;
  else if (view === 'proxy') content = <ProxyPage />;
  else if (view === 'browsers') content = <BrowserManagerPage />;
  else if (view === 'extensions') content = <ExtensionsPage />;
  else content = <RecoveryPage />;

  return <AppShell coreStatus={status}>{content}<ProfileWizard open={wizardProfile !== undefined} profile={wizardProfile ?? null} onClose={() => setWizardProfile(undefined)} /></AppShell>;
}
