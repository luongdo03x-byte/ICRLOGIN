# ICRLogin Phase 5 — Backup, Restore, Import/Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe, versioned profile backup/restore, config-only import/export, Trash permanent-delete workflows, and automatic SQLite safety backups without exposing secrets or Chromium binaries.

**Architecture:** Backup/restore remains Core-owned and UI-independent. Profile archives are streamed ZIP files with an ICRLogin manifest and deterministic SHA-256 payload index; restore validates the entire archive into staging before changing SQLite or profile directories. Desktop IPC/preload exposes only typed operations and public metadata, while filesystem paths and database backup locations remain main-process/Core internal details.

**Tech Stack:** TypeScript, Node.js streams/fs/crypto, SQLite/better-sqlite3, Zod, `yazl` for ZIP writing, existing `yauzl` for ZIP reading, Electron/React typed IPC.

**Spec:** `docs/superpowers/specs/2026-09-27-icrlogin-v1-design.md`

## Global Constraints

- Windows 10/11 x64, local-first, Chromium-only.
- Full profile backup is allowed only while the profile is stopped.
- Full backup includes profile metadata, Chromium `user-data`, tags/extensions assignment metadata, but never Chromium binaries.
- Backup/import/export must never contain proxy passwords, API tokens, encrypted secret blobs, logs, or arbitrary managed filesystem paths.
- Restore validates format compatibility and all payload checksums before mutating DB/profile data.
- Restore uses staging and assigns a new UUID when the archived profile ID collides with an existing active/deleted profile.
- Config-only `.icrprofile.json` never contains Chromium user-data/cookies/session state.
- Long-running archive/copy operations stream data and must not load whole profiles into memory.
- Profile runtime-sensitive operations use the same `ProfileOperationLock`/runtime gate already shared with BrowserService.
- Renderer remains isolated: no `fs`, `node:`, Electron, archive, SQLite, shell, or internal-path access.
- No fingerprint spoofing, stealth extensions, CAPTCHA bypass, or platform-detection bypass is added.

## Review Focus

1. **Archive path traversal / symlink entries:** restore rejects absolute, `..`, NUL, drive-letter and symlink archive entries before extraction.
2. **Tampered/incomplete archive:** a single missing/modified payload entry causes restore to fail before DB/filesystem promotion.
3. **Crash between filesystem and DB steps:** staging/rollback leaves either the old valid state or no restored profile, never a half-profile.
4. **Reference drift:** missing group/proxy/tag/extension IDs on restore/import are handled deterministically without creating dangling foreign keys or secrets.
5. **Large profile data:** backup/restore copies and hashes via streams; tests pin that archive APIs accept streams/files rather than `Buffer`-whole-profile inputs.

---

### Task 1: Backup contracts and schema migration 004

**Files:**
- Create: `packages/shared/src/backup.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/core/src/db/migrations/004.ts`
- Modify: `packages/core/src/db/migrate.ts`
- Test: `packages/shared/tests/contracts.test.ts`
- Test: `packages/core/tests/database.test.ts`

**Interfaces:**
- Produces `BACKUP_FORMAT_VERSION = 1`, `BackupMode = 'metadata' | 'full'`, `BackupManifest`, `ProfileConfigExport`, restore/import result DTOs and strict Zod schemas.
- Produces migration 004 table `backup_history(id, profile_id NULL, mode, file_name, checksum, status, created_at)` with `profile_id ... ON DELETE SET NULL`.

- [ ] **Step 1: Write failing contract/migration tests** for strict manifest versioning, export secret-field rejection, migration order `[1,2,3,4]`, and backup-history FK behavior.
- [ ] **Step 2: Run focused tests**; expected FAIL because backup contracts/migration 004 do not exist.
- [ ] **Step 3: Implement contracts and migration 004** with no public filesystem path field.
- [ ] **Step 4: Run focused tests**; expected PASS.
- [ ] **Step 5: Commit** `feat: add backup contracts and history schema`.

### Task 2: Streaming archive writer/reader and payload checksum index

