# ICRLogin Phase 10 — V1 Polish and Release Parity Plan

**Goal:** Finish V1 without adding new product scope: expose a clear version/readiness surface, enforce release-version parity, make the production release workflow run the complete V1 gate, perform a final spec/security audit, and publish a concrete V1 release checklist.

## Task 1 — Version constants and About/readiness contract
- Export local API version and current DB schema version as explicit constants.
- Reuse backup format version.
- Extend the typed desktop health/about payload with app/API/DB/backup versions and recovery health.
- Show the version matrix in Settings → About.

## Task 2 — Release parity verifier
- Add a deterministic script that verifies root/core/shared/desktop package versions match.
- Verify the app/API/DB/backup version constants are present and valid independently.
- Wire verifier into root scripts and release workflow.

## Task 3 — Production release gate parity
- Make tag release run typecheck, unit/integration/API/migration/recovery tests, lint, real Chromium integration, unpacked packaged desktop smoke, then signed NSIS packaging.
- Keep code signing required before GitHub Release publication.

## Task 4 — Final UI polish within existing surfaces
- Add About tab/version matrix and concise readiness state.
- Do not add new navigation/features beyond V1.
- Keep recovery/update/browser-manager behavior unchanged.

## Task 5 — Final V1 spec audit
- Add a machine-readable/static completion test for security boundaries and release commands where useful.
- Review V1 spec completion criteria against implemented Phase 1–10 code.
- Fix Critical/Important gaps only; leave post-V1 enhancements documented, not implemented.

## Task 6 — Release checklist/docs
- Create `docs/development/v1-release-checklist.md` covering Windows install, Chromium download, profile/proxy launch, CDP attach, reconcile, backup/restore, tray/single-instance, update, migration and data preservation.
- Update README to V1 implementation-complete status with the hosted-runner verification caveat.
- Whole-branch review before declaring source completion.
