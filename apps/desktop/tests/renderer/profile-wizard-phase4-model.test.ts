import { describe, expect, it } from 'vitest';
import { applyTemplateToDraft, type ProfileDraft } from '../../src/renderer/src/pages/profiles/profile-wizard-model.js';

const draft: ProfileDraft = {
  name: 'New', description: '', browserVersion: '143', groupId: '', proxyId: '', userAgent: '',
  language: 'en-US', timezone: 'UTC', environmentMode: 'auto', latitude: '', longitude: '', accuracy: '',
  windowWidth: '1280', windowHeight: '800', screenWidth: '1920', screenHeight: '1080',
  webrtcEnabled: true, geolocationMode: 'ask', startupUrlsText: ''
};

describe('phase 4 profile wizard model', () => {
  it('applies template configuration without overwriting the profile name', () => {
    const output = applyTemplateToDraft(draft, {
      browserVersion: '144', groupId: 'g1', proxyId: 'p1', language: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh',
      environmentMode: 'manual', latitude: 21.0285, longitude: 105.8542, accuracy: 25,
      windowWidth: 900, windowHeight: 700, startupUrls: ['https://example.test']
    });
    expect(output.name).toBe('New');
    expect(output.browserVersion).toBe('144');
    expect(output.groupId).toBe('g1');
    expect(output.environmentMode).toBe('manual');
    expect(output.latitude).toBe('21.0285');
    expect(output.longitude).toBe('105.8542');
    expect(output.accuracy).toBe('25');
    expect(output.startupUrlsText).toBe('https://example.test');
  });
});
