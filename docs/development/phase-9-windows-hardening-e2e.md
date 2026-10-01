# Phase 9 — Windows Hardening and E2E Gates

Phase 9 closes the Windows shell, runtime reconciliation, security and release-gate gaps that remain before V1 polish.

## Single-instance ownership

ICRLogin acquires the Electron single-instance lock before `bootstrap()` is invoked. A secondary process exits before it can open SQLite, bind the local API port, register IPC handlers or create a runtime registry. The primary process handles `second-instance` by restoring, showing and focusing its existing window.

This prevents two desktop processes from competing for the same `%LOCALAPPDATA%/ICRLogin` state.

## System tray close behavior

Settings → General now supports three close behaviors:

- `ask` — prompt before quitting when managed Chromium is still running;
- `tray` — hide the ICRLogin window to the Windows system tray;
- `quit` — quit the desktop without a prompt.

The tray exposes only two shell actions: **Show ICRLogin** and **Quit ICRLogin**. It does not expose profile/process primitives. Double-click restores the main window.

Tray mode never stops managed Chromium. If tray creation fails, ICRLogin does not hide into an unreachable state; it falls back to the safe prompt/quit behavior.

## Renderer security gate

The renderer CSP remains explicit:

```text
default-src 'self'
script-src 'self'
object-src 'none'
base-uri 'none'
frame-ancestors 'none'
```

Development HMR connections are limited to localhost WebSocket endpoints. Regression tests also retain the Electron window requirements `contextIsolation=true`, `nodeIntegration=false` and `sandbox=true`.

## Runtime reconciliation identity

A persisted runtime session is reattached only when all of these agree:

1. PID still exists;
2. executable path exactly matches the stored managed Chromium executable after Windows path normalization;
3. command line contains the exact stored `--user-data-dir` argument rather than a substring match;
4. command line contains `--remote-debugging-address=127.0.0.1`;
5. command line contains the exact stored `--remote-debugging-port`;
6. stored CDP endpoint is loopback and a live CDP probe succeeds.

A mismatch clears only ICRLogin's stale runtime metadata/profile lock. It does not terminate the observed process, protecting against PID reuse or an unrelated Chromium process.

## Migration fixture

The Phase-9 migration integration fixture builds a real schema-v1 SQLite database, inserts legacy profile/proxy/runtime data, and upgrades through the current schema version.

The fixture verifies:

- migration versions 1–4 are applied exactly once;
- profile/proxy/runtime data survives the upgrade;
- the legacy unvalidated `group_id` is intentionally moved to Ungrouped by migration 002;
- current groups/tags/extensions/templates/backup tables exist after migration;
- the safety-backup hook runs exactly once when migrations are pending and does not run again on a current database.

## Packaged Electron smoke

`npm run test:desktop:packaged` launches `apps/desktop/dist/win-unpacked/ICRLogin.exe` through Playwright Electron. It asserts that the first window renders the ICRLogin shell/navigation and then closes the packaged application cleanly.

The smoke test deliberately does not download a managed Chromium artifact. Managed Chromium + local API integration remains the separate `npm run test:integration:chromium` gate.

The Windows Package workflow now runs:

```text
install → typecheck → unit/integration tests → lint → unpacked package → packaged Electron smoke → NSIS package
```

## Windows hardening workflow

`.github/workflows/windows-hardening.yml` is the dedicated Windows hardening gate. It runs:

```text
npm install
npm run typecheck
npm test
npm run lint
npm run test:integration:chromium
npm run package:dir
npm run test:desktop:packaged
```

This makes real-Chromium/CDP automation explicit rather than a hidden dependency of installer creation. A packaged debug app is uploaded on workflow failure when a runner reaches the artifact step.

## Verification status

Source-level coverage includes tray/close policy, single-instance ownership, CSP, shell lifecycle safety, packaged smoke configuration, exact runtime reconciliation identity and oldest-schema migration fixtures.

GitHub Actions remains an infrastructure blocker during implementation: CI/Windows workflow jobs are created but terminate before steps are assigned. A failed run with empty/null steps is not treated as a source test failure, and Phase 9 must not be described as Windows-smoke-passed until a hosted runner actually executes the gate.