**Files:**
- Modify: `packages/core/package.json` (`yazl`)
- Create: `packages/core/src/backups/archive-writer.ts`
- Create: `packages/core/src/backups/archive-reader.ts`
- Create: `packages/core/src/backups/archive-safety.ts`
- Test: `packages/core/tests/backup-archive.test.ts`

**Interfaces:**
- `BackupArchiveWriter.write(destination, entries, manifestBase): Promise<{ checksum:string; manifest:BackupManifest }>` where file entries are paths/streams, not whole-profile buffers.
- `BackupArchiveReader.inspect(archivePath): Promise<ValidatedBackupArchive>` validates safe entry names, manifest schema, required entries and per-entry SHA-256 payload index before extraction.
- Payload checksum is derived from sorted `(entryName, sha256, byteLength)` records, excluding the manifest itself, avoiding self-referential archive hashes.

- [ ] **Step 1: Write failing tests** for streaming file entries, deterministic checksum, missing/tampered entry, duplicate entry, `../`, absolute/drive/NUL paths and symlink ZIP entries.
- [ ] **Step 2: Run focused test**; expected FAIL because archive primitives do not exist.
- [ ] **Step 3: Implement safe streaming ZIP writer/reader** using `yazl` + `yauzl`; extraction is not performed by `inspect()`.
- [ ] **Step 4: Run focused test**; expected PASS.
- [ ] **Step 5: Commit** `feat: add safe backup archive primitives`.

### Task 3: Backup history repository and ProfileBackupService

**Files:**
- Create: `packages/core/src/repositories/backup-history-repository.ts`
- Create: `packages/core/src/backups/profile-backup-service.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/profile-backup-service.test.ts`

**Interfaces:**
- `ProfileBackupService.backup(profileId, mode): Promise<BackupRecordPublic>`.
- Depends on `ProfileRepository`, `ProfileFiles`, `TagService`/relation reader, `ExtensionService`, `BrowserService.getState`, shared `ProfileOperationLock`, `BackupArchiveWriter`, `BackupHistoryRepository`, `AppPaths`.
- Archive layout: `manifest.json`, `profile.json`, `tags.json`, `extensions.json`; full mode additionally contains `user-data/**`.

- [ ] **Step 1: Write failing tests** for metadata archive contents, full `user-data` sentinel preservation, full-backup running-state rejection, same profile lock serialization, no browser binaries/secrets/internal extension paths, failed archive history status.
- [ ] **Step 2: Run focused test**; expected FAIL because service/repository do not exist.
- [ ] **Step 3: Implement backup service** using staging file `backups/.tmp-<uuid>.icrbackup` then atomic rename to final `.icrbackup`.
- [ ] **Step 4: Run focused test**; expected PASS.
- [ ] **Step 5: Commit** `feat: add profile backup service`.

### Task 4: ProfileRestoreService with staging, collision handling and reference drift

**Files:**
- Create: `packages/core/src/backups/profile-restore-service.ts`
- Modify: `packages/core/src/profiles/profile-files.ts`
- Test: `packages/core/tests/profile-restore-service.test.ts`

**Interfaces:**
- `ProfileRestoreService.restore(archivePath): Promise<RestoreProfileResult>`.
- Restore result contains public `profile`, `sourceProfileId`, `createdProfileId`, `idCollision:boolean`, and string warning codes; never internal paths.
- Reference rule: existing group/proxy IDs are preserved; missing group/proxy become `null` with warnings; missing tag/extension IDs are skipped with warnings. No proxy record or secret is synthesized.

- [ ] **Step 1: Write failing tests** for checksum failure before mutation, full restore user-data sentinel, metadata restore clean user-data, UUID collision → new UUID, stale relation warnings, archive browser version preserved, DB failure rollback, filesystem promotion failure rollback.
- [ ] **Step 2: Run focused test**; expected FAIL because restore service does not exist.
- [ ] **Step 3: Implement restore staging** under `profiles/.restore-<uuid>`; validate/inspect first, extract safe entries second, create metadata/relations in a DB transaction-compatible unit, atomically promote last.
- [ ] **Step 4: Run focused test**; expected PASS.
- [ ] **Step 5: Commit** `feat: add atomic profile restore`.

