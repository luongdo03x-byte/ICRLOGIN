# ICRLogin V1 Release Checklist

This checklist is the final evidence gate for a production Windows V1 release. Source implementation and release verification are separate states: every release-only item below must be exercised on a real Windows runner/machine before the release is described as verified.

## 1. Version and source parity

Run from the repository root:

```powershell
npm install
npm run verify:release-parity
npm run typecheck
npm test
npm run lint
```

Expected V1 compatibility matrix:

```text
App package versions: identical across root/core/shared/desktop
Local API: v1
Database schema: v4
Backup format: v1
```

Settings → About must show the same public matrix and either `Operational` or `Recovery required` readiness.

## 2. Fresh Windows installation

- Build/sign the NSIS x64 installer through the tagged release workflow.
- Verify Authenticode signature is present.
- Install as a normal per-user install on Windows 10/11 x64.
- Confirm ICRLogin starts without requiring a bundled Chromium.
- Confirm `%LOCALAPPDATA%\ICRLogin` is created separately from the application installation directory.
- Confirm a second ICRLogin launch focuses the existing instance rather than opening a second DB/API owner.

## 3. Managed Chromium

- Refresh Browser Manager manifest.
- Download a supported Win64 Chromium.
- Verify SHA-256/archive checks complete before the browser is marked installed.
- Confirm failed/tampered downloads do not become installed records.
- Confirm an installed browser remains usable when the remote manifest is unavailable.
- Confirm an unused browser can be removed and a browser referenced by profiles cannot be removed.

## 4. Profile persistence and deterministic environment

Create a profile with:

- pinned Chromium version;
- language/timezone;
- window and screen sizes;
- WebRTC setting;
- geolocation permission;
- user-agent if desired;
- startup URLs.

Restart ICRLogin and confirm the profile and pinned version persist without silent version changes.

## 5. Proxy and secret boundary

Test HTTP, HTTPS and SOCKS5 proxy records, including an authenticated proxy.

- Confirm proxy connectivity test succeeds/fails cleanly.
- Confirm password is not returned in renderer/API payloads.
- Confirm password is not present in Chromium command line or application logs.
- Confirm profile references the proxy record rather than copying credentials.

## 6. Browser lifecycle and CDP automation

Run:

```powershell
npm run test:integration:chromium
```

Then manually verify one profile:

- start → RUNNING with one managed root PID;
- local debugging address/port is loopback;
- API start/restart response supplies PID, CDP HTTP URL and WebSocket debugger URL;
- attach using Playwright/Puppeteer/Selenium;
- stop gracefully; force termination is limited to the exact managed tree only when required;
- restart ICRLogin while Chromium remains alive and confirm exact PID/executable/user-data/debug-port/CDP reconciliation;
- confirm mismatched/PID-reused process is treated as stale metadata and is not killed;
- confirm crashed profiles are not auto-restarted by default.

## 7. Groups, tags, extensions, templates and bulk operations

- Create/rename/delete a group; deleting it moves profiles to Ungrouped.
- Assign multiple tags to profiles.
- Import a local unpacked/CRX extension and assign it to profile/group.
- Clone config-only and full profile while respecting stopped-profile requirements.
- Save/use a profile template.
- Bulk start with bounded concurrency and confirm partial failures are reported per item.
- Exercise bulk stop/group/proxy/tag/delete operations.

## 8. Backup, restore and Trash

- Create metadata backup while a profile is available.
- Create full backup only while stopped.
- Restore a full backup and verify user-data plus tag/extension relationships.
- Restore a second time and confirm UUID collision creates a new UUID.
- Tamper with an archive and confirm restore performs zero mutation.
- Export/import config and verify cookies, user-data, proxy passwords and internal paths are absent.
- Soft-delete to Trash, restore from Trash, then permanently delete a disposable profile.

## 9. Database migration and recovery

- Run the schema-v1 → current migration fixture.
- Confirm safety backup occurs before pending migrations and not when schema is current.
- Confirm `PRAGMA quick_check` unhealthy result enters recovery-only mode without DB reset.
- Confirm profile/Trash crash staging is preserved when DB integrity is unknown.
- Confirm healthy startup reconciles known staging and cleans only safe temporary artifacts.

## 10. Monitoring, logging and security

- Confirm managed Chromium CPU/RAM updates at low frequency.
- Confirm arbitrary system processes are not exposed to renderer monitoring.
- Inspect JSONL logs for token/password/cookie/authorization/path redaction.
- Confirm renderer CSP is active.
- Confirm Electron uses context isolation, no renderer Node integration and sandboxing.
- Confirm preload exposes no generic filesystem, shell, process, DB, secret or updater primitive.

## 11. Windows shell behavior

Test all close modes:

- `ask`: prompts only when managed Chromium is running;
- `tray`: hides the desktop and can be restored from tray/double-click;
- `quit`: exits desktop without force-stopping Chromium.

Confirm tray contains only **Show ICRLogin** and **Quit ICRLogin** in V1. Confirm launch-with-Windows preference is reflected in Windows login-item behavior.

## 12. Packaged desktop smoke

Run:

```powershell
npm run package:dir
npm run test:desktop:packaged
npm run package:win
```

Confirm the unpacked desktop renders the ICRLogin shell without downloading managed Chromium merely to launch the UI. Confirm NSIS `.exe`, blockmap and `latest.yml` are produced.

## 13. Application update and data continuity

Using two signed test versions:

- publish the newer installer, blockmap and `latest.yml` to the configured GitHub release feed;
- from the older packaged app, check and download the update;
- confirm no update operation stops/kills managed Chromium;
- quit ICRLogin normally and allow the downloaded update to install;
- restart and confirm app version changed while `%LOCALAPPDATA%\ICRLogin` profile data, browser artifacts, settings, backups and secrets remain intact;
- confirm Settings → About reports the new app version while API/DB/backup compatibility versions remain correct.

## 14. Production release workflow

A V1 tag must pass the complete `.github/workflows/release.yml` sequence:

```text
release parity
→ typecheck
→ all workspace tests
→ lint
→ real Chromium/local API smoke
→ unpacked Windows package
→ packaged Electron smoke
→ signing credential check
→ signed NSIS build
→ signature/artifact verification
→ GitHub Release publish
```

Required Actions secrets:

```text
WIN_CSC_LINK
WIN_CSC_KEY_PASSWORD
```

Do not call the release verified if GitHub Actions creates the job but no runner executes its steps (`runner_id=0`, empty/null `steps`).
