import React, { type ReactNode } from 'react';
import { NAV_ITEMS, useUiStore } from '../state/ui-store.js';

export interface AppShellProps {
  children: ReactNode;
  coreStatus?: 'online' | 'connecting' | 'error';
}

export function AppShell({ children, coreStatus = 'connecting' }: AppShellProps) {
  const activeSection = useUiStore((state) => state.activeSection);
  const setActiveSection = useUiStore((state) => state.setActiveSection);
  return (
    <React.Fragment>
      <div className="app-shell">
        <aside className="sidebar" aria-label="Primary navigation">
          <div className="brand"><span className="brand-mark">IC</span><span>ICRLogin</span></div>
          <nav className="sidebar-nav">
            {NAV_ITEMS.map((item) => (
              <button key={item.id} type="button" className={activeSection === item.id ? 'nav-item active' : 'nav-item'} aria-current={activeSection === item.id ? 'page' : undefined} onClick={() => setActiveSection(item.id)}>
                <span className="nav-glyph" aria-hidden="true">{item.glyph}</span><span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className={`core-status ${coreStatus}`}><span className="status-dot" /><span>Core {coreStatus}</span></div>
        </aside>
        <main className="workspace">{children}</main>
      </div>
    </React.Fragment>
  );
}
