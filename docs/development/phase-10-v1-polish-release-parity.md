# Phase 10 — V1 Polish and Release Parity

Phase 10 closes ICRLogin V1 at the source/release-contract level without adding new product scope.

## Public V1 version matrix

The application now exposes independent compatibility versions rather than treating the app package version as the only version number:

```text
ICRLogin app: app.getVersion()
Local automation API: v1
Database schema: v4
Backup format: v1
```

`LOCAL_API_VERSION`, `CURRENT_DB_SCHEMA_VERSION`, and `BACKUP_FORMAT_VERSION` are explicit source constants. The database constant also asserts that it matches the latest registered migration.

Settings → About reads a typed, read-only IPC payload containing the version matrix, packaged/development state, SQLite health and operational/recovery readiness. The About endpoint is registered after the startup integrity check but outside the healthy-only profile/browser service graph, so it remains available in recovery-only mode.

## Release parity verifier

Run:

```powershell
npm run verify:release-parity
```

The verifier requires the root, desktop, core and shared package versions to match and validates the V1 compatibility baselines:

```text
API = 1
DB schema = 4
Backup format = 1
```

Changing an independently versioned contract in a later release therefore requires an explicit compatibility/release-plan update rather than silently drifting from the V1 baseline.

## Final production release gate

The tagged Windows release workflow now requires the complete V1 gate before signing/publishing:

```text
release parity
→ tag/package version match
→ typecheck
→ all workspace tests
→ lint
→ real Chromium + local API automation smoke
→ unpacked Windows package
→ packaged Electron smoke
→ signing credentials
→ signed NSIS package
→ Authenticode/artifact verification
→ GitHub Release publication
```

This keeps managed-Chromium/CDP validation, desktop packaging validation and installer signing as distinct evidence steps.

## Security boundary

Phase 10 adds only a read-only `about.get()` preload capability. It does not expose environment variables, filesystem paths, package files, update objects, shell APIs or process controls. The public About object contains only app/contract versions, packaged state and readiness/DB-health booleans.

## V1 completion audit

The V1 design completion criteria are represented by implementation/tests across Phase 1–10:

- managed Chromium download/checksum/install and pinned profile lifecycle;
- deterministic profile environment settings and supported proxy protocols;
- localhost-only CDP/local automation API and browser attachment data;
- groups, tags, extensions, templates, cloning and bounded bulk operations;
- backup/restore, config transfer, Trash, SQLite safety backup and non-destructive recovery;
- structured log redaction and managed Chromium CPU/RAM monitoring;
- persistent settings, launch-with-Windows, tray and single-instance ownership;
- Windows NSIS installer and app updater separated from Chromium updates;
- strict Electron/preload/CSP security boundaries;
- runtime reconciliation identity hardening;
- migration, recovery, real-Chromium and packaged-Electron release gates.

The production evidence procedure is documented in [`v1-release-checklist.md`](v1-release-checklist.md).

## Verification status

The source implementation, typed contracts, tests and release workflows are present. GitHub-hosted Actions remained unavailable during implementation runs: jobs were created but showed `runner_id=0` with empty/null step arrays. Those failures occurred before checkout or any configured test/build step.

Therefore the accurate status at this phase boundary is:

```text
V1 source implementation: complete
Production Windows release verification: pending runner execution + signed install/update evidence
```

A V1 build should only be described as fully release-verified after the complete checklist and signed release workflow execute successfully on Windows.
