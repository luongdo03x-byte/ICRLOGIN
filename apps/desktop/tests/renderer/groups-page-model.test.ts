import { describe, expect, it } from 'vitest';
import { DELETE_GROUP_CONFIRMATION, validateGroupName } from '../../src/renderer/src/pages/groups/group-form-model.js';

describe('groups page model', () => {
  it('trims valid group names and rejects blank names', () => {
    expect(validateGroupName('  Work  ', [])).toEqual({ ok: true, value: 'Work' });
    expect(validateGroupName('   ', [])).toEqual({ ok: false, message: 'Group name is required' });
  });

  it('rejects duplicate group names case-insensitively', () => {
    expect(validateGroupName('work', ['Work', 'Social'])).toEqual({ ok: false, message: 'A group with this name already exists' });
  });

  it('states that deleting a group moves profiles to Ungrouped', () => {
    expect(DELETE_GROUP_CONFIRMATION.includes('Ungrouped')).toBe(true);
    expect(DELETE_GROUP_CONFIRMATION.toLowerCase().includes('delete profiles')).toBe(false);
  });
});
