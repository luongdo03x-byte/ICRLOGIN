import { describe, expect, it } from 'vitest';
import { createI18nStore, normalizeLocale, translate, translateLiteral } from '../src/renderer/src/i18n/i18n.js';

describe('renderer i18n', () => {
  it('defaults unknown locales to Vietnamese', () => {
    expect(normalizeLocale(undefined)).toBe('vi');
    expect(normalizeLocale('fr')).toBe('vi');
  });

  it('translates navigation labels in Vietnamese and English', () => {
    expect(translate('vi', 'nav.profiles')).toBe('Hồ sơ');
    expect(translate('en', 'nav.profiles')).toBe('Profiles');
    expect(translate('vi', 'settings.language')).toBe('Ngôn ngữ');
    expect(translate('en', 'settings.language')).toBe('Language');
  });

  it('translates centralized renderer literals in both directions without touching unknown values', () => {
    expect(translateLiteral('vi', 'Profiles')).toBe('Hồ sơ');
    expect(translateLiteral('vi', 'Create profile')).toBe('Tạo hồ sơ');
    expect(translateLiteral('en', 'Hồ sơ')).toBe('Profiles');
    expect(translateLiteral('en', 'Profiles')).toBe('Profiles');
    expect(translateLiteral('vi', 'Chromium')).toBe('Chromium');
    expect(translateLiteral('vi', 'Custom profile name')).toBe('Custom profile name');
  });

  it('persists the selected locale and notifies subscribers', () => {
    let persisted: string | null = null;
    const storage = {
      getItem: () => persisted,
      setItem: (_key: string, value: string) => { persisted = value; }
    };
    const store = createI18nStore(storage);
    const seen: string[] = [];
    const unsubscribe = store.subscribe(() => seen.push(store.getLocale()));

    expect(store.getLocale()).toBe('vi');
    store.setLocale('en');

    expect(persisted).toBe('en');
    expect(store.getLocale()).toBe('en');
    expect(seen).toEqual(['en']);
    unsubscribe();
  });
});