### Task 5: Config-only `.icrprofile.json` export/import

**Files:**
- Create: `packages/core/src/backups/profile-config-transfer-service.ts`
- Test: `packages/core/tests/profile-config-transfer-service.test.ts`

**Interfaces:**
- `exportProfile(profileId, destination): Promise<void>` writes `ProfileConfigExport` format version 1.
- `importProfile(source, requestedName?): Promise<ImportProfileResult>` creates a clean profile directory and applies only deterministic config/tag/extension IDs that still exist.
- Export contains no timestamps that imply session state, no `deletedAt`, cookies, user-data path, proxy password/token, extension source path or browser binary path.

- [ ] **Step 1: Write failing tests** for sanitized export JSON, strict version rejection, clean imported user-data, requested-name override, stale reference warnings and create rollback.
- [ ] **Step 2: Run focused test**; expected FAIL because transfer service does not exist.
- [ ] **Step 3: Implement export/import** reusing ProfileService and relation services instead of duplicating SQL.
- [ ] **Step 4: Run focused test**; expected PASS.
- [ ] **Step 5: Commit** `feat: add profile config import export`.

### Task 6: Trash listing and atomic permanent delete

**Files:**
- Modify: `packages/core/src/repositories/profile-repository.ts`
- Modify: `packages/core/src/profiles/profile-files.ts`
- Modify: `packages/core/src/profiles/profile-service.ts`
- Test: `packages/core/tests/profile-trash.test.ts`

**Interfaces:**
- `ProfileService.listTrash(): Promise<Profile[]>` returns only soft-deleted profiles.
- `ProfileService.permanentDelete(id): Promise<void>` only accepts deleted/stopped profiles.
- Filesystem delete uses `trash/<id> -> trash/.purging-<id>-<uuid>` staging; DB hard delete occurs before staged removal commit; DB failure rolls rename back.

- [ ] **Step 1: Write failing tests** for list/restore, active-profile permanent-delete rejection, runtime rejection, DB-failure rollback and successful cascade cleanup.
- [ ] **Step 2: Run focused test**; expected FAIL because permanent delete/list-trash APIs do not exist.
- [ ] **Step 3: Implement repository/files/service operations** using the shared profile runtime mutation gate where required.
- [ ] **Step 4: Run focused test**; expected PASS.
- [ ] **Step 5: Commit** `feat: add profile trash permanent delete`.

### Task 7: Automatic SQLite safety backups and retention

**Files:**
- Create: `packages/core/src/backups/database-backup-service.ts`
- Modify: `packages/core/src/db/database.ts`
- Modify: `packages/core/src/db/migrate.ts`
- Modify: `apps/desktop/src/main/app-services.ts`
- Test: `packages/core/tests/database-backup-service.test.ts`
- Test: `packages/core/tests/database.test.ts`

**Interfaces:**
- `DatabaseBackupService.create(reason:'migration'|'restore'): Promise<string>` uses SQLite online backup semantics and retains the newest 10 automatic DB backups.
- `migrate()` accepts an optional `beforeMigration` hook that runs once only when pending migrations exist.
- Profile restore invokes a DB safety backup immediately before first DB mutation, after archive validation/extraction succeeds.

- [ ] **Step 1: Write failing tests** for no backup when schema current, backup before migration 004 on old fixture, restore pre-mutation backup, retention newest 10 and backup failure aborting migration/restore.
- [ ] **Step 2: Run focused tests**; expected FAIL because DB backup service/hook do not exist.
- [ ] **Step 3: Implement online DB backup + retention and wire migration/restore**.
- [ ] **Step 4: Run focused tests**; expected PASS.
- [ ] **Step 5: Commit** `feat: add automatic database safety backups`.

### Task 8: Typed IPC/preload for backup, restore, transfer and trash

**Files:**
- Modify: `packages/shared/src/desktop-api.ts`
- Modify: `apps/desktop/src/main/app-services.ts`
- Modify: `apps/desktop/src/main/ipc.ts`
- Modify: `apps/desktop/src/preload/bridge.ts`
- Test: `apps/desktop/tests/ipc-phase5.test.ts`
- Test: `apps/desktop/tests/preload-phase5.test.ts`

