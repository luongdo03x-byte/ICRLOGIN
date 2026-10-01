# ICRLogin

ICRLogin is a Windows-first, local-first Chromium profile manager and automation foundation.

Phase 1 provides the core profile/database/proxy/browser lifecycle, localhost CDP runtime management, restart reconciliation, and hardened Electron foundation. Phase 2 adds the usable desktop workflow for Profiles, Groups, Proxy Manager and Browser Manager through a typed allowlisted IPC bridge. Phase 3 adds the localhost-only `/api/v1` automation API, optional encrypted bearer authentication, profile/group/proxy/browser/process resources, and CDP attach data for Playwright/Puppeteer/Selenium. Phase 4 adds tags, clean/full profile cloning, reusable templates, bounded bulk operations, and local unpacked/CRX extension management with profile/group assignment and Chromium launch integration. Phase 5 adds checksum-verified profile backup/restore, config-only import/export, Trash/permanent delete, SQLite safety backups and a typed desktop recovery workflow. Phase 6 adds redacted structured logging primitives, managed Chromium CPU/RAM monitoring, SQLite startup integrity checks, database-aware crash staging recovery, and a recovery-only degraded mode when database integrity fails. Phase 7 adds versioned persistent settings, launch-with-Windows, safe close behavior, configurable localhost API port and advanced Browser Manager refresh/uninstall controls. Phase 8 adds Windows x64 NSIS packaging, code-signing-aware release automation, typed application-update status/check/download controls and safe install-on-normal-quit behavior. Phase 9 adds single-instance ownership, system tray behavior, strict renderer security gates, exact runtime reconciliation identity, migration fixtures and packaged Windows Electron smoke coverage.

## Local automation API

Default base URL:

```text
http://127.0.0.1:9495/api/v1
```

The listener is intentionally localhost-only. Start/restart endpoints return sanitized CDP connection data so local automation clients can attach to the managed Chromium instance without receiving executable paths, profile storage paths, or proxy secrets. The port can be changed in Settings and is applied on the next ICRLogin start; `ICRLOGIN_API_PORT` remains a development override when present.

See [`docs/development/phase-3-local-api.md`](docs/development/phase-3-local-api.md) for endpoints, bearer usage, and CDP examples.

## Backup, monitoring and recovery

Full `.icrbackup` archives are checksum verified and can include Chromium user-data only while a profile is stopped. `.icrprofile.json` is a config-only transfer format and never contains cookies, proxy secrets, runtime state or internal paths. Soft-deleted profiles live in Trash until restored or explicitly permanently deleted. SQLite safety backups are created before pending migrations and restore mutation.

Startup recovery runs a non-destructive SQLite integrity check before migrations. Healthy databases can reconcile interrupted profile/Trash staging; unhealthy databases preserve those staging directories instead of guessing and start the desktop in recovery-only degraded mode without profile/browser/backup mutation IPC or the local API. Managed Chromium CPU/RAM is sampled without exposing generic process control or command lines to the renderer.

## Settings, tray and Browser Manager

Settings stores versioned public application preferences atomically under the local config directory. V1 includes launch-with-Windows, close behavior and the localhost API port. Close behavior can ask, quit, or hide ICRLogin to the system tray. Closing/hiding the desktop never force-stops managed Chromium.

ICRLogin is single-instance: the secondary desktop exits before opening shared local state and instead shows/focuses the existing window.

Browser Manager can refresh manifest/installed state, retry downloads, show managed artifact size and executable health, and remove a Chromium version only when no active profile references it. A broken unused install can be removed and downloaded again.

## Windows installer and app updates

ICRLogin packages as a Windows x64 NSIS installer. Managed Chromium and `%LOCALAPPDATA%/ICRLogin` user data are intentionally outside the application installer. The production updater is pinned to the `luongdo03x-byte/ICRLOGIN` GitHub release feed through packaged `app-update.yml` metadata.

Settings → Updates can check and download an application update. V1 does not expose a force-restart/install action; a downloaded update is left for the normal application quit/restart flow and no update path force-stops managed Chromium.

Development installer packaging and packaged desktop smoke:

```powershell
npm run package:dir
npm run test:desktop:packaged
npm run package:win
```

Tagged production releases require `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` GitHub Actions secrets and enforce Windows code signing before publishing the installer, blockmap and `latest.yml` to a GitHub Release.

## Windows hardening

Runtime reconciliation reattaches only when the persisted PID, exact executable, exact user-data argument, loopback debugging address/port and live CDP endpoint agree. Mismatched/stale metadata is removed without killing the observed process.

The dedicated Windows hardening workflow includes unit/integration/API/migration/recovery tests, real Chromium/CDP automation, unpacked packaging and packaged Electron shell smoke. Renderer CSP and Electron sandbox flags are pinned by security regression tests.

See [`docs/development/phase-5-backup-restore.md`](docs/development/phase-5-backup-restore.md), [`docs/development/phase-6-monitoring-recovery.md`](docs/development/phase-6-monitoring-recovery.md), [`docs/development/phase-7-settings-browser-manager.md`](docs/development/phase-7-settings-browser-manager.md), [`docs/development/phase-8-installer-auto-update.md`](docs/development/phase-8-installer-auto-update.md), and [`docs/development/phase-9-windows-hardening-e2e.md`](docs/development/phase-9-windows-hardening-e2e.md).

## Development

Prerequisites: Windows 10/11 x64 for production smoke testing, Node.js 22+, and npm.

```powershell
npm install
npm run lint
npm run typecheck
npm test
npm run test:integration:chromium
npm run build -w @icrlogin/desktop
npm run dev -w @icrlogin/desktop
```

Developer details are documented in [`docs/development/phase-1-core.md`](docs/development/phase-1-core.md), [`docs/development/phase-2-desktop-ui.md`](docs/development/phase-2-desktop-ui.md), [`docs/development/phase-3-local-api.md`](docs/development/phase-3-local-api.md), [`docs/development/phase-4-profile-ops-extensions.md`](docs/development/phase-4-profile-ops-extensions.md), [`docs/development/phase-5-backup-restore.md`](docs/development/phase-5-backup-restore.md), [`docs/development/phase-6-monitoring-recovery.md`](docs/development/phase-6-monitoring-recovery.md), [`docs/development/phase-7-settings-browser-manager.md`](docs/development/phase-7-settings-browser-manager.md), [`docs/development/phase-8-installer-auto-update.md`](docs/development/phase-8-installer-auto-update.md), and [`docs/development/phase-9-windows-hardening-e2e.md`](docs/development/phase-9-windows-hardening-e2e.md).

The approved design and implementation plans are under [`docs/superpowers/`](docs/superpowers/).
