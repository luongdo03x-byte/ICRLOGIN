# ICRLogin Phase 7 Settings + Advanced Browser Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add versioned persistent desktop settings and complete the V1 Browser Manager controls without widening the renderer security boundary.

**Architecture:** Core owns a versioned atomic JSON settings store under `config/`; Electron main owns Windows login/startup and close-behavior integration. Browser removal continues through `BrowserVersionService`, with IPC exposing only typed high-level operations. Renderer remains a thin typed client.

**Tech Stack:** TypeScript, Zod, Electron, React, React Query, Vitest, Node fs/promises.

**Spec:** `docs/superpowers/specs/2026-09-27-icrlogin-v1-design.md`

## Global Constraints

- Windows 10/11 x64, local-first, Electron + React + TypeScript + SQLite.
- Renderer must not receive generic filesystem/shell/process/database primitives or internal paths/secrets.
- Existing profile browser versions never change silently.
- Chromium removal is blocked while any active profile references the version.
- Settings writes are validated, staged and atomically promoted.
- Local API remains bound to `127.0.0.1`; API port changes apply on next app start.

## Review Focus

- Corrupt/unknown settings JSON falls back safely without overwriting the original during read.
- Concurrent settings writes cannot leave a partial JSON file.
- Browser uninstall cannot delete a version referenced by any non-deleted profile.
- Closing the desktop with running profiles never kills Chromium unexpectedly.
- Renderer receives only public settings and sanitized browser metadata.

---

### Task 1: Shared settings model and atomic settings store

**Files:**
- Create: `packages/shared/src/settings.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/core/src/settings/app-settings-store.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/app-settings-store.test.ts`

**Interfaces:**
- `AppSettings`: `{ schemaVersion: 1; launchAtLogin: boolean; closeBehavior: 'ask' | 'quit'; localApiPort: number }`.
- Defaults: `launchAtLogin=false`, `closeBehavior='ask'`, `localApiPort=9495`.
- `AppSettingsStore.read(): Promise<AppSettings>`.
- `AppSettingsStore.update(patch: UpdateAppSettings): Promise<AppSettings>`.

- [ ] Write RED tests for defaults, valid persistence, invalid JSON fallback, validation, and atomic temp cleanup.
- [ ] Implement shared Zod schemas and atomic store under `config/settings.json`.
- [ ] Export the new contracts and run focused tests.
- [ ] Commit `feat: add persistent app settings store`.

### Task 2: Typed desktop settings API and Windows startup adapter

**Files:**
- Create: `packages/shared/src/desktop-phase7.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/desktop/src/main/ipc-phase7.ts`
- Modify: `apps/desktop/src/preload/bridge.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/src/types/window.d.ts`
- Test: `apps/desktop/tests/ipc-phase7.test.ts`
- Test: `apps/desktop/tests/preload-phase7.test.ts`

**Interfaces:**
- `settings.get()` and `settings.update(patch)` typed IPC only.
- Main receives a `setLaunchAtLogin(enabled:boolean)` adapter; renderer never receives Electron primitives.
- Update returns `{ settings, restartRequired }`, where API port changes set `restartRequired=true`.

- [ ] Write RED IPC/preload allowlist tests.
- [ ] Implement main handler with validation and launch-at-login side effect rollback on failure.
- [ ] Extend typed preload bridge only with explicit Phase-7 methods.
- [ ] Commit `feat: expose typed desktop settings api`.

### Task 3: Boot settings, API port and close behavior

**Files:**
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/main/config.ts`
- Create: `apps/desktop/src/main/window-close-policy.ts`
- Test: `apps/desktop/tests/window-close-policy.test.ts`
- Modify: `apps/desktop/tests/main-security.test.ts`

**Interfaces:**
- Boot reads settings before starting local API.
- `ICRLOGIN_API_PORT` may remain a development override; otherwise use persisted `localApiPort`.
- Apply `app.setLoginItemSettings({ openAtLogin })` from persisted settings.
- `closeBehavior='ask'` prompts only if managed Chromium runtimes are active; quitting never calls browser stop/kill.

- [ ] Write RED policy tests for zero/running profile cases and `quit` mode.
- [ ] Integrate settings into local API port resolution and Windows login startup.
- [ ] Add BrowserWindow close guard without terminating Chromium processes.
- [ ] Commit `feat: apply desktop settings at startup`.

### Task 4: Browser uninstall desktop API

**Files:**
- Modify: `packages/shared/src/desktop-phase7.ts`
- Modify: `apps/desktop/src/main/ipc-phase7.ts`
- Modify: `apps/desktop/src/preload/bridge.ts`
- Modify: `apps/desktop/src/renderer/src/api/icr-client.ts`
- Test: `apps/desktop/tests/ipc-phase7.test.ts`

**Interfaces:**
- `browsers.remove(version): Promise<ApiEnvelope<null>>` delegates to `BrowserVersionService.remove`.
- Existing `BROWSER_IN_USE` remains the stable error when profiles reference the version.
- No executable path is exposed.

- [ ] Add RED API tests for successful remove and in-use rejection.
- [ ] Wire the typed remove operation through main/preload/client.
- [ ] Commit `feat: add managed browser uninstall api`.

### Task 5: Advanced Browser Manager UI

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/browsers/BrowserManagerPage.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/browsers/browser-queries.ts`
- Modify: `apps/desktop/src/renderer/src/pages/browsers/browser-manager-model.ts`
- Test: `apps/desktop/tests/renderer/browser-manager-model.test.ts`

**Interfaces:**
- Refresh button invalidates/re-fetches available and installed queries.
- Installed view shows total artifact size, missing-executable state, and Remove for versions with `profilesUsing===0`.
- Missing executable + zero usage can be removed then downloaded again; versions in use remain protected.

- [ ] Add RED pure-model tests for removable state and total size.
- [ ] Implement refresh/remove/retry workflow with React Query invalidation and confirmation.
- [ ] Commit `feat: complete advanced browser manager controls`.

### Task 6: Settings UI with recovery preserved

**Files:**
- Create: `apps/desktop/src/renderer/src/pages/settings/SettingsPage.tsx`
- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Modify: `apps/desktop/src/renderer/src/api/icr-client.ts`
- Modify: `apps/desktop/src/renderer/src/styles.css`
- Test: `apps/desktop/tests/renderer/settings-model.test.ts`

**Interfaces:**
- Settings page has General, Local API, and Recovery/Monitoring sections.
- General: launch with Windows + close behavior.
- Local API: port with explicit “applies after restart” message.
- Existing `RecoveryPage` remains embedded/reused rather than duplicated.

- [ ] Add RED model tests for dirty/restart-required state.
- [ ] Implement typed settings form and preserve Phase-5/6 recovery workflow.
- [ ] Commit `feat: add settings workspace`.

### Task 7: Phase-7 regression gate and docs

**Files:**
- Create: `docs/development/phase-7-settings-browser-manager.md`
- Modify: `README.md`
- Test: existing Phase-1–6 suites plus new Phase-7 suites.

**Interfaces:**
- Document settings persistence, restart semantics, browser removal rules and close behavior.

- [ ] Review the whole Phase-7 diff from Phase-6 base and fix Critical/Important findings.
- [ ] Run/inspect CI gate; record runner infrastructure blockers without claiming test success when no steps execute.
- [ ] Commit `docs: complete phase 7 settings browser manager`.
