# ICRLogin Phase 2 Desktop UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Phase-1 Electron shell into a usable Windows desktop manager for Profiles, Groups, Proxies, and managed Chromium versions, with typed IPC and no privileged renderer access.

**Architecture:** Keep Core and SQLite ownership in Electron main. Add missing group/browser orchestration in Core, expose only typed allowlisted operations through preload, and build a React renderer around TanStack Query for server/core state plus Zustand for UI-only navigation/dialog state. Renderer components never import Node/Electron/Core repositories directly.

**Tech Stack:** Electron 38, React 19, TypeScript, Zod, SQLite/better-sqlite3, Vitest, React Testing Library, @tanstack/react-query, Zustand, CSS.

**Spec:** `docs/superpowers/specs/2026-09-27-icrlogin-v1-design.md`

## Global Constraints

- Windows 10/11 x64 remains the target platform; Linux execution is test/development only.
- Renderer must keep `contextIsolation: true`, `nodeIntegration: false`, and sandboxing enabled.
- Renderer must never receive proxy passwords, encrypted password blobs, arbitrary filesystem paths, shell/process primitives, or database handles.
- Profile startup URLs accept HTTP/HTTPS only.
- Managed browser/profile state remains local-first under `%LOCALAPPDATA%\\ICRLogin`.
- Existing profiles keep their pinned Chromium version unless the user explicitly changes it while stopped.
- UI must use original ICRLogin branding; no pixel-copying proprietary GPMLogin assets.
- No fingerprint spoofing, stealth bypass, arbitrary Chromium flags, or anti-detection functionality.
- Behavior-bearing changes follow RED → GREEN → refactor and each task gets its own commit.

## Review Focus

1. **Malformed or hostile renderer payloads:** IPC parses every input with shared Zod schemas and returns a stable serializable error instead of reaching Core with unchecked values.
2. **Secret leakage:** proxy list/edit/profile payloads expose only `hasPassword`; tests assert password/encryptedPassword never cross preload.
3. **Running-profile conflicts:** browser-version changes and destructive profile operations are disabled in UI and rejected in main/Core when a runtime exists.
4. **Group deletion:** deleting a group must move its profiles to Ungrouped and must never delete profiles.
5. **Interrupted browser download:** failed/cancelled verification or extraction must leave no installed-browser record and Browser Manager must surface retryable failure state.

---

### Task 1: Group domain and persistence

**Files:**
- Create: `packages/shared/src/group.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/core/src/db/migrations/002.ts`
- Modify: `packages/core/src/db/migrate.ts`
- Create: `packages/core/src/repositories/group-repository.ts`
- Create: `packages/core/src/groups/group-service.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/group-service.test.ts`
- Modify: `packages/core/tests/database.test.ts`

**Interfaces:**
- Produces `Group`, `CreateGroupInput`, `UpdateGroupInput` and Zod schemas.
- Produces `GroupService.list/create/update/delete`.
- `delete(id)` updates `profiles.group_id = NULL` in the same SQLite transaction before deleting the group.

- [ ] **Step 1: Write failing migration and group-service tests** asserting create/list/rename, duplicate/blank rejection, profile assignment validation, and delete-to-Ungrouped behavior.
- [ ] **Step 2: Run focused tests and verify RED** with migration/service missing.
- [ ] **Step 3: Implement migration 002, repository, service, and shared schemas** with group names trimmed to 1–100 chars.
- [ ] **Step 4: Run focused + database tests and verify GREEN.**
- [ ] **Step 5: Commit** `feat: add group domain and persistence`.

### Task 2: Browser artifact orchestration for desktop use

**Files:**
- Modify: `packages/core/src/browsers/artifact-provider.ts`
- Create: `packages/core/src/browsers/browser-download-installer.ts`
- Modify: `packages/core/src/browsers/browser-version-service.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/browser-download-installer.test.ts`
- Modify: `packages/core/tests/browser-version-service.test.ts`

**Interfaces:**
- Produces `HttpBrowserArtifactProvider(manifestUrl, cachePath)` with cached-manifest fallback.
- Produces `BrowserDownloadInstaller.install(entry, onProgress?)` using the existing ZIP validation/atomic install path.
- Extends BrowserVersionService with `download(version, onProgress?)` as an explicit UI-facing operation while `ensureInstalled` remains lifecycle-facing.

