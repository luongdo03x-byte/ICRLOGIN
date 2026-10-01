import { useEffect } from 'react';
import { literalTranslations, translateLiteral, type Locale } from './i18n.js';
import { useI18n } from './react.js';

const reverseLiterals = new Map<string, string>(Object.entries(literalTranslations).map(([english, vietnamese]) => [vietnamese, english]));
const translatedAttributes = ['aria-label', 'placeholder', 'title'] as const;
const staticOptionValues = new Set([
  '', 'all', 'running', 'stopped', 'error', 'ungrouped', 'with', 'without', 'lastUsed', 'name', 'browser',
  'ask', 'tray', 'quit', 'http', 'https', 'socks5', 'unpacked', 'crx', 'on', 'off', 'allow', 'block',
  'available', 'installed', 'vi', 'en'
]);

function localizeValue(locale: Locale, value: string): string {
  const match = value.match(/^(\s*)(.*?)(\s*)$/s);
  if (!match) return value;
  const [, leading, core, trailing] = match;
  const english = literalTranslations[core] !== undefined ? core : reverseLiterals.get(core) ?? core;
  const localized = locale === 'vi' ? translateLiteral('vi', english) : english;
  return `${leading}${localized}${trailing}`;
}

function isLikelyUserData(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent) return false;
  if (parent.closest('.profile-name, .tag-chip, .mono, .truncate-cell')) return true;
  if (parent.closest('.review-grid strong')) return true;
  if (parent.tagName === 'OPTION') {
    const value = (parent as HTMLOptionElement).value;
    if (value && !staticOptionValues.has(value)) return true;
  }
  const bodyCell = parent.closest('tbody td');
  if (bodyCell && !parent.closest('button, .status-badge, .table-empty, .form-error, .warning-note, .info-panel')) return true;
  return false;
}

function localizeTextNode(node: Text, locale: Locale): void {
  if (isLikelyUserData(node)) return;
  const current = node.data;
  const next = localizeValue(locale, current);
  if (next !== current) node.data = next;
}

function localizeElement(element: Element, locale: Locale): void {
  for (const attribute of translatedAttributes) {
    const value = element.getAttribute(attribute);
    if (!value) continue;
    const next = localizeValue(locale, value);
    if (next !== value) element.setAttribute(attribute, next);
  }
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) localizeTextNode(child as Text, locale);
    else if (child.nodeType === Node.ELEMENT_NODE) localizeElement(child as Element, locale);
  }
}

export function I18nDomBridge() {
  const { locale } = useI18n();

  useEffect(() => {
    document.documentElement.lang = locale;
    const root = document.getElementById('root');
    if (!root) return;
    localizeElement(root, locale);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          localizeTextNode(mutation.target as Text, locale);
          continue;
        }
        if (mutation.type === 'attributes' && mutation.target instanceof Element) {
          localizeElement(mutation.target, locale);
          continue;
        }
        for (const node of Array.from(mutation.addedNodes)) {
          if (node.nodeType === Node.TEXT_NODE) localizeTextNode(node as Text, locale);
          else if (node.nodeType === Node.ELEMENT_NODE) localizeElement(node as Element, locale);
        }
      }
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...translatedAttributes] });
    return () => observer.disconnect();
  }, [locale]);

  return null;
}
