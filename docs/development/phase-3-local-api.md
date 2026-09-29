# Phase 3 Local API + CDP Automation

Phase 3 exposes the existing ICRLogin Core through a localhost-only HTTP API for local QA/RPA automation. The API does not create a second profile/process system: Electron IPC and HTTP requests use the same `AppServices`, `BrowserService`, runtime registry, SQLite database, and Chromium user-data directories.

## Local endpoint

The API binds only to:

```text
http://127.0.0.1:9495/api/v1
```

The port can be changed with `ICRLOGIN_API_PORT`. The host is intentionally not configurable in V1; environment values such as `0.0.0.0` are ignored because LAN/public exposure is out of scope.

Health and OpenAPI:

```powershell
curl.exe http://127.0.0.1:9495/api/v1/health
curl.exe http://127.0.0.1:9495/api/v1/openapi.json
```

## Optional bearer authentication

If a token is configured, protected routes require:

```text
Authorization: Bearer <token>
```

For local development, `ICRLOGIN_API_TOKEN` supplies an in-memory token. A persistent token is stored encrypted through Electron `safeStorage`; plaintext token values are not written to the token file or returned by API responses.

Example:

```powershell
curl.exe -H "Authorization: Bearer $env:ICRLOGIN_API_TOKEN" http://127.0.0.1:9495/api/v1/profiles
```

`/api/v1/health` and `/api/v1/openapi.json` remain public on localhost so local diagnostics and API discovery work even when bearer auth is enabled.

Protected routes reject requests carrying a browser `Origin` header. The desktop renderer uses typed IPC rather than browser HTTP fetches, while local Node/Python/automation clients normally do not send an `Origin` header. This prevents a normal website from using the optional no-token mode as a localhost CSRF surface.

## Main resources

```text
GET    /api/v1/profiles
POST   /api/v1/profiles
GET    /api/v1/profiles/:id
PATCH  /api/v1/profiles/:id
DELETE /api/v1/profiles/:id

POST   /api/v1/profiles/:id/start
POST   /api/v1/profiles/:id/stop
POST   /api/v1/profiles/:id/restart
GET    /api/v1/processes

GET    /api/v1/groups
POST   /api/v1/groups
PATCH  /api/v1/groups/:id
DELETE /api/v1/groups/:id

GET    /api/v1/proxies
POST   /api/v1/proxies
PATCH  /api/v1/proxies/:id
DELETE /api/v1/proxies/:id
POST   /api/v1/proxies/:id/test

GET    /api/v1/browsers
POST   /api/v1/browsers/:version/download
DELETE /api/v1/browsers/:version
```

Normal API responses use:

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

Failures use stable error codes:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "PROFILE_NOT_FOUND",
    "message": "Profile not found"
  }
}
```

The OpenAPI endpoint returns the OpenAPI document directly rather than nesting it in the normal envelope so standard OpenAPI tooling can consume it.

## Starting a profile and attaching over CDP

Start response data contains only automation-safe fields:

```json
{
  "profileId": "...",
  "status": "running",
  "pid": 1234,
  "browserVersion": "143.0.0",
  "remoteDebuggingPort": 43127,
  "cdpHttpUrl": "http://127.0.0.1:43127",
  "webSocketDebuggerUrl": "ws://127.0.0.1:43127/devtools/browser/..."
}
```

It does not expose Chromium executable paths, profile user-data paths, proxy passwords, encrypted secrets, database handles, or process handles.

### Playwright

```ts
import { chromium } from 'playwright';

const start = await fetch('http://127.0.0.1:9495/api/v1/profiles/<profile-id>/start', {
  method: 'POST',
  headers: process.env.ICRLOGIN_API_TOKEN
    ? { Authorization: `Bearer ${process.env.ICRLOGIN_API_TOKEN}` }
    : undefined
});
const payload = await start.json();
const browser = await chromium.connectOverCDP(payload.data.cdpHttpUrl);
const context = browser.contexts()[0];
const page = await context.newPage();
await page.goto('https://example.com');
```

### Puppeteer

```ts
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.connect({
  browserWSEndpoint: startPayload.data.webSocketDebuggerUrl
});
```

### Selenium

Use the returned `127.0.0.1:<remoteDebuggingPort>` as the Chromium debugger address in Selenium/ChromeOptions. The local API itself does not run arbitrary scripts or accept arbitrary Chromium flags.

## Proxy test semantics

`POST /api/v1/proxies/:id/test` is a basic TCP reachability test to the configured proxy host and port. It reports local connection latency only. It does not claim external-IP validation and it never returns proxy credentials.

## Browser management safety

- Browser downloads are single-flight per version: concurrent requests share one installation operation.
- SHA-256/archive validation remains in the managed browser installer.
- Browser uninstall is rejected with `BROWSER_IN_USE` while any non-deleted profile references the version.
- Filesystem removal occurs before the installed-version DB record is deleted; failed removal keeps the DB record intact.
- Installed browsers remain visible through the API if the remote manifest is temporarily unavailable.
- Filesystem failures are reduced to stable browser error messages before crossing the HTTP boundary; local browser/profile paths are not returned.

## Limits and security

- Listener: `127.0.0.1` only.
- Default port: `9495`.
- Request body maximum: 1 MiB.
- Default rate limit: 100 requests/second per remote address.
- Optional bearer comparison uses fixed-length SHA-256 digests plus constant-time comparison.
- Protected routes reject browser-origin requests.
- Malformed percent-encoded route parameters return `INVALID_REQUEST` instead of surfacing runtime decoder errors.
- CDP listeners are localhost-only.
- No arbitrary filesystem/shell endpoints are exposed.
- No fingerprint fabrication, stealth plugins, detection bypass, CAPTCHA bypass, or arbitrary browser-flag injection is part of this API.

## Verification

Full repository gate when dependencies and a runner are available:

```powershell
npm install
npm run typecheck
npm test
npm run lint
npm run build -w @icrlogin/desktop
npm run test:integration:chromium
```

The Chromium integration gate includes the existing profile lifecycle smoke and the Phase-3 HTTP API → CDP → Playwright automation smoke.

### Latest verification evidence

On the Phase-3 branch, the sandbox gate after the final security review passed:

- Local API security regressions: protected method auth ordering, browser-origin rejection, malformed route encoding, optional OpenAPI bearer declaration, and filesystem-path redaction.
- Chromium semantic smoke using system Chromium 144: API listener on `127.0.0.1` → start Chromium → `/json/version` → `Browser.getVersion` → `Target.createTarget` → stop → process cleanup.
- Earlier focused Phase-3 service/route/config/token gates were green before the final review fixes.

Infrastructure blockers are recorded separately from code failures:

- The sandbox cannot resolve `github.com`/npm registry hosts, so a fresh full dependency install and complete workspace `typecheck/test/lint/build` cannot run there.
- GitHub Actions runs are created, but the job fails before runner execution (`steps: null` / no runner steps), so there is no CI test log attributable to repository code yet.
