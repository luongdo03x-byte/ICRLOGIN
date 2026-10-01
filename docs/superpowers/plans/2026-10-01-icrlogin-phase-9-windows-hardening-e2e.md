# ICRLogin Phase 9 Windows Hardening + E2E Implementation Plan

> **Execution:** Continue task-by-task with TDD and source review. Do not claim verification success while GitHub-hosted jobs terminate before steps are assigned.

**Goal:** Close the Windows-integration and release-gate gaps that remain before V1 polish: single-instance desktop behavior, safe system tray lifecycle, strict renderer CSP/security regression, packaged Electron smoke coverage, runtime reconciliation hardening, migration fixtures and release-gate workflow coverage.

**Architecture:** Keep Electron main as the only owner of Windows shell integration. Renderer receives no generic Electron/OS APIs. Tray/single-instance behavior is implemented through narrow main-process services/helpers. Security and lifecycle rules are pinned by pure/static tests so they remain reviewable even when hosted runners are unavailable. Packaged smoke tests use Playwright Electron against the unpacked Windows build and remain separate from managed Chromium artifact installation.

**Spec:** `docs/superpowers/specs/2026-09-27-icrlogin-v1-design.md`

## Constraints

- Active managed Chromium must never be force-killed merely because the ICRLogin window is hidden, minimized to tray, updated, or another ICRLogin instance is launched.
- Only one ICRLogin desktop main process may own the local database/API/runtime registry at a time.
- Tray is application-shell behavior only; it does not expose profile/process controls beyond show/quit in V1.
- Renderer remains sandboxed with context isolation, no Node integration and explicit CSP.
- Packaged smoke must not require downloading a managed Chromium artifact just to prove the Electron app starts.
- Phase 10 remains reserved for visual polish, release parity checklist and final cleanup.

---

### Task 1 — Extend close behavior with system tray

**Files:**
- Modify: `packages/shared/src/settings.ts`
- Modify: `apps/desktop/src/main/window-close-policy.ts`
- Create: `apps/desktop/src/main/tray-controller.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/renderer/src/pages/settings/SettingsPage.tsx`
- Tests: settings schema, close policy, tray controller helpers

**Behavior:**
- Add close behavior `tray` alongside `ask` and `quit`.
- `tray`: window close hides the window; application remains alive.
- Tray menu exposes only `Show ICRLogin` and `Quit ICRLogin`.
- Tray Quit performs the existing safe app shutdown and never stops managed Chromium.
- Existing settings files remain parseable/migratable.

### Task 2 — Single-instance ownership

**Files:**
- Create: `apps/desktop/src/main/single-instance.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Tests: single-instance focus/show policy

**Behavior:**
- Acquire `app.requestSingleInstanceLock()` before normal bootstrap.
- Secondary instance exits before opening DB/API/listeners.
- `second-instance` restores/shows/focuses the existing main window.
- Never starts a second local API or SQLite writer.

### Task 3 — Strict renderer CSP/security regression

**Files:**
- Modify: renderer `index.html`
- Test: `apps/desktop/tests/main-security.test.ts` or new Phase-9 security test

**Behavior:**
- CSP blocks arbitrary remote scripts/objects/frames and limits resources to app-local requirements.
- Preserve `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- No generic shell/filesystem/process primitive appears in preload bridge.

### Task 4 — Packaged Electron smoke

**Files:**
- Create: `tools/electron-packaged-smoke.mjs`
- Modify: root/desktop package scripts
- Modify: `.github/workflows/windows-package.yml`

**Behavior:**
- Build unpacked Windows app.
- Launch packaged/unpacked ICRLogin executable through Playwright Electron.
- Wait for first window, assert ICRLogin shell renders, then close cleanly.
- Does not install/download managed Chromium.

### Task 5 — Windows process/reconciliation hardening

**Files:**
- Review/modify: `apps/desktop/src/main/windows-process-inspector.ts`
- Review/modify: `packages/core/src/runtime/reconciler.ts`
- Tests: PID identity, stale session, mismatched command line/CDP cases

**Behavior:**
- Never attach arbitrary PID solely because it exists.
- Reattach only when managed profile/user-data/CDP identity checks agree.
- Stale/mismatched runtime sessions are cleared without killing unrelated processes.

### Task 6 — Migration/recovery fixture gates

**Files:**
- Review/extend core migration tests
- Add fixture-based migration test from oldest supported schema to current
- Re-run backup/restore recovery fixture assertions in release gate

**Behavior:**
- Migration preserves profile/group/proxy/tag/extension references expected by current schema.
- Pre-migration safety backup hook remains required when a migration is pending.
- Corrupt database path stays non-destructive/recovery-only.

### Task 7 — Windows hardening workflow

**Files:**
- Create/update workflow under `.github/workflows/`

**Behavior:**
- Windows runner executes typecheck, unit/integration/API tests, packaged desktop smoke, packaging smoke and migration/recovery tests.
- Chromium integration remains explicit and does not become a hidden packaging dependency.
- Upload useful artifacts/logs on failure when steps actually execute.

### Task 8 — Docs and whole-branch review

**Files:**
- Create: `docs/development/phase-9-windows-hardening-e2e.md`
- Modify: `README.md`

**Behavior:**
- Review full Phase-9 diff against Phase-8 clean head.
- Fix Critical/Important source findings before phase boundary.
- Record hosted-runner blocker exactly if jobs still show `runner_id=0` / empty steps.
