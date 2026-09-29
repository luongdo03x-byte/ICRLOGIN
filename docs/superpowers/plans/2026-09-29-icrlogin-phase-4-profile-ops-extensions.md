# ICRLogin Phase 4 Profile Operations + Extensions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tags, safe profile cloning/templates, extension import/assignment/loading, and bounded bulk profile operations to the existing local-first ICRLogin desktop/Core stack.

**Architecture:** Extend the existing SQLite/Core service graph rather than adding a parallel subsystem. Metadata lives in SQLite; profile user-data and imported extension payloads remain filesystem-backed under the existing ICRLogin data root. Desktop renderer continues to use typed allowlisted IPC only; browser extension paths are resolved inside Core and passed to Chromium as validated internal paths.

**Tech Stack:** Electron + React + TypeScript + Node.js 22 + SQLite + Zod + React Query + Zustand + Vitest; existing `yauzl` for ZIP/CRX payload extraction and existing Chromium launcher/process lifecycle.

**Spec:** `docs/superpowers/specs/2026-09-27-icrlogin-v1-design.md`

## Global Constraints

- Windows 10/11 x64 remains the production target; Chromium-only V1.
- Data stays local under the configured ICRLogin data root; renderer never receives arbitrary filesystem/process/database primitives.
- Profiles still have one running Chromium instance maximum; full clone and destructive filesystem operations require `stopped` state.
- Config clone never copies cookies/session/history/cache/IndexedDB; full clone copies the source Chromium `user-data` into a distinct new profile directory.
- Templates store configuration references only; they never contain cookies, sessions, proxy passwords, API tokens, or browser user-data.
- Tags are many-to-many; a profile still belongs to at most one group.
- Extension sources are local only. Imported unpacked folders and CRX2/CRX3 packages are copied/extracted into `%LOCALAPPDATA%/ICRLogin/extensions/<extension-uuid>/`; launch never accepts an arbitrary renderer-supplied path.
- Extension archive extraction must reject absolute paths, `..` traversal, NUL paths, malformed CRX headers, and missing/invalid `manifest.json`.
- Browser launch loads only globally enabled extensions assigned to the profile directly or through its group; duplicates resolve to one internal extension directory.
- Bulk start default concurrency is `3`, configurable only in range `1..5`; partial failures do not roll back unrelated successes.
- No fingerprint fabrication, stealth extensions, CAPTCHA bypass, detection bypass, arbitrary Chromium flags, or account-abuse automation is added.

## Review Focus

1. **Clone atomicity:** filesystem copy failure or DB failure must never leave a visible half-cloned profile or shared user-data directory.
2. **Extension package safety:** CRX/ZIP/unpacked import cannot escape staging, follow unsafe paths into the data root, or persist a package without a valid manifest.
3. **Runtime races:** full clone, browser-version change, extension mutation that affects launch state, and delete remain blocked while the profile is not `stopped`.
4. **Bulk partial failure:** one failed profile start/stop/move/tag action reports that item only; successful items remain successful and retry targets only failures.
5. **Reference drift:** deleted groups/proxies/extensions/tags referenced by templates or bulk requests produce stable validation errors rather than corrupt foreign keys or silent filesystem access.

---

### Task 1: Phase-4 shared contracts and migration 003

**Files:**
- Create: `packages/shared/src/tag.ts`
- Create: `packages/shared/src/extension.ts`
- Create: `packages/shared/src/profile-template.ts`
- Create: `packages/shared/src/bulk.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/core/src/db/migrations/003.ts`
- Modify: `packages/core/src/db/migrate.ts`
- Modify: `packages/core/tests/database.test.ts`
- Modify: `packages/shared/tests/contracts.test.ts`

**Interfaces:**
- Produces `Tag`, `ExtensionRecord`, `ExtensionSourceType`, `ProfileTemplate`, `BulkItemResult<T>`, clone/template/bulk input schemas.
- Migration 003 creates `tags`, `profile_tags`, `extensions`, `profile_extensions`, `group_extensions`, and `profile_templates` with foreign keys/cascades appropriate to metadata references.
- Extension `source_path` is Core-only persistence and is not part of renderer public DTOs.

- [ ] **Step 1: Write failing contract/migration tests** for tag normalization, extension source enums, template secret exclusions, unique profile-tag pairs, extension assignment FKs, and migration order `[1,2,3]`.
- [ ] **Step 2: Run** shared + database focused suites and verify RED for missing contracts/migration.
- [ ] **Step 3: Implement contracts and migration 003**; update migration registry.
- [ ] **Step 4: Re-run focused suites and verify GREEN.**
- [ ] **Step 5: Commit** `feat: add phase 4 metadata schema`.

