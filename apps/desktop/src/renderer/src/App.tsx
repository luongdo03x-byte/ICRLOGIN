import { useQuery } from '@tanstack/react-query';
import { AppShell } from './components/AppShell.js';
import { icrClient } from './api/icr-client.js';
import { ProfilesPage } from './pages/profiles/ProfilesPage.js';
import { NAV_ITEMS,useUiStore } from './state/ui-store.js';

export function App(){const activeSection=useUiStore(state=>state.activeSection);const health=useQuery({queryKey:['health'],queryFn:icrClient.health,refetchInterval:5000,retry:1});const current=NAV_ITEMS.find(item=>item.id===activeSection)??NAV_ITEMS[0]!;const status=health.isError?'error':health.data?'online':'connecting';return <AppShell coreStatus={status}>{activeSection==='profiles'?<ProfilesPage/>:<div className="page-frame"><header className="page-header"><div><p className="eyebrow">LOCAL WORKSPACE</p><h1>{current.label}</h1></div><div className="header-meta">{health.data?`${health.data.runningRuntimeCount} running`:'Connecting…'}</div></header><section className="empty-panel"><div className="empty-icon">{current.glyph}</div><h2>{current.label}</h2><p>Phase 2 workspace is ready for this module.</p></section></div>}</AppShell>;}
