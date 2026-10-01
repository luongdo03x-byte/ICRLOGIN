# ICRLogin Phase 8 Windows Installer + Auto-update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package ICRLogin V1 as a Windows x64 NSIS installer and add a safe, typed application-update workflow that never force-closes managed Chromium.

**Architecture:** `electron-builder` packages the Electron app only; managed Chromium remains downloaded separately by Browser Manager. Electron main owns an `AppUpdateService` adapter around `electron-updater`; renderer receives sanitized update state/actions through typed IPC. Updates are checked/downloaded explicitly and installed on next launch instead of forcing a live restart.

**Tech Stack:** Electron 38, electron-vite, electron-builder v26, electron-updater v6, NSIS, TypeScript, React Query, Vitest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-27-icrlogin-v1-design.md`

## Global Constraints

- Windows 10/11 x64 only for V1 packaging.
- Chromium binaries and profile data are never bundled into the application installer.
- `%LOCALAPPDATA%/ICRLogin` data survives application install/update/uninstall flows unless explicitly removed by the user outside V1.
- Update checks/downloads do not expose filesystem or updater primitives to renderer.
- Downloaded application updates install on the next clean app launch/quit flow; no update action may force-stop Chromium profiles.
- Production releases are expected to be code-signed; unsigned development packaging is allowed for smoke testing only.

## Review Focus

- Development/unpacked builds with no update feed must report `disabled` instead of crashing.
- Update metadata/version strings are sanitized before crossing IPC.
- Repeated check/download calls are single-flight or rejected cleanly.
- Quit/install logic never calls profile/browser stop or kill APIs.
- Installer configuration excludes managed `browsers`, `profiles`, `backups`, `logs`, `trash`, secrets and runtime data.

---

### Task 1: Packaging dependencies and NSIS config

**Files:**
- Modify: `apps/desktop/package.json`
- Create: `apps/desktop/electron-builder.yml`
- Modify: root `package.json`
- Test: `apps/desktop/tests/packaging-config.test.ts`

**Interfaces:**
- Desktop scripts: `package:win` and `package:dir` build renderer/main first, then run electron-builder.
- Target: NSIS x64; `oneClick=false`; per-user install by default.
- App bundle includes compiled `out/**` plus required production modules only; managed browser/profile/data directories are external and never packaged.
- Generic update publish URL uses `${env.ICRLOGIN_UPDATE_URL}`; packaging without publishing uses `--publish never`.

- [ ] Write RED config test that parses YAML/text and pins appId, productName, x64 NSIS, external-data exclusions and artifact naming.
- [ ] Add `electron-builder` v26 dev dependency and `electron-updater` v6 app dependency.
- [ ] Add builder config and package scripts.
- [ ] Commit `build: add windows nsis packaging`.

### Task 2: App update domain model and service

**Files:**
- Create: `packages/shared/src/app-update.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/desktop/src/main/app-update-service.ts`
- Test: `apps/desktop/tests/app-update-service.test.ts`

**Interfaces:**
- Public states: `disabled | idle | checking | available | downloading | downloaded | up-to-date | error`.
- Public DTO contains only current/available version, progress percent, downloaded bytes/total, message code and `installOnNextQuit` flag.
- Adapter interface isolates `electron-updater` so service tests do not require network or Electron installer execution.
- `check()`, `download()`, `snapshot()`; automatic download is disabled.
- Downloaded update sets next-launch/on-quit install behavior but never calls `quitAndInstall()` directly.

- [ ] Write RED state-machine tests for disabled dev mode, available/up-to-date, progress/downloaded and errors.
- [ ] Implement service with event subscriptions and single-flight guards.
- [ ] Commit `feat: add safe app update service`.

### Task 3: Electron-updater production adapter

**Files:**
- Create: `apps/desktop/src/main/electron-update-adapter.ts`
- Test: `apps/desktop/tests/electron-update-adapter.test.ts`

**Interfaces:**
- Production adapter is constructed only when `app.isPackaged` and `ICRLOGIN_UPDATE_URL` is a valid `https:` URL.
- Use `NsisUpdater` with generic provider URL and `autoDownload=false`.
- Configure update installation for next launch/normal quit, not immediate forced restart.
- Adapter forwards only version/progress/error events into `AppUpdateService`.

- [ ] Write RED validation/config tests using an injectable updater factory.
- [ ] Implement HTTPS feed validation and updater options.
- [ ] Commit `feat: add nsis update adapter`.

### Task 4: Typed Phase-8 IPC/preload/client

**Files:**
- Create: `packages/shared/src/desktop-phase8.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `apps/desktop/src/main/ipc-phase8.ts`
- Modify: `apps/desktop/src/preload/bridge.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/src/types/window.d.ts`
- Modify: `apps/desktop/src/renderer/src/api/icr-client.ts`
- Test: `apps/desktop/tests/ipc-phase8.test.ts`
- Test: `apps/desktop/tests/preload-phase8.test.ts`

**Interfaces:**
- `updates.status()`, `updates.check()`, `updates.download()` only.
- No feed URL, local artifact path, signature material or generic updater handle crosses IPC.
- Disabled/unavailable updater remains queryable and returns a public disabled state.

- [ ] Write RED typed IPC/preload tests.
- [ ] Implement explicit channels and bridge methods.
- [ ] Commit `feat: expose safe app update workflow`.

### Task 5: Main-process lifecycle integration

**Files:**
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/main/app-services.ts` only if a shared holder is useful.
- Test: `apps/desktop/tests/update-lifecycle.test.ts`

**Interfaces:**
- Updater initializes after `app.whenReady()` and is independent from SQLite health so recovery-only mode can still report/update the application.
- No updater path calls `BrowserService.stop`, registry process termination or profile mutation.
- Shutdown closes updater listeners best-effort; downloaded update is left for normal installer handoff.

- [ ] Write RED lifecycle tests around disabled/packaged factory decision.
- [ ] Wire update service and Phase-8 IPC during both healthy and recovery-only startup.
- [ ] Commit `feat: integrate app updater lifecycle`.

### Task 6: Settings update UI

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/settings/SettingsPage.tsx`
- Create: `apps/desktop/src/renderer/src/pages/settings/update-model.ts`
- Test: `apps/desktop/tests/renderer/update-model.test.ts`

**Interfaces:**
- Add `Updates` tab/card showing installed version, available version, state and download progress.
- Actions: Check for updates and Download update; downloaded state says update will install on next normal app restart/quit.
- Never show a “force restart and install” button in V1.

- [ ] Add RED pure-model tests for labels/action availability.
- [ ] Implement React Query status/check/download flow.
- [ ] Commit `feat: add safe update settings ui`.

### Task 7: Windows packaging/release workflow

**Files:**
- Create: `.github/workflows/windows-package.yml`
- Create: `.github/workflows/release.yml`
- Test/config review: workflow YAML.

**Interfaces:**
- Windows packaging workflow runs on `windows-latest`, Node 22, `npm install`, typecheck/tests/build, then `package:win --publish never`; uploads installer + `latest.yml` as artifacts.
- Release workflow triggers on version tags, requires signing/publish secrets, packages x64 NSIS and publishes explicitly.
- No Chromium artifact is downloaded merely to build the installer.

- [ ] Add package smoke workflow.
- [ ] Add explicit tagged release workflow with documented required secrets.
- [ ] Commit `ci: add windows packaging and release workflows`.

### Task 8: Phase-8 docs and branch review

**Files:**
- Create: `docs/development/phase-8-installer-auto-update.md`
- Modify: `README.md`

- [ ] Review full Phase-8 diff from Phase-7 head; fix Critical/Important findings.
- [ ] Inspect CI/workflow execution and record infrastructure blockers without claiming success if steps do not run.
- [ ] Document unsigned dev build vs production code signing and generic update hosting requirements.
- [ ] Commit `docs: complete phase 8 installer auto update`.
