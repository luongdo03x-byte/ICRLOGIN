# Phase 6 — Monitoring, Logging and Startup Recovery

Phase 6 adds local operational visibility and crash recovery while preserving ICRLogin's narrow Electron security boundary.

## Structured logs

`StructuredLogger` writes JSON Lines records with timestamp, level, event and optional fields. Fields are recursively redacted before serialization. Password/secret/token/authorization/cookie keys and internal executable, source and user-data paths are never emitted as raw values. Strings and collection sizes are bounded to prevent accidental oversized log records.

## Managed Chromium CPU/RAM monitoring

`ProcessMonitor` samples only runtimes already owned by `ProcessRegistry`; it never discovers arbitrary system processes. The default interval is 5 seconds.

- CPU is computed from cumulative process CPU time between samples and normalized by logical CPU count.
- RAM is reported from the Windows working set.
- Reader failures, disappeared PIDs or access errors produce `status: unavailable` rather than crashing the desktop.
- The Windows reader invokes PowerShell with `execFile` and an argument array and validates the returned ProcessId before accepting metrics.

The renderer receives only profile ID, PID, CPU percent, working-set bytes, sample time and availability status. It never receives executable paths, command lines or generic process-control access.

## Startup integrity check and degraded mode

Before migrations, the main process runs `PRAGMA quick_check` through `StartupRecoveryService`. If SQLite does not report `ok`, ICRLogin does not run migrations, runtime reconciliation, monitoring polling or the local automation API. The database is never automatically deleted or recreated.

An unhealthy database starts the desktop in recovery-only degraded mode. The normal Phase 1–5 operational service graph and IPC handlers are not created, so profile, browser, proxy, backup and Trash mutations cannot run against a database that failed integrity checking. The Phase-6 recovery-status IPC remains available so the renderer can report the exact startup health result; process monitoring returns an error envelope until normal services are available again.

## Crash staging reconciliation

Profile staging is database-aware. On a healthy database:

- `.staging-<profileId>-*` and `.restore-<profileId>-*` are promoted to the final profile directory when an active DB row exists and the final directory is absent.
- Orphan staging without a DB row is removed.
- `.purging-<profileId>-*` is moved back to Trash when the soft-deleted DB row still exists, protecting a crash between filesystem staging and hard delete.
- A purge staging directory with no DB row is cleaned as the permanent delete already committed.

When database integrity is unhealthy, profile and Trash staging are preserved instead of guessed at. Only independently safe browser extraction staging and partial browser downloads are cleaned.

## Desktop surface

Settings → Backup & Recovery now includes:

- startup database health and quick-check result;
- count of recovered staging entries, cleaned temp artifacts and recovery errors;
- live CPU/RAM table for managed Chromium runtimes with a 5-second refresh;
- the Phase-5 backup, import/export and Trash controls when operational services are healthy.

All Phase-6 calls use explicit typed IPC channels and the allowlisted preload bridge. No generic process, shell, filesystem or database primitive is exposed.

## Verification

Tests cover recursive log redaction, CPU calculation and unavailable states, Windows process metric parsing, non-destructive unhealthy-DB behavior, database-aware staging reconciliation, real SQLite staging recovery, degraded recovery-only IPC, and preload allowlisting.

GitHub Actions continues to be an infrastructure blocker during implementation: workflow runs are created but jobs have historically terminated before any steps were assigned. Therefore source implementation is present, but typecheck/lint/test/build success must not be claimed until a runner executes the configured CI steps.
