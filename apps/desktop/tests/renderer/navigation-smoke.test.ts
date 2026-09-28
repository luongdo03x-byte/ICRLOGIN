import { describe, expect, it } from 'vitest';
import { getSectionView } from '../../src/renderer/src/navigation/navigation-model.js';

describe('desktop navigation model', () => {
  it('maps all six sidebar routes to a real page or explicit later-phase placeholder', () => {
    expect(getSectionView('profiles')).toBe('profiles');
    expect(getSectionView('groups')).toBe('groups');
    expect(getSectionView('proxy')).toBe('proxy');
    expect(getSectionView('browsers')).toBe('browsers');
    expect(getSectionView('extensions')).toBe('placeholder:extensions');
    expect(getSectionView('settings')).toBe('placeholder:settings');
  });
});
