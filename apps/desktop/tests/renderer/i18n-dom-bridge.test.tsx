/** @vitest-environment jsdom */
import './setup.js';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nDomBridge } from '../../src/renderer/src/i18n/I18nDomBridge.js';
import { i18nStore } from '../../src/renderer/src/i18n/react.js';

beforeEach(() => {
  window.localStorage.clear();
  i18nStore.setLocale('vi');
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('I18nDomBridge', () => {
  it('localizes UI text, preserves table user data, and switches back to English', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);

    render(<>
      <I18nDomBridge />
      <button type="button">Profiles</button>
      <table><tbody><tr><td>Profiles</td></tr></tbody></table>
    </>, { container: root });

    expect(screen.getByRole('button').textContent).toBe('Hồ sơ');
    expect(root.querySelector('tbody td')?.textContent).toBe('Profiles');

    act(() => i18nStore.setLocale('en'));
    expect(screen.getByRole('button').textContent).toBe('Profiles');
    expect(root.querySelector('tbody td')?.textContent).toBe('Profiles');
  });
});
