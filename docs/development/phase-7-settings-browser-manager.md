# Phase 7 — Settings and Advanced Browser Manager

Phase 7 adds persistent application settings and completes the Browser Manager controls needed for ICRLogin V1 while keeping Electron privileges in the main process.

## Persistent settings

Settings are stored under `config/settings.json` through `AppSettingsStore`. The format is versioned independently from the SQLite schema.

Current schema version: `1`.

Defaults:

- launch with Windows: disabled;
- close behavior: ask when managed Chromium profiles are still running;
- local API port: `9495`.

Writes are validated, serialized, written to a unique staging file, and atomically renamed into place. Concurrent updates are sequenced so one settings patch does not silently erase another. Invalid, corrupt or unsupported settings files are not overwritten during read; ICRLogin falls back to safe defaults so recovery remains possible.

## Windows startup

`launchAtLogin` is applied by the Electron main process with `app.setLoginItemSettings`. The renderer only calls a typed settings operation and never receives Electron or shell primitives.

When changing launch-at-login from Settings, the OS side effect is applied before persistence. If persistence fails, ICRLogin attempts to restore the previous Windows startup setting.

## Close behavior

`closeBehavior` supports:

- `ask`: if one or more managed Chromium runtimes are active, the desktop asks before quitting;
- `quit`: close the ICRLogin desktop without prompting.

Neither mode force-stops managed Chromium as a side effect of closing the desktop. When the user confirms a quit with active profiles, Chromium processes are intentionally left running so normal runtime reconciliation can reattach on the next ICRLogin start.

## Local API port

The persisted `localApiPort` controls the localhost automation listener on the next application start. The listener remains fixed to `127.0.0.1`.

Port changes return `restartRequired: true` through typed IPC and the Settings UI states that a restart is required. `ICRLOGIN_API_PORT` remains an explicit development/environment override and takes precedence over the persisted setting when present.

## Recovery-only mode

Settings remain readable and writable when Phase-6 startup integrity checking puts ICRLogin into recovery-only mode. This is possible because the settings JSON file is independent from SQLite.

Database-backed Browser Manager removal remains disabled in degraded mode, and Phase 1–5 mutation APIs remain unavailable until database health is restored.

## Advanced Browser Manager

Browser Manager now supports:

- explicit manifest/installed-state refresh;
- download retry state;
- installed artifact total size;
- executable availability status;
- managed Chromium uninstall for unused versions;
- removal of an unused broken install so the same version can be downloaded again.

`BrowserVersionService.remove()` remains the authority for removal. A Chromium version referenced by any active profile is rejected with `BROWSER_IN_USE`; the renderer also disables its Remove control. Executable paths are never returned to the renderer.

## Settings workspace

Settings is now a real workspace with:

- General: launch with Windows and close behavior;
- Local API: localhost port and restart-required state;
- Recovery & Monitoring: the existing Phase-5/6 backup, Trash, startup health and CPU/RAM workflow reused rather than duplicated.

All settings and browser actions cross the preload boundary through explicit allowlisted methods. No generic filesystem, process, shell or database API was added.

## Verification status

Source-level tests were added for the settings store, Phase-7 IPC, preload allowlisting, close policy, API-port precedence, settings form model, and Browser Manager removal/storage model.

GitHub Actions is currently an infrastructure blocker. For the latest Phase-7 run, the job completed with `runner_id=0`, an empty runner name and `steps=[]`; checkout, dependency installation, typecheck, lint, tests and desktop build did not execute. Phase 7 therefore has implementation and regression coverage committed, but executable CI success is not claimed until a runner actually starts the configured steps.
