import { create } from 'zustand';

export type AppSection = 'profiles' | 'groups' | 'proxy' | 'browsers' | 'extensions' | 'settings';
export const NAV_ITEMS: ReadonlyArray<{ id: AppSection; label: string; glyph: string }> = [
  { id: 'profiles', label: 'Profiles', glyph: 'P' },
  { id: 'groups', label: 'Groups', glyph: 'G' },
  { id: 'proxy', label: 'Proxy', glyph: 'PX' },
  { id: 'browsers', label: 'Browser Manager', glyph: 'B' },
  { id: 'extensions', label: 'Extensions', glyph: 'E' },
  { id: 'settings', label: 'Settings', glyph: 'S' }
];

interface UiState {
  activeSection: AppSection;
  setActiveSection(section: AppSection): void;
}

export const useUiStore = create<UiState>((set) => ({
  activeSection: 'profiles',
  setActiveSection: (activeSection) => set({ activeSection })
}));
