import { describe, expect, it } from 'vitest';
import { buildProxySubmitInput, validateProxyPort } from '../../src/renderer/src/pages/proxy/proxy-form-model.js';

describe('proxy form model', () => {
  it('accepts ports 1..65535 and rejects invalid values', () => {
    expect(validateProxyPort('8080')).toEqual({ ok: true, value: 8080 });
    expect(validateProxyPort('0').ok).toBe(false);
    expect(validateProxyPort('65536').ok).toBe(false);
    expect(validateProxyPort('abc').ok).toBe(false);
  });

  it('omits blank password while editing so existing secret is preserved', () => {
    const input = buildProxySubmitInput({ name: 'US', type: 'http', host: '127.0.0.1', port: '8080', username: 'alice', password: '' }, true);
    expect(input.ok).toBe(true);
    if (input.ok) expect('password' in input.value).toBe(false);
  });

  it('allows a new proxy to send a non-empty password without encryptedPassword fields', () => {
    const input = buildProxySubmitInput({ name: 'US', type: 'socks5', host: 'proxy.test', port: '1080', username: 'alice', password: 'secret' }, false);
    expect(input.ok).toBe(true);
    if (input.ok) {
      expect(input.value.password).toBe('secret');
      expect('encryptedPassword' in input.value).toBe(false);
    }
  });
});
