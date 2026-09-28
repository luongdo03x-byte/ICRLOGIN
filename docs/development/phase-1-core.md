# ICRLogin Phase 1 — Core Development Guide

Phase 1 establishes the local Windows-first foundation for ICRLogin: isolated Chromium profile storage, SQLite metadata, proxy secret boundaries, verified browser artifacts, Chromium lifecycle/CDP management, restart reconciliation, and a hardened Electron shell.

## Supported development target

- Production target: Windows 10/11 x64.
- Node.js: 22+.
- npm: version bundled with the selected Node.js release.
- A normal online development machine is expected to have access to the npm registry.
- The production application manages Chromium independently from the system Chrome installation.

## Install dependencies

From the repository root:

```powershell
npm ci
```

The lockfile must be committed before a release-quality build. Native modules such as `better-sqlite3` must install successfully for the target Node/Electron ABI.

## Verify the core

Run the normal quality gate from the repository root:

```powershell
npm run lint
npm run typecheck
npm test
npm run test:integration:chromium
npm run build -w @icrlogin/desktop
```

`test:integration:chromium` is a test-only lifecycle check. It resolves Chromium in this order:

1. `ICR_CHROMIUM_PATH`, when set.
2. Playwright-managed Chromium, when the test dependency is installed.
3. Common system Chromium paths used by CI/development environments.

The integration harness may add headless/test-only launch flags. Production browser selection remains manifest-driven and pinned per profile; production code does not depend on Playwright's browser installer.

## Run the Electron shell

```powershell
npm run dev -w @icrlogin/desktop
```

On a normal Windows launch, the local application root is:

```text
%LOCALAPPDATA%\ICRLogin
```

Phase 1 creates the following managed layout below that root:

```text
data\
profiles\
browsers\
extensions\
backups\
downloads\
logs\
config\
trash\
```

The Electron renderer is intentionally narrow in Phase 1. It receives a small health bridge only. The renderer must not receive raw database handles, filesystem access, child-process APIs, proxy passwords, or arbitrary Core service objects.

Required Electron security settings are:

```text
contextIsolation = true
nodeIntegration = false
sandbox = true
```

## Profile and runtime behavior

Each profile receives its own `profiles/<profile-id>/user-data` directory. Profile metadata lives in SQLite, while Chromium owns cookies, IndexedDB, Local Storage, cache, preferences, and other browser state inside that isolated user-data directory.

A profile is pinned to one browser version. Starting a profile:

1. loads normalized profile metadata;
2. resolves the pinned installed browser version;
3. resolves proxy runtime configuration without putting credentials in command-line arguments;
4. reserves then releases a loopback port for Chromium;
5. launches Chromium with a dedicated user-data directory and localhost-only remote debugging;
6. waits for CDP readiness;
7. persists/registers runtime state.

Stopping first requests graceful process exit and falls back to force termination after the configured grace period. Failed startup removes runtime metadata and profile locks.

## Proxy secret boundary

Supported Phase-1 proxy protocols are HTTP, HTTPS, and SOCKS5.

Proxy passwords are stored through the injected `SecretStore`. The Windows desktop adapter uses Electron `safeStorage`. Public DTOs expose only `hasPassword`; Chromium receives `--proxy-server=<scheme>://<host>:<port>` without username/password. Phase 1 does not yet implement interactive proxy-auth challenge handling.

## Database and recovery

SQLite initialization enables WAL and foreign keys, then applies idempotent migrations. Runtime sessions are persisted separately from profile metadata so startup reconciliation can distinguish:

- stale sessions whose PID is gone;
- verified live sessions that can be reattached;
- mismatched processes that must not be killed merely because a PID was reused.

## Phase-1 explicit non-features

The following are intentionally deferred to later plans:

- full GPM-familiar desktop profile/proxy/browser-manager UI;
- Local REST API/OpenAPI surface;
- browser-download UI and resumable download UX;
- groups and tags;
- extensions management;
- clone/templates and bulk operations;
- backup/restore and import/export UX;
- CPU/RAM dashboard and job queue UI;
- NSIS installer, code signing, and auto-update;
- macOS/Linux production support;
- Firefox;
- arbitrary fingerprint spoofing or platform-detection bypass mechanisms.

See `docs/superpowers/specs/2026-09-27-icrlogin-v1-design.md` for the V1 target and `docs/superpowers/plans/2026-09-27-icrlogin-phase-1-core-browser-proxy.md` for the Phase-1 implementation plan.
