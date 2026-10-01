# Phase 8 — Windows Installer and Safe App Updates

Phase 8 packages ICRLogin as a Windows x64 NSIS application and adds an application-update workflow that is intentionally separate from managed Chromium lifecycle operations.

## Windows packaging

The desktop package uses `electron-builder` v26 with an NSIS x64 target.

- Product: `ICRLogin`
- App ID: `com.icrlogin.desktop`
- Installer: per-user by default, assisted installer (`oneClick: false`)
- Artifact: `ICRLogin-<version>-Setup-x64.exe`
- Managed Chromium is **not** bundled into the installer.
- Profile data, backups, logs, Trash, runtime files and encrypted local secrets stay under `%LOCALAPPDATA%/ICRLogin` and are outside the installed application bundle.

The Electron main build bundles the TypeScript workspace packages `@icrlogin/core` and `@icrlogin/shared`. `better-sqlite3` remains a packaged native production dependency so the installed app never attempts to execute workspace `.ts` sources at runtime.

Development packaging:

```powershell
npm install
npm run package:win
```

`package:dir` creates an unpacked Windows application for local inspection.

## Update provider

The production builder configuration explicitly pins the GitHub provider to:

```text
luongdo03x-byte/ICRLOGIN
```

This ownership is written into `app-update.yml` inside packaged builds. Packaged applications therefore do not depend on a user machine having an update-feed environment variable.

`ICRLOGIN_UPDATE_URL` is only an optional runtime override for staging or private infrastructure. When present it must be an HTTPS URL without embedded username/password credentials. Empty overrides fall back to the packaged `app-update.yml` configuration.

## Update behavior

The renderer is limited to three typed operations:

- read update status;
- check for an update;
- download an available update.

It never receives updater objects, feed URLs, installer paths, signature material, filesystem primitives or `quitAndInstall` access.

Automatic download is disabled. After an update is downloaded, `electron-updater` is configured with `autoInstallOnAppQuit=true`. ICRLogin does not expose an immediate force-restart action in V1. No update path calls browser stop/kill or profile mutation APIs; managed Chromium can continue running when the ICRLogin desktop exits according to the existing close policy.

Public update states are:

```text
disabled | idle | checking | available | downloading | downloaded | up-to-date | error
```

Settings → Updates displays only sanitized version/progress/status information. A downloaded update is described as installing on the next normal application quit/restart.

## Windows package workflow

`.github/workflows/windows-package.yml` is an unsigned smoke/package workflow for Windows. It runs:

```text
npm install
npm run typecheck
npm test
npm run lint
npm run package:win
```

It verifies that both the NSIS `.exe` and `latest.yml` exist, then uploads the installer, blockmap and update metadata as a workflow artifact. It does not download a managed Chromium artifact merely to package ICRLogin.

## Tagged production release

`.github/workflows/release.yml` runs for `v*` tags. The tag version must match `apps/desktop/package.json`.

Required repository secrets:

```text
WIN_CSC_LINK
WIN_CSC_KEY_PASSWORD
```

The release build enables `forceCodeSigning=true`, verifies the installer is signed, and publishes these files to the GitHub Release for the tag:

```text
ICRLogin-<version>-Setup-x64.exe
ICRLogin-<version>-Setup-x64.exe.blockmap
latest.yml
```

The built-in workflow token is used only to create/upload the GitHub Release. Signing credentials remain GitHub Actions secrets and are never committed to the repository.

## Verification status

Source-level regression coverage includes:

- packaging configuration and workspace/native dependency boundary;
- updater state machine and single-flight behavior;
- embedded production feed plus HTTPS runtime override validation;
- progress/downloaded event sanitization;
- typed Phase-8 IPC/preload allowlist;
- Settings update labels/actions;
- lifecycle ordering showing updater availability is independent from SQLite health;
- a regression assertion forbidding `quitAndInstall`, browser stop and registry kill from the application-update lifecycle.

At implementation time both the existing CI workflow and the new Windows Package workflow were created successfully by GitHub Actions but failed before any step was assigned (`steps = null`). Therefore no checkout/install/typecheck/test/package step actually executed on GitHub-hosted runners. Phase 8 source/workflow implementation is present, but Windows installer smoke success must not be claimed until Actions provides a runner and the package workflow completes.