- [ ] **Step 1: Write failing tests** for remote manifest → cache, offline cached fallback, download progress, checksum failure, and no installed record on failed install.
- [ ] **Step 2: Run focused tests and verify RED.**
- [ ] **Step 3: Implement HTTP provider + streamed temp download + installer adapter** without loading the archive fully into memory.
- [ ] **Step 4: Run focused browser tests and verify GREEN.**
- [ ] **Step 5: Commit** `feat: add desktop browser artifact orchestration`.

### Task 3: Main-process service composition

**Files:**
- Create: `apps/desktop/src/main/app-services.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/main/config.ts`
- Test: `apps/desktop/tests/app-services.test.ts`

**Interfaces:**
- Produces `createAppServices(options): AppServices` containing `profiles`, `groups`, `proxies`, `browserVersions`, `browsers`, `registry`, and `runtimeSessions`.
- Browser manifest location is configuration, not hard-coded into renderer; dev/test may inject a manifest provider.

- [ ] **Step 1: Write failing composition tests** asserting one shared repository/service graph and that BrowserService receives the same ProcessRegistry reconciled at startup.
- [ ] **Step 2: Run tests and verify RED.**
- [ ] **Step 3: Extract composition from `main/index.ts`** and wire BrowserVersionService/BrowserService dependencies without exposing them to renderer.
- [ ] **Step 4: Run desktop main tests and verify GREEN.**
- [ ] **Step 5: Commit** `refactor: compose desktop core services`.

### Task 4: Typed desktop API and allowlisted IPC