### Task 2: Tag repository/service and profile tag projection

**Files:**
- Create: `packages/core/src/repositories/tag-repository.ts`
- Create: `packages/core/src/tags/tag-service.ts`
- Modify: `packages/core/src/repositories/profile-repository.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/tag-service.test.ts`

**Interfaces:**
- `TagService.list/create/rename/delete`.
- `TagService.setProfileTags(profileId, tagIds)` atomically replaces a profile's tag set; `addProfileTags/removeProfileTags` support bulk operations.
- `ProfileRepository.listTagIds(profileId)` and batch projection helpers avoid N+1 queries for profile lists.
- Deleting a tag cascades assignment rows but never deletes profiles.

- [ ] **Step 1: Write failing tests** for create/rename uniqueness, set/add/remove idempotency, deleting a tag, unknown profile/tag validation, and batch profile-tag projection.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement repository/service and exports.**
- [ ] **Step 4: Verify focused suite GREEN.**
- [ ] **Step 5: Commit** `feat: add profile tags`.

### Task 3: Profile config clone, full clone, and templates

**Files:**
- Create: `packages/core/src/profiles/profile-clone-service.ts`
- Create: `packages/core/src/profiles/profile-template-service.ts`
- Modify: `packages/core/src/profiles/profile-files.ts`
- Create: `packages/core/src/repositories/profile-template-repository.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/profile-clone-service.test.ts`
- Test: `packages/core/tests/profile-template-service.test.ts`

**Interfaces:**
- `ProfileCloneService.cloneConfig(sourceId, overrides?)` creates a clean profile with copied metadata/tags/extension assignments and a new empty user-data directory.
- `ProfileCloneService.cloneFull(sourceId, overrides?)` requires source `BrowserService.getState(sourceId) === 'stopped'`, copies source user-data through staging, assigns new UUID, then atomically promotes.
- `ProfileTemplateService.saveFromProfile(profileId, name)`, `list`, `delete`, `createProfile(templateId, overrides?)`.
- Templates store profile configuration plus tag/extension IDs only; stale referenced resources reject instantiation with `INVALID_REQUEST`.

- [ ] **Step 1: Write failing clone tests** for clean clone not copying session files, full clone distinct directories, stopped-state guard, and DB/filesystem rollback on copy failure.
- [ ] **Step 2: Write failing template tests** for secret/session exclusion, round-trip create, stale references, and override name/group/browser settings.
- [ ] **Step 3: Verify RED.**
- [ ] **Step 4: Implement staging clone and template services.**
- [ ] **Step 5: Verify focused suites GREEN.**
- [ ] **Step 6: Commit** `feat: add profile clone and templates`.

### Task 4: Extension import, persistence, and assignment

**Files:**
- Create: `packages/core/src/extensions/extension-importer.ts`
- Create: `packages/core/src/extensions/crx-reader.ts`
- Create: `packages/core/src/extensions/extension-service.ts`
- Create: `packages/core/src/repositories/extension-repository.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/extension-importer.test.ts`
- Test: `packages/core/tests/extension-service.test.ts`

**Interfaces:**
- `ExtensionImporter.importUnpacked(sourceDir)` copies a local unpacked extension into internal staging, validates `manifest.json`, and atomically promotes it.
- `ExtensionImporter.importCrx(crxPath)` supports CRX2/CRX3 headers, extracts only the embedded ZIP payload through the same safe archive-path rules, and validates the resulting manifest.
- `ExtensionService.list/importUnpacked/importCrx/setEnabled/delete`.
- Assignment APIs: `assignToProfile`, `removeFromProfile`, `assignToGroup`, `removeFromGroup`, `listForProfile`.
- Public extension DTO includes id/name/version/sourceType/enabled/assignment counts, never internal source path.

- [ ] **Step 1: Write failing importer tests** for valid unpacked/CRX fixtures, malformed CRX, zip-slip/absolute paths, missing manifest, invalid manifest name/version, and staging cleanup on failure.
- [ ] **Step 2: Write failing service tests** for global enable/disable, profile/group assignments, dedupe, deletion cascade, and public DTO path redaction.
- [ ] **Step 3: Verify RED.**
- [ ] **Step 4: Implement importer/repository/service with canonical internal paths.**
- [ ] **Step 5: Verify focused suites GREEN.**
- [ ] **Step 6: Commit** `feat: add local extension manager core`.

### Task 5: Resolve assigned extensions into Chromium launch

