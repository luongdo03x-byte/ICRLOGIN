import type { Tag } from '@icrlogin/shared';
import type { Database } from '../db/database.js';

type TagRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

function mapRow(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class TagRepository {
  constructor(private readonly db: Database) {}

  list(): Tag[] {
    return (this.db.prepare('SELECT * FROM tags ORDER BY name COLLATE NOCASE').all() as TagRow[]).map(mapRow);
  }

  getById(id: string): Tag | null {
    const row = this.db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as TagRow | undefined;
    return row ? mapRow(row) : null;
  }

  create(tag: Tag): Tag {
    this.db.prepare('INSERT INTO tags(id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
      tag.id,
      tag.name,
      tag.createdAt,
      tag.updatedAt
    );
    return tag;
  }

  updateName(id: string, name: string, updatedAt: string): Tag | null {
    const result = this.db.prepare('UPDATE tags SET name = ?, updated_at = ? WHERE id = ?').run(name, updatedAt, id);
    return result.changes === 0 ? null : this.getById(id);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM tags WHERE id = ?').run(id);
  }

  existingIds(ids: string[]): Set<string> {
    if (ids.length === 0) return new Set();
    const placeholders = ids.map(() => '?').join(', ');
    const rows = this.db.prepare(`SELECT id FROM tags WHERE id IN (${placeholders})`).all(...ids) as Array<{ id: string }>;
    return new Set(rows.map((row) => row.id));
  }

  setProfileTags(profileId: string, tagIds: string[]): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM profile_tags WHERE profile_id = ?').run(profileId);
      const insert = this.db.prepare('INSERT INTO profile_tags(profile_id, tag_id) VALUES (?, ?)');
      for (const tagId of tagIds) insert.run(profileId, tagId);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  addProfileTags(profileId: string, tagIds: string[]): void {
    const insert = this.db.prepare('INSERT OR IGNORE INTO profile_tags(profile_id, tag_id) VALUES (?, ?)');
    for (const tagId of tagIds) insert.run(profileId, tagId);
  }

  removeProfileTags(profileId: string, tagIds: string[]): void {
    const remove = this.db.prepare('DELETE FROM profile_tags WHERE profile_id = ? AND tag_id = ?');
    for (const tagId of tagIds) remove.run(profileId, tagId);
  }
}