**Files:**
- Create: `packages/shared/src/desktop-api.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/desktop/src/main/ipc.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Rewrite: `apps/desktop/src/preload/index.ts`
- Test: `apps/desktop/tests/ipc.test.ts`
- Modify: `apps/desktop/tests/main-security.test.ts`

**Interfaces:**
- Produces a typed `IcrDesktopApi` with health; profile list/get/create/update/delete/restore/start/stop; group CRUD; proxy CRUD; browser available/installed/download.
- Main returns serializable `{ ok: true, data } | { ok: false, error: { code, message } }` envelopes.
- `profiles.list` includes runtime state derived from ProcessRegistry but not process handles.

- [ ] **Step 1: Write failing IPC tests** for success routing, malformed payload rejection, unknown ID errors, and proxy secret redaction.
- [ ] **Step 2: Run tests and verify RED.**
- [ ] **Step 3: Implement shared channel schemas and `registerIpcHandlers(services)`** with exact allowlist only.
- [ ] **Step 4: Implement preload bridge methods with no generic `invoke(channel)` exposed to renderer.**
- [ ] **Step 5: Run IPC/security tests and verify GREEN.**
- [ ] **Step 6: Commit** `feat: add typed desktop ipc api`.

### Task 5: Renderer test foundation and application shell

**Files:**
- Modify: `apps/desktop/package.json`
- Create: `apps/desktop/src/renderer/src/types/window.d.ts`
- Create: `apps/desktop/src/renderer/src/api/icr-client.ts`
- Create: `apps/desktop/src/renderer/src/state/ui-store.ts`
- Create: `apps/desktop/src/renderer/src/components/AppShell.tsx`
- Create: `apps/desktop/src/renderer/src/styles/app.css`
- Rewrite: `apps/desktop/src/renderer/src/App.tsx`
- Modify: `apps/desktop/src/renderer/src/main.tsx`
- Create: `apps/desktop/tests/renderer/app-shell.test.tsx`
- Create: `apps/desktop/tests/renderer/setup.ts`

**Interfaces:**
- Adds `@tanstack/react-query`, `zustand`, `@testing-library/react`, `@testing-library/user-event`, and `jsdom`.
- Produces sidebar navigation state for Profiles, Groups, Proxy, Browser Manager, Extensions, Settings.
- `icr-client.ts` unwraps API envelopes and throws typed renderer-safe errors.

- [ ] **Step 1: Write failing shell test** asserting ICRLogin branding, six nav entries, Profiles default selection, and no direct Node/Electron import in renderer.
- [ ] **Step 2: Run renderer test and verify RED.**
- [ ] **Step 3: Implement QueryClient provider, Zustand UI store, shell, and base theme.**
- [ ] **Step 4: Run renderer shell/security tests and verify GREEN.**
- [ ] **Step 5: Commit** `feat: add desktop application shell`.

### Task 6: Profiles page and runtime actions

**Files:**
- Create: `apps/desktop/src/renderer/src/pages/ProfilesPage.tsx`
- Create: `apps/desktop/src/renderer/src/features/profiles/profile-queries.ts`
- Create: `apps/desktop/src/renderer/src/features/profiles/ProfileTable.tsx`
- Create: `apps/desktop/src/renderer/src/features/profiles/ProfileFilters.tsx`
- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Test: `apps/desktop/tests/renderer/profiles-page.test.tsx`

**Interfaces:**
- Profiles rows show Name, Status, Group, Browser, Proxy, User-Agent, Last used, Actions.
- Search covers profile name; filters include status/group/proxy presence; sorting includes name/last-used/browser.
- Open/Stop call typed IPC and invalidate/refetch profile state; runtime state refresh interval is 2 seconds while any profile is running/starting/stopping.

- [ ] **Step 1: Write failing page tests** for rows, search/filter/sort, Open → Stop state, loading/empty/error states, and disabled conflicting actions while running.
- [ ] **Step 2: Run focused renderer tests and verify RED.**
- [ ] **Step 3: Implement queries/table/filter/action controls.**
- [ ] **Step 4: Run focused tests and verify GREEN.**
- [ ] **Step 5: Commit** `feat: add profiles management page`.

### Task 7: Create/Edit Profile wizard

**Files:**
- Create: `apps/desktop/src/renderer/src/features/profiles/ProfileWizard.tsx`
- Create: `apps/desktop/src/renderer/src/features/profiles/profile-form.ts`
- Modify: `apps/desktop/src/renderer/src/pages/ProfilesPage.tsx`
- Test: `apps/desktop/tests/renderer/profile-wizard.test.tsx`

**Interfaces:**
- Steps: General → Proxy → Browser Environment → Startup URLs → Review.
- General: name, group, browser version, description.
- Environment: user-agent, language, timezone, window/screen size, WebRTC, geolocation.
- Startup URLs are one HTTP/HTTPS URL per line and validate before Review/Create.
- Edit reuses the form and blocks browser-version change while runtime state is not stopped.

- [ ] **Step 1: Write failing wizard tests** for defaults, step validation, invalid/non-HTTP URL rejection, saved proxy/browser choices, review summary, create success, and running-profile edit restriction.
- [ ] **Step 2: Run focused tests and verify RED.**
- [ ] **Step 3: Implement form model and wizard UI.**
- [ ] **Step 4: Run focused tests and verify GREEN.**
- [ ] **Step 5: Commit** `feat: add profile create and edit wizard`.

### Task 8: Groups page

**Files:**
- Create: `apps/desktop/src/renderer/src/pages/GroupsPage.tsx`
- Create: `apps/desktop/src/renderer/src/features/groups/group-queries.ts`
- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Test: `apps/desktop/tests/renderer/groups-page.test.tsx`

**Interfaces:**
- Supports create/rename/delete and profile count display.
- Delete confirmation explicitly states profiles move to Ungrouped.

- [ ] **Step 1: Write failing tests** for create/rename/delete, duplicate validation, and delete confirmation copy.
- [ ] **Step 2: Run focused tests and verify RED.**
- [ ] **Step 3: Implement page and query mutations.**
- [ ] **Step 4: Run focused tests and verify GREEN.**
- [ ] **Step 5: Commit** `feat: add groups management page`.

### Task 9: Proxy Manager

**Files:**
- Create: `apps/desktop/src/renderer/src/pages/ProxyPage.tsx`
- Create: `apps/desktop/src/renderer/src/features/proxies/proxy-queries.ts`
- Create: `apps/desktop/src/renderer/src/features/proxies/ProxyDialog.tsx`
- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Test: `apps/desktop/tests/renderer/proxy-page.test.tsx`

**Interfaces:**
- Table shows Name, Type, Host, Port, Auth, Status placeholder/action area, Actions.
- Add/Edit support HTTP/HTTPS/SOCKS5 and credentials; existing password is represented only by `hasPassword` and blank password input means preserve on update.

- [ ] **Step 1: Write failing tests** for add/edit/delete, port validation, password-preserve semantics, and DOM/API fixture assertions that encryptedPassword/password are absent from list payloads.
- [ ] **Step 2: Run focused tests and verify RED.**
- [ ] **Step 3: Implement Proxy Manager and modal.**
- [ ] **Step 4: Run focused tests and verify GREEN.**
- [ ] **Step 5: Commit** `feat: add proxy manager ui`.

### Task 10: Browser Manager

**Files:**
- Create: `apps/desktop/src/renderer/src/pages/BrowserManagerPage.tsx`
- Create: `apps/desktop/src/renderer/src/features/browsers/browser-queries.ts`
- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Test: `apps/desktop/tests/renderer/browser-manager.test.tsx`

**Interfaces:**
- Tabs Available/Installed.
- Available versions show stable marker, size, installed state, Download/Retry, and download progress when available.
- Installed versions show executable availability and profiles-using count; deletion is not exposed in Phase 2 until Core has safe usage enforcement.

- [ ] **Step 1: Write failing tests** for available/installed rendering, stable marker, download success, retryable failure, progress, and offline cached-manifest state.
- [ ] **Step 2: Run focused tests and verify RED.**
- [ ] **Step 3: Implement Browser Manager and query mutations.**
- [ ] **Step 4: Run focused tests and verify GREEN.**
- [ ] **Step 5: Commit** `feat: add browser manager ui`.

### Task 11: Desktop integration polish and Phase-2 gate

**Files:**
- Modify: `apps/desktop/src/renderer/src/styles/app.css`
- Modify: `apps/desktop/tests/main-security.test.ts`
- Create: `apps/desktop/tests/renderer/navigation-smoke.test.tsx`
- Create: `docs/development/phase-2-desktop-ui.md`
- Modify: `README.md`

**Interfaces:**
- Final renderer keeps dense Windows desktop layout: dark sidebar, light workspace, blue accent, consistent empty/loading/error states.
- Extensions and Settings routes render explicit Phase-3/later placeholders rather than dead navigation.

- [ ] **Step 1: Add failing navigation/security smoke tests** covering all six routes and asserting renderer source has no `node:`, `electron`, `fs`, `child_process`, or repository imports.
- [ ] **Step 2: Run smoke tests and verify RED where placeholders/polish are missing.**
- [ ] **Step 3: Finish accessibility labels, keyboard focus, responsive minimum sizing, empty/error states, docs, and placeholders.**
- [ ] **Step 4: Run full gate:** `npm run typecheck`, `npm test`, `npm run lint`, and desktop build/smoke where package binaries are available; record any environment-only blocker separately rather than masking it.
- [ ] **Step 5: Run real Chromium lifecycle regression from Phase 1** to ensure UI/backend wiring did not break start/stop/CDP behavior.
- [ ] **Step 6: Commit** `feat: complete ICRLogin phase 2 desktop ui`.

## Self-review result

- Spec coverage: Profiles table, profile wizard, Groups, Proxy Manager, Browser Manager, original desktop shell, runtime actions, security boundary, and managed browser download path are all assigned to tasks.
- Deferred by design: Extensions and Settings remain navigable placeholders; tags, clone/import/export/backup/trash/bulk operations stay in their later planned phases rather than silently expanding Phase 2.
- Type consistency: renderer uses `IcrDesktopApi` from Task 4; group/browser/proxy/profile shapes originate in shared contracts; Query mutations only call preload methods.
- Review Focus coverage: malformed IPC is Task 4; secret leakage Task 4/9; running conflicts Task 4/6/7; group deletion Task 1/8; interrupted browser downloads Task 2/10.
- Proportion: tasks define interfaces and assertions without transcribing implementation bodies.
