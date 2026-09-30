import type { Group } from '@icrlogin/shared';
import type { Database } from '../db/database.js';

interface GroupRow {
  id: string;
  name: string;
  sort_order: number;
  profile_count: number;
  created_at: string;
  updated_at: string;
}

function mapRow(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    sortOrder: Number(row.sort_order),
    profileCount: Number(row.profile_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const SELECT_GROUP = `
  SELECT g.id, g.name, g.sort_order, g.created_at, g.updated_at,
         COUNT(p.id) AS profile_count
  FROM groups g
  LEFT JOIN profiles p ON p.group_id = g.id AND p.deleted_at IS NULL
`;

export class GroupRepository {
  constructor(private readonly db: Database) {}

  list(): Group[] {
    return (this.db.prepare(`${SELECT_GROUP} GROUP BY g.id ORDER BY g.sort_order, g.name COLLATE NOCASE`).all() as GroupRow[]).map(mapRow);
  }

  getById(id: string): Group | null {
    const row = this.db.prepare(`${SELECT_GROUP} WHERE g.id = ? GROUP BY g.id`).get(id) as GroupRow | undefined;
    return row ? mapRow(row) : null;
  }

  nextSortOrder(): number {
    const row = this.db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order FROM groups').get() as { next_sort_order: number };
    return Number(row.next_sort_order);
  }

  create(group: Omit<Group, 'profileCount'>): Group {
    this.db.prepare('INSERT INTO groups(id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
      group.id,
      group.name,
      group.sortOrder,
      group.createdAt,
      group.updatedAt
    );
    return { ...group, profileCount: 0 };
  }

  updateName(id: string, name: string, updatedAt: string): Group | null {
    const result = this.db.prepare('UPDATE groups SET name = ?, updated_at = ? WHERE id = ?').run(name, updatedAt, id);
    return result.changes === 0 ? null : this.getById(id);
  }

  profileIds(id: string): string[] {
    return (this.db.prepare('SELECT id FROM profiles WHERE group_id = ? AND deleted_at IS NULL ORDER BY id').all(id) as Array<{ id: string }>).map((row) => row.id);
  }

  deleteAndUngroupProfiles(id: string): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE profiles SET group_id = NULL WHERE group_id = ?').run(id);
      this.db.prepare('DELETE FROM groups WHERE id = ?').run(id);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