**Files:**
- Modify: `packages/core/src/browsers/chromium-launcher.ts`
- Modify: `packages/core/src/browsers/browser-service.ts`
- Modify: `apps/desktop/src/main/app-services.ts`
- Test: `packages/core/tests/chromium-launcher.test.ts`
- Test: `packages/core/tests/browser-service.test.ts`

**Interfaces:**
- Add `ExtensionRuntimeResolver.resolvePaths(profileId): string[]` to BrowserService dependencies.
- `ChromiumLaunchInput.extensionPaths: string[]` contains Core-resolved directories only.
- Chromium receives one `--load-extension=<comma-separated internal paths>` argument when the resolved list is non-empty; renderer/user input never supplies raw paths or flags.

- [ ] **Step 1: Write failing tests** for profile + group union, disabled extension exclusion, dedupe, no argument when empty, and paths never sourced from profile text fields.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement resolver wiring and launch argument.**
- [ ] **Step 4: Verify focused suites GREEN plus existing proxy-secret command-line regression.**
- [ ] **Step 5: Commit** `feat: load assigned extensions in chromium`.

### Task 6: Bounded bulk operation service

**Files:**
- Create: `packages/core/src/bulk/bulk-operation-service.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/bulk-operation-service.test.ts`

**Interfaces:**
- `startProfiles(ids, concurrency=3)` and `stopProfiles(ids)` return ordered `BulkItemResult` arrays.
- `moveGroup(ids, groupId)`, `assignProxy(ids, proxyId)`, `addTags(ids, tagIds)`, `removeTags(ids, tagIds)`, and `softDelete(ids)` reuse existing services.
- Start concurrency validates integer `1..5`; duplicate profile IDs are de-duplicated preserving first-seen order.
- Partial failures are captured per profile as `{ id, success:false, error:{code,message} }`; unrelated successes are not rolled back.

- [ ] **Step 1: Write failing tests** for max-three default concurrency, configured range, order preservation, duplicate IDs, partial start failure, retrying only failed IDs, and bulk metadata/tag actions.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement bounded worker queue and adapters to existing services.**
- [ ] **Step 4: Verify focused suite GREEN.**
- [ ] **Step 5: Commit** `feat: add bounded bulk profile operations`.

### Task 7: Typed IPC/preload bridge for tags, clone/templates, extensions, and bulk

**Files:**
- Modify: `packages/shared/src/desktop-api.ts`
- Modify: `apps/desktop/src/main/app-services.ts`
- Modify: `apps/desktop/src/main/ipc.ts`
- Modify: `apps/desktop/src/preload/bridge.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Test: `apps/desktop/tests/ipc.test.ts`
- Test: `apps/desktop/tests/preload.test.ts`

**Interfaces:**
- Add allowlisted desktop methods under `tags`, `templates`, `extensions`, `profiles.clone`, and `bulk`.
- Clone mode is `'config' | 'full'`; full clone IPC rejects non-stopped source before filesystem work.
- Extension import IPC accepts a user-selected source path only at the main-process boundary and hands it to ExtensionImporter; renderer never receives stored internal paths.
- No generic `invoke(channel)`, shell, file-read, or arbitrary Chromium-flag primitive is introduced.

- [ ] **Step 1: Write failing IPC tests** for schema validation, DTO redaction, full-clone runtime guard, bulk partial results, extension source import, and template CRUD.
- [ ] **Step 2: Write failing preload allowlist tests** proving the new methods exist and generic invoke/path-read primitives do not.
- [ ] **Step 3: Verify RED.**
- [ ] **Step 4: Implement typed channels/handlers/bridge.**
- [ ] **Step 5: Verify desktop focused suites GREEN.**
- [ ] **Step 6: Commit** `feat: expose phase 4 desktop bridge`.

### Task 8: Profiles UI — tags, clone, templates, and bulk toolbar

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/profiles/ProfilesPage.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/profiles/profiles-model.ts`
- Modify: `apps/desktop/src/renderer/src/pages/profiles/ProfileWizard.tsx`
- Modify: `apps/desktop/src/renderer/src/api/queries.ts`
- Create: `apps/desktop/src/renderer/src/pages/profiles/CloneProfileDialog.tsx`
- Create: `apps/desktop/src/renderer/src/pages/profiles/BulkResultDialog.tsx`
- Test: `apps/desktop/tests/renderer/profiles-phase4-model.test.ts`

**Interfaces:**
- Profile rows display tags; search/filter includes tag selection.
- Multi-select toolbar supports Open, Stop, Move Group, Assign Proxy, Add/Remove Tags, Delete, with progress/result summary and `Retry failed`.
- Context menu exposes Clone Configuration / Clone Full / Save as Template.
- Create wizard can initialize from a selected template; template application never brings session state.

