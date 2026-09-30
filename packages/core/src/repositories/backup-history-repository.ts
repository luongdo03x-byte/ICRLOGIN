import type { BackupRecordPublic } from '@icrlogin/shared';
import type { Database } from '../db/database.js';

type BackupRow = {
  id: string;
  profile_id: string | null;
  mode: 'metadata' | 'full';
  file_name: string;
  checksum: string | null;
  status: 'completed' | 'failed';
  created_at: string;
};

function mapRow(row: BackupRow): BackupRecordPublic {
  return {
    id: row.id,
    profileId: row.profile_id,
    mode: row.mode,
    fileName: row.file_name,
    checksum: row.checksum,
    status: row.status,
    createdAt: row.created_at
  };
}

export class BackupHistoryRepository {
  constructor(private readonly db: Database) {}

  create(record: BackupRecordPublic): BackupRecordPublic {
    this.db.prepare(`
      INSERT INTO backup_history(id, profile_id, mode, file_name, checksum, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(record.id, record.profileId, record.mode, record.fileName, record.checksum, record.status, record.createdAt);
    return record;
  }

  list(): BackupRecordPublic[] {
    return (this.db.prepare('SELECT * FROM backup_history ORDER BY created_at DESC, id DESC').all() as BackupRow[]).map(mapRow);
  }
}
