import { describe, expect, it } from 'vitest';
import { getSectionView } from '../../src/renderer/src/navigation/navigation-model.js';
import { NAV_ITEMS } from '../../src/renderer/src/state/ui-store.js';

describe('desktop navigation model', () => {
  it('keeps the approved six primary navigation items and opens Extensions as a real page', () => {
    expect(NAV_ITEMS.map((item) => item.id)).toEqual(['profiles','groups','proxy','browsers','extensions','settings']);
    expect(getSectionView('profiles')).toBe('profiles');
    expect(getSectionView('groups')).toBe('groups');
    expect(getSectionView('proxy')).toBe('proxy');
    expect(getSectionView('browsers')).toBe('browsers');
    expect(getSectionView('extensions')).toBe('extensions');
    expect(getSectionView('settings')).toBe('placeholder:settings');
  });
});
