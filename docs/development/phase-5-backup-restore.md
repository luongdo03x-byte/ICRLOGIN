# Phase 5 — Backup, Restore, Import/Export and Trash

Phase 5 adds local profile recovery workflows without widening the renderer security boundary.

## Profile backup

ICRLogin writes versioned `.icrbackup` ZIP archives. Format v1 contains `manifest.json`, `profile.json`, tag and extension assignment metadata, and optionally `user-data/**` for a full backup. Chromium binaries are never included.

- Metadata backup may run while a profile is stopped or running.
- Full backup requires the profile runtime state to be `stopped`.
- Every payload entry records SHA-256 and byte length; the manifest also contains a deterministic payload checksum.
- Archive paths are canonicalized and zip-slip, duplicate paths and symlink entries are rejected.
- Extraction verifies the payload again while writing staging files, so an archive swap between inspection and extraction is rejected.
- Completed/failed operations are recorded in `backup_history` using public metadata only.

## Restore

Restore is staged under the managed profile root and validates the complete archive before profile mutation. Metadata is schema-checked, reference drift is resolved, and only then is the profile created and the staging directory atomically promoted.

A restore preserves the archived browser version. If the archived profile UUID already exists, a new UUID is allocated. Missing optional references do not make a recoverable archive unusable:

- `GROUP_REFERENCE_MISSING` — group cleared to Ungrouped.
- `PROXY_REFERENCE_MISSING` — proxy cleared to Direct.
- `TAG_REFERENCES_SKIPPED` — unavailable tags omitted.
- `EXTENSION_REFERENCES_SKIPPED` — unavailable extensions omitted.

A SQLite safety backup is created after archive validation/extraction and immediately before restore mutates database state.

## Config transfer

`.icrprofile.json` format v1 is config-only. It contains deterministic profile configuration plus tag/extension IDs. It deliberately excludes cookies, Chromium user-data, runtime/session state, proxy credentials, encrypted secret material and internal absolute paths.

Import creates a fresh profile directory and uses the same stale-reference warnings as archive restore. The desktop selects import/export files using narrow Electron file dialogs; the renderer receives no generic filesystem primitive.

## Trash

Normal Delete is soft delete: the profile directory moves to `trash/<profile-id>` and the database row gets `deleted_at`. Restore moves the directory back and clears the tombstone.

Permanent Delete is a separate operation. It is allowed only for a soft-deleted, stopped profile. The trash directory is first renamed to a `.purging-*` staging name. If the database hard delete fails, the filesystem rename is rolled back. After the database delete succeeds, staged files are removed.

## Database safety backups

Before pending schema migrations and before archive-restore mutation, ICRLogin uses SQLite's online backup API to create a safety copy under `backups/database`. Automatic database backups retain the newest 10 files by default. A failed backup aborts the protected mutation.

## Desktop/API security boundary

Phase 5 is exposed through explicit typed IPC channels and the preload allowlist. There is no renderer access to generic filesystem, shell, process, database or secret APIs. File dialogs return selected paths only inside the main process and service results return sanitized metadata.

## Verification

The Phase-5 gate includes unit tests, archive security tests, database-backup tests, preload allowlist tests and a full backup/restore SQLite/filesystem integration test. The GitHub Actions workflow is configured to run typecheck, tests, lint, desktop build and Chromium integration. During implementation on 2026-10-01, GitHub Actions jobs were being created but terminated before any step was assigned (`steps=[]`), so CI execution remained an infrastructure blocker rather than evidence of a passing or failing code test.
