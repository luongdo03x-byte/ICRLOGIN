import { useSyncExternalStore } from 'react';
import { createI18nStore, translate, translateLiteral, type Locale, type LocaleStorage, type TranslationKey } from './i18n.js';

const browserStorage: LocaleStorage | undefined = typeof window === 'undefined' ? undefined : {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value)
};

export const i18nStore = createI18nStore(browserStorage);

export function useI18n() {
  const locale = useSyncExternalStore(i18nStore.subscribe, i18nStore.getLocale, i18nStore.getLocale);
  return {
    locale,
    setLocale: (next: Locale) => i18nStore.setLocale(next),
    t: (key: TranslationKey) => translate(locale, key),
    text: (value: string) => translateLiteral(locale, value)
  };
}
