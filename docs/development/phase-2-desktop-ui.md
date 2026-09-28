# Phase 2 Desktop UI

Phase 2 turns the Phase-1 Electron shell into the first usable local desktop manager. It keeps all privileged work in Electron main and exposes only the typed preload API to React.

## Included

- Profiles table with search/filter/sort, proxy-presence filter, selection, lifecycle state, Open/Stop, Edit and soft-delete actions.
- Five-step Create/Edit Profile wizard: General, Proxy, Browser Environment, Startup URLs, Review.
- Groups create/rename/delete; deleting a group moves member profiles to Ungrouped.
- Proxy Manager for HTTP/HTTPS/SOCKS5 with main-process secret storage. Renderer receives `hasPassword`, never encrypted/plain saved secrets.
- Browser Manager with Available/Installed views, stable marker, progress, retry state and installed-browser offline behavior.
- Typed allowlisted IPC/preload bridge. Renderer has no generic invoke, filesystem, process, database or secret primitive.
- Browser lifecycle state is exposed as `starting/running/stopping/stopped` so destructive profile mutations are blocked during transition races.
- Extensions and Settings remain explicit later-phase placeholders so navigation structure is stable.

## Development

```powershell
npm install
npm run typecheck
npm test
npm run lint
npm run build -w @icrlogin/desktop
npm run dev -w @icrlogin/desktop
```

Production validation is Windows 10/11 x64. Linux is development/test only. A configured Chromium manifest URL is supplied in Electron main through `ICRLOGIN_BROWSER_MANIFEST_URL`; the renderer never owns the manifest endpoint.

## Verification status

The implementation was developed with focused RED → GREEN checks. The latest sandbox verification after the Phase-2 review fixes included:

- strict TypeScript regression harness for profile proxy filtering, safe runtime row actions, startup URL handling, and browser-version locking across every non-stopped lifecycle state;
- lifecycle-state regression covering `stopped → starting → running → stopping → stopped` and runtime cleanup;
- Chromium 144 smoke using a real local Chromium: CDP `/json/version` became reachable on localhost, the browser was stopped, restarted with the same `user-data-dir`, and CDP became reachable again.

A full dependency-backed workspace gate must still be rerun in a normal development/CI environment. The current execution environment cannot resolve `registry.npmjs.org` (`EAI_AGAIN`), so it cannot install missing React/Electron/Vitest dependencies. GitHub Actions is configured for feature branches, but current hosted runs fail before executing any step with `runner_id=0` and an empty step list. That is recorded as an infrastructure blocker rather than a passing or failing code result.

When either environment is available, rerun the full gate:

```powershell
npm install
npm run typecheck
npm test
npm run lint
npm run build -w @icrlogin/desktop
```

and perform the Windows 10/11 desktop smoke before treating Phase 2 as release-ready.

## Security boundary

The BrowserWindow retains `contextIsolation: true`, `nodeIntegration: false`, and sandboxing. IPC validates payloads with shared schemas and serializes stable error envelopes. Proxy credentials are decrypted only when Core needs runtime proxy configuration and are not included in browser command-line arguments or renderer DTOs.

## Phase-2 non-goals

Extensions management, Settings implementation, tags, clone/import/export, backup/restore UI, local REST API UI and process/resource dashboard are intentionally deferred to later phases.
