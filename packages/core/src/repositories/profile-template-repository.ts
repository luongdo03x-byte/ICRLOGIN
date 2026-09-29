import type { ProfileTemplate } from '@icrlogin/shared';
import type { Database } from '../db/database.js';

type TemplateRow = {
  id: string;
  name: string;
  config_json: string;
  tag_ids_json: string;
  extension_ids_json: string;
  created_at: string;
  updated_at: string;
};

function mapRow(row: TemplateRow): ProfileTemplate {
  return {
    id: row.id,
    name: row.name,
    config: JSON.parse(row.config_json),
    tagIds: JSON.parse(row.tag_ids_json),
    extensionIds: JSON.parse(row.extension_ids_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class ProfileTemplateRepository {
  constructor(private readonly db: Database) {}

  create(template: ProfileTemplate): ProfileTemplate {
    this.db.prepare(`
      INSERT INTO profile_templates(
        id, name, config_json, tag_ids_json, extension_ids_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      template.id,
      template.name,
      JSON.stringify(template.config),
      JSON.stringify(template.tagIds),
      JSON.stringify(template.extensionIds),
      template.createdAt,
      template.updatedAt
    );
    return template;
  }

  list(): ProfileTemplate[] {
    return (this.db.prepare('SELECT * FROM profile_templates ORDER BY name COLLATE NOCASE').all() as TemplateRow[]).map(mapRow);
  }

  getById(id: string): ProfileTemplate | null {
    const row = this.db.prepare('SELECT * FROM profile_templates WHERE id = ?').get(id) as TemplateRow | undefined;
    return row ? mapRow(row) : null;
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM profile_templates WHERE id = ?').run(id);
  }
}