**Interfaces:**
- Add explicit methods: `backups.list`, `profiles.backup`, `profiles.restoreBackup`, `profiles.exportConfig`, `profiles.importConfig`, `profiles.listTrash`, `profiles.restoreTrash`, `profiles.permanentDelete`.
- Renderer selects source/destination through narrow main-process dialogs/typed operations; no generic read/write/file API is exposed.
- IPC responses never include backup absolute path, DB path, profile user-data path or secret material.

- [ ] **Step 1: Write failing IPC/preload tests** for allowlist shape, schema validation, public DTO redaction, stopped-state guards and absence of generic filesystem primitives.
- [ ] **Step 2: Run focused tests**; expected FAIL because Phase-5 channels are missing.
- [ ] **Step 3: Wire one Core service graph** and explicit handlers/bridge methods.
- [ ] **Step 4: Run focused tests**; expected PASS.
- [ ] **Step 5: Commit** `feat: expose backup restore desktop api`.

### Task 9: Desktop backup/export/import and Trash UI

**Files:**
- Modify: `apps/desktop/src/renderer/src/api/icr-client.ts`
- Modify: `apps/desktop/src/renderer/src/pages/profiles/ProfilesPage.tsx`
- Create: `apps/desktop/src/renderer/src/pages/profiles/BackupProfileDialog.tsx`
- Create: `apps/desktop/src/renderer/src/pages/profiles/ImportExportDialog.tsx`
- Create: `apps/desktop/src/renderer/src/pages/trash/TrashPage.tsx`
- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Modify: `apps/desktop/src/renderer/src/phase4.css` or create `phase5.css`
- Test: `apps/desktop/tests/renderer/backup-trash-model.test.ts`

**Interfaces:**
- Profiles row menu adds Backup, Export config and Trash actions.
- Profiles toolbar adds Import config / Restore backup and secondary Trash view; six primary sidebar items remain unchanged.
- Full backup control is disabled for any runtime state other than `stopped`; metadata backup remains available.
- Trash permanent-delete requires explicit confirmation naming the profile and cannot be undone.

- [ ] **Step 1: Write failing pure-model tests** for backup action availability, restore/import result warnings, Trash confirmation and stable six-item primary navigation.
- [ ] **Step 2: Run focused test**; expected FAIL because Phase-5 UI model/actions do not exist.
- [ ] **Step 3: Implement UI using typed client only** with React Query invalidation after restore/import/trash operations.
- [ ] **Step 4: Run renderer/security focused tests**; expected PASS and no `node:`/Electron imports in renderer.
- [ ] **Step 5: Commit** `feat: add backup restore and trash ui`.

### Task 10: End-to-end backup/restore regression gate and docs

**Files:**
- Create: `packages/core/tests/backup-restore.integration.test.ts`
- Modify: `package.json` if a dedicated backup integration script is useful.
- Create: `docs/development/phase-5-backup-restore.md`
- Modify: `README.md`

**Interfaces:**
- Integration fixture creates a profile, metadata relations and `user-data` sentinel, produces full backup, soft/permanent deletes original, restores archive and verifies metadata/relations/user-data with a collision-safe UUID.

- [ ] **Step 1: Write failing integration test** for full round-trip plus tampered-archive no-mutation behavior.
- [ ] **Step 2: Run integration test RED** before final wiring if anything remains missing.
- [ ] **Step 3: Complete only required wiring/docs**; document `.icrbackup` format v1, `.icrprofile.json` v1, reference-warning behavior, no-secret boundary and Trash semantics.
- [ ] **Step 4: Run fresh Phase-5 gate:** `npm run typecheck`, `npm test`, `npm run lint`, desktop build, backup/restore integration, existing Chromium/CDP integration, renderer security scan. Record infrastructure blockers explicitly if runners/package network still do not execute.
- [ ] **Step 5: Whole-branch review** from Phase-4 base; Critical/Important findings get one RED→GREEN fix pass, Minor findings are ledgered.
- [ ] **Step 6: Commit** `docs: complete phase 5 backup restore`.
