import { useEffect } from 'react';
import { translateLiteral, type Locale } from './i18n.js';
import { useI18n } from './react.js';

const translatedAttributes = ['aria-label', 'placeholder', 'title'] as const;
const staticOptionValues = new Set([
  '', 'all', 'running', 'stopped', 'error', 'ungrouped', 'with', 'without', 'lastUsed', 'name', 'browser',
  'ask', 'tray', 'quit', 'http', 'https', 'socks5', 'unpacked', 'crx', 'on', 'off', 'allow', 'block',
  'available', 'installed', 'vi', 'en'
]);

interface RenderedValueState {
  source: string;
  rendered: string;
}

const textStates = new WeakMap<Text, RenderedValueState>();
const attributeStates = new WeakMap<Element, Map<string, RenderedValueState>>();

function localizeSourceValue(locale: Locale, sourceValue: string): string {
  const match = sourceValue.match(/^(\s*)(.*?)(\s*)$/s);
  if (!match) return sourceValue;
  const [, leading, core, trailing] = match;
  const localized = locale === 'vi' ? translateLiteral('vi', core) : core;
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
  const previous = textStates.get(node);
  const source = !previous || current !== previous.rendered ? current : previous.source;
  const next = localizeSourceValue(locale, source);

  textStates.set(node, { source, rendered: next });
  if (next !== current) node.data = next;
}

function localizeAttribute(element: Element, attribute: typeof translatedAttributes[number], locale: Locale): void {
  const current = element.getAttribute(attribute);
  if (!current) return;

  let states = attributeStates.get(element);
  if (!states) {
    states = new Map<string, RenderedValueState>();
    attributeStates.set(element, states);
  }

  const previous = states.get(attribute);
  const source = !previous || current !== previous.rendered ? current : previous.source;
  const next = localizeSourceValue(locale, source);

  states.set(attribute, { source, rendered: next });
  if (next !== current) element.setAttribute(attribute, next);
}

function localizeElement(element: Element, locale: Locale): void {
  for (const attribute of translatedAttributes) localizeAttribute(element, attribute, locale);

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
