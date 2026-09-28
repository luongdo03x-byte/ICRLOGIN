/** @vitest-environment jsdom */
import './setup.js';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../../src/renderer/src/components/AppShell.js';
import { NAV_ITEMS, useUiStore } from '../../src/renderer/src/state/ui-store.js';

describe('AppShell', () => {
  it('brands ICRLogin and exposes six sections with Profiles selected by default', () => {
    useUiStore.setState({ activeSection: 'profiles' });
    render(<AppShell coreStatus="online"><div>CONTENT</div></AppShell>);
    expect(screen.getByText('ICRLogin').textContent).toBe('ICRLogin');
    expect(NAV_ITEMS.map((item) => item.label)).toEqual(['Profiles','Groups','Proxy','Browser Manager','Extensions','Settings']);
    for (const item of NAV_ITEMS) expect(screen.getByRole('button', { name: item.label }).textContent?.includes(item.label)).toBe(true);
    expect(screen.getByRole('button', { name: 'Profiles' }).getAttribute('aria-current')).toBe('page');
  });
});