- [ ] **Step 1: Write failing pure-model tests** for tag filters, selection action availability by mixed runtime state, bulk retry set, and clone/template labels.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement query hooks/dialogs/table/bulk toolbar and wizard template initialization.**
- [ ] **Step 4: Run renderer model/RTL focused tests and verify GREEN.**
- [ ] **Step 5: Commit** `feat: add profile clone tags templates and bulk ui`.

### Task 9: Extensions and Templates management UI

**Files:**
- Create: `apps/desktop/src/renderer/src/pages/extensions/ExtensionsPage.tsx`
- Create: `apps/desktop/src/renderer/src/pages/extensions/extensions-model.ts`
- Create: `apps/desktop/src/renderer/src/pages/templates/TemplatesPage.tsx`
- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Modify: `apps/desktop/src/renderer/src/navigation/routes.ts`
- Modify: `apps/desktop/src/renderer/src/api/queries.ts`
- Modify: `apps/desktop/src/renderer/src/styles.css`
- Test: `apps/desktop/tests/renderer/extensions-model.test.ts`
- Test: `apps/desktop/tests/renderer/navigation.test.ts`

**Interfaces:**
- Extensions page lists name/version/source type/global enabled/profile/group usage; actions import unpacked/CRX, enable/disable, assign/unassign, delete.
- Templates page lists templates and supports create-profile/delete; profile source save remains available from Profiles.
- The existing Extensions sidebar placeholder becomes the real page; Templates is reachable from Profiles and optionally a secondary nav entry without removing the approved six primary navigation items.

- [ ] **Step 1: Write failing UI-model/navigation tests** for sanitized rows, disabled actions while affected profile is running where required, primary navigation stability, and assignment counts.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement pages/query hooks/routing/styles.**
- [ ] **Step 4: Verify focused renderer suites GREEN and source scan contains no Node/Electron imports in renderer.**
- [ ] **Step 5: Commit** `feat: add extension and template management ui`.

### Task 10: Phase-4 integration, docs, and regression gate

**Files:**
- Create: `docs/development/phase-4-profile-ops-extensions.md`
- Modify: `README.md`
- Modify: `.github/workflows/ci.yml` only if a new explicit gate command is required
- Test: `packages/core/tests/phase4.integration.test.ts`

**Interfaces:**
- Integration flow: create profile → tags → import benign fixture extension → assign → launch and verify extension launch args → stop → config clone → full clone → template create/instantiate → bounded bulk start/stop → cleanup.
- No test or documentation adds stealth/fingerprint-bypass behavior.

- [ ] **Step 1: Write failing end-to-end Core integration test** for the complete Phase-4 metadata/filesystem flow using temp data roots and a benign extension fixture.
- [ ] **Step 2: Verify RED, then complete any missing composition wiring and verify GREEN.**
- [ ] **Step 3: Document clone/template/extension/bulk semantics and safety boundaries; update README phase summary.**
- [ ] **Step 4: Run final gate:** `npm run typecheck`, `npm test`, `npm run lint`, desktop build, Chromium integration, and Phase-4 integration; record infrastructure-only blockers separately.
- [ ] **Step 5: Whole-branch review** for clone atomicity, extension path safety, runtime races, partial failures, secret/path redaction, and Phase-1/2/3 regression.
- [ ] **Step 6: Commit** `feat: complete ICRLogin phase 4 profile operations`.

## Self-review result

- **Spec coverage:** Tags, config/full clone, templates, extension import/assignment/loading, bounded bulk operations, typed desktop bridge, Profiles UI, and Extensions UI each map to explicit tasks.
- **Filesystem safety:** Full clone and extension import use staging + atomic promotion; CRX/ZIP extraction inherits explicit path-traversal tests and no renderer-stored path is trusted as a launch path.
- **Runtime consistency:** Full clone and launch-affecting profile operations are guarded by `BrowserService.getState`; bulk start reuses the existing per-profile operation lock and lifecycle state machine.
- **Type consistency:** Shared contract names introduced in Task 1 are consumed by services, IPC, and UI without separate duplicate DTO definitions.
- **Review focus coverage:** Atomic clone rollback, unsafe extension packages, runtime races, partial bulk failures, and stale references are all pinned by owning task tests.
- **Deferred intentionally:** Backup/restore, import/export archive formats, process CPU/RAM dashboard, installer/update UI, and Settings remain later phases. Phase 4 does not expand the localhost HTTP API unless a later plan explicitly adds these management operations.
