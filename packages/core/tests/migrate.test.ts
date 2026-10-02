import { describe, expect, it } from 'vitest';
import { CURRENT_DB_SCHEMA_VERSION } from '../src/db/migrate.js';

describe('runtime environment migration', () => {
  it('advances the schema to version 5', () => {
    expect(CURRENT_DB_SCHEMA_VERSION).toBe(5);
  });
});
