# ICRLogin Phase 3 Local API + CDP Automation Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a localhost-only HTTP API that reuses the existing ICRLogin Core services for profile, group, proxy, browser, process, and Chromium lifecycle automation, returning CDP connection data for external Playwright/Puppeteer/Selenium clients.

**Architecture:** Implement the HTTP server inside `@icrlogin/core` with native Node `http`, shared Zod contracts, a small explicit router, and no duplicated business logic. Electron main composes the same `AppServices` already used by IPC and starts/stops the API server on `127.0.0.1` with configurable port 9495. Optional bearer authentication is injected as a secret; transport code never receives filesystem/shell/database primitives.

**Tech Stack:** Node.js 22 native `http`/`net`, TypeScript, Zod, Electron safeStorage-backed `SecretStore`, SQLite/Core services, Vitest, built-in `fetch` for API integration tests.

**Spec:** `docs/superpowers/specs/2026-09-27-icrlogin-v1-design.md`

## Global Constraints

- Bind only to `127.0.0.1`; V1 must never listen on `0.0.0.0`, LAN interfaces, or public interfaces.
- Default port is `9495`; production configuration accepts ports `1..65535` only.
- HTTP API prefix is `/api/v1`.
- Local API success envelope is `{ success: true, data, error: null }`; failure envelope is `{ success: false, data: null, error: { code, message } }`.
- Starting a profile returns `profileId`, `status`, `pid`, `browserVersion`, `remoteDebuggingPort`, `cdpHttpUrl`, and `webSocketDebuggerUrl`.
- API DTOs must not expose proxy passwords/encrypted password blobs, Chromium executable paths, profile user-data paths, database handles, process handles, arbitrary shell/file operations, or arbitrary Chromium flags.
- Optional bearer authentication uses `Authorization: Bearer <token>` and constant-time comparison; the token is never logged or returned by API responses.
- Request JSON body limit is 1 MiB; malformed JSON and schema-invalid payloads return `INVALID_REQUEST` without calling Core.
- Basic rate limit is 100 requests/second per remote address; excess calls return HTTP 429 with `RATE_LIMITED`.
- Long-running browser download/start operations remain asynchronous at the HTTP request level but must not block the Electron event loop with synchronous network/file loops.
- Existing browser/profile rules remain authoritative: same profile cannot start twice, browser version cannot change while not stopped, failed start cleans runtime artifacts, and profiles keep pinned Chromium versions.
- Browser uninstall is rejected while any non-deleted profile references that version.
- No fingerprint spoofing, stealth bypass, CAPTCHA bypass, arbitrary browser flags, or anti-detection functionality is added.

## Review Focus

1. **Host exposure:** server options or environment input must never be able to widen the bind address beyond `127.0.0.1`; tests inspect the actual listening address.
2. **Malformed/oversized input:** invalid JSON, >1 MiB bodies, invalid UUID/body shapes, and unsupported methods must terminate safely before service invocation.
3. **Secret/path leakage:** proxy credentials, API bearer token, executable paths, and user-data paths must be absent from list/get/error/process payloads.
4. **Concurrent heavy operations:** same-profile concurrent start preserves `PROFILE_START_IN_PROGRESS`; same-version concurrent browser download performs one install; uninstall is rejected while referenced.
5. **Lifecycle races:** `starting`/`stopping` states remain visible through API and destructive profile mutations are rejected until state is `stopped`.

---

### Task 1: Shared HTTP API contracts and error vocabulary

**Files:**
- Create: `packages/shared/src/http-api.ts`
- Modify: `packages/shared/src/errors.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/tests/contracts.test.ts`

**Interfaces:**
- Produces `HttpApiSuccess<T>`, `HttpApiFailure`, `HttpApiEnvelope<T>`.
- Produces Zod schemas for route payloads: profile create/update, group create/update, proxy create/update, browser download, ID/version params.
- Produces sanitized DTO types `HttpProfileRuntime`, `HttpProcessRecord`, `HttpInstalledBrowser`, `HttpProxyTestResult`.
- Adds error codes `RATE_LIMITED`, `ROUTE_NOT_FOUND`, `METHOD_NOT_ALLOWED`, and `BROWSER_IN_USE` to `AppErrorCode`.

- [ ] **Step 1: Write failing shared contract tests** asserting success/failure envelope shapes, new error codes, HTTP/HTTPS-only startup URLs, valid port/version/id payloads, and that process/browser DTO types contain no executable/user-data path fields.
- [ ] **Step 2: Run** `npm run test -w @icrlogin/shared` and verify RED for missing HTTP API exports/error codes.
- [ ] **Step 3: Implement shared contracts and exports** without adding runtime dependencies beyond existing Zod.
- [ ] **Step 4: Run** `npm run test -w @icrlogin/shared` and verify GREEN.
- [ ] **Step 5: Commit** `feat: add local http api contracts`.

### Task 2: Local API server foundation, localhost bind, auth, parsing, and rate limiting

**Files:**
- Create: `packages/core/src/api/local-api-server.ts`
- Create: `packages/core/src/api/local-api-router.ts`
- Create: `packages/core/src/api/http-response.ts`
- Create: `packages/core/src/api/request-body.ts`
- Create: `packages/core/src/api/rate-limiter.ts`
- Create: `packages/core/src/api/bearer-auth.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/local-api-server.test.ts`

**Interfaces:**
- Produces `LocalApiServer(options)` with `start(): Promise<{ host:'127.0.0.1'; port:number; baseUrl:string }>` and `stop(): Promise<void>`.
- `LocalApiServerOptions` accepts `port`, optional `bearerToken`, `services`, `rateLimitPerSecond` default `100`, and test-only clock/listener injection.
- Produces explicit router registration; no wildcard reflection or dynamic method dispatch.
- `/api/v1/health` is reachable without bearer auth; protected routes require auth only when a token is configured.

- [ ] **Step 1: Write failing server tests** for actual bind address `127.0.0.1`, default/configured port behavior, `PORT_UNAVAILABLE`, public health, optional bearer 401, valid bearer success, constant-time comparator behavior, JSON content type, 1 MiB rejection, invalid JSON, 404 route, 405 method, and 100 req/s → 429.
- [ ] **Step 2: Run** `npm run test -w @icrlogin/core -- local-api-server.test.ts` and verify RED.
- [ ] **Step 3: Implement server/router/auth/body/rate-limit primitives** using native Node APIs only.
- [ ] **Step 4: Re-run focused tests** and verify GREEN with no service call on rejected bodies/auth/rate-limit cases.
- [ ] **Step 5: Commit** `feat: add localhost api server foundation`.

### Task 3: Profile and group HTTP resources

**Files:**
- Create: `packages/core/src/api/routes/profile-routes.ts`
- Create: `packages/core/src/api/routes/group-routes.ts`
- Modify: `packages/core/src/api/local-api-router.ts`
- Test: `packages/core/tests/local-api-profile-routes.test.ts`
- Test: `packages/core/tests/local-api-group-routes.test.ts`

**Interfaces:**
- Routes:
  - `GET /api/v1/profiles`
  - `POST /api/v1/profiles`
  - `GET /api/v1/profiles/:id`
  - `PATCH /api/v1/profiles/:id`
  - `DELETE /api/v1/profiles/:id`
  - `GET /api/v1/groups`
  - `POST /api/v1/groups`
  - `PATCH /api/v1/groups/:id`
  - `DELETE /api/v1/groups/:id`
- Profile DTO includes runtime state/start time but no local filesystem path.
- Group delete preserves existing Core behavior: member profiles move to Ungrouped.

- [ ] **Step 1: Write failing profile route tests** for list/get/create/update/soft-delete, unknown ID, runtime-state projection, startup URL validation, and update/delete rejection during `starting/running/stopping`.
- [ ] **Step 2: Write failing group route tests** for list/create/rename/delete, duplicate/blank names, and delete-to-Ungrouped behavior.
- [ ] **Step 3: Run both focused suites and verify RED.**
- [ ] **Step 4: Implement route adapters** that call existing `ProfileService`, `GroupService`, and `BrowserService.getState/getRuntime`; business rules stay in Core/main guards rather than HTTP parsing code.
- [ ] **Step 5: Run focused suites and verify GREEN.**
- [ ] **Step 6: Commit** `feat: expose profile and group local api`.

### Task 4: Browser lifecycle and process automation endpoints

**Files:**
- Create: `packages/core/src/api/routes/runtime-routes.ts`
- Modify: `packages/core/src/api/local-api-router.ts`
- Modify: `packages/core/src/browsers/browser-service.ts`
- Test: `packages/core/tests/local-api-runtime-routes.test.ts`
- Modify: `packages/core/tests/browser-service.test.ts`

**Interfaces:**
- Routes:
  - `POST /api/v1/profiles/:id/start`
  - `POST /api/v1/profiles/:id/stop`
  - `POST /api/v1/profiles/:id/restart`
  - `GET /api/v1/processes`
- Adds `BrowserService.restart(profileId): Promise<BrowserRuntimeInfo>` implemented as serialized stop-if-running then start under existing per-profile coordination without double-spawn.
- Start/restart response uses sanitized CDP attach fields only.
- `GET /processes` exposes `profileId`, state, PID, browserVersion, debugging port, CDP URLs, and startedAt; it excludes executablePath/userDataDir.

- [ ] **Step 1: Write failing route tests** for start response fields, stop, restart preserving profile user-data identity indirectly through same profile ID, process listing, stopped/not-found errors, and absence of filesystem paths.
- [ ] **Step 2: Add failing BrowserService restart tests** for stopped profile, running profile, and concurrent restart/start serialization.
- [ ] **Step 3: Run focused runtime suites and verify RED.**
- [ ] **Step 4: Implement `restart` and runtime route adapters** using existing BrowserService/ProcessRegistry behavior.
- [ ] **Step 5: Run focused suites and verify GREEN.**
- [ ] **Step 6: Commit** `feat: add lifecycle automation api`.

### Task 5: Proxy API and basic connectivity test

**Files:**
- Create: `packages/core/src/proxies/proxy-connectivity-service.ts`
- Create: `packages/core/src/api/routes/proxy-routes.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/api/local-api-router.ts`
- Test: `packages/core/tests/proxy-connectivity-service.test.ts`
- Test: `packages/core/tests/local-api-proxy-routes.test.ts`

**Interfaces:**
- Routes:
  - `GET /api/v1/proxies`
  - `POST /api/v1/proxies`
  - `PATCH /api/v1/proxies/:id`
  - `DELETE /api/v1/proxies/:id`
  - `POST /api/v1/proxies/:id/test`
- `ProxyConnectivityService.test(proxyId, timeoutMs=5000)` resolves decrypted runtime config inside Core, attempts TCP reachability to proxy host/port, and returns `{ reachable:true, latencyMs }` or throws `PROXY_CONNECTION_FAILED` without returning credentials.
- This V1 test is explicitly transport reachability; it does not claim external-IP verification.

- [ ] **Step 1: Write failing connectivity tests** with injected socket connector for success latency, timeout, DNS/connect failure, and ensuring credentials never appear in thrown error details.
- [ ] **Step 2: Write failing API tests** for CRUD redaction, blank-password-preserve on update, delete foreign-key SET NULL behavior, test success/failure, and no password/encryptedPassword in serialized output.
- [ ] **Step 3: Run focused suites and verify RED.**
- [ ] **Step 4: Implement connectivity service and proxy route adapters.**
- [ ] **Step 5: Run focused suites and verify GREEN.**
- [ ] **Step 6: Commit** `feat: expose proxy local api`.

### Task 6: Managed browser API, single-flight download, and safe uninstall

**Files:**
- Modify: `packages/core/src/browsers/browser-version-service.ts`
- Modify: `packages/core/src/browsers/browser-download-installer.ts`
- Modify: `packages/core/src/repositories/profile-repository.ts`
- Create: `packages/core/src/api/routes/browser-routes.ts`
- Modify: `packages/core/src/api/local-api-router.ts`
- Test: `packages/core/tests/browser-version-management.test.ts`
- Test: `packages/core/tests/local-api-browser-routes.test.ts`

**Interfaces:**
- Routes:
  - `GET /api/v1/browsers`
  - `POST /api/v1/browsers/:version/download`
  - `DELETE /api/v1/browsers/:version`
- `BrowserVersionService.download` becomes single-flight per version so concurrent requests share one install promise.
- `ProfileRepository.countByBrowserVersion(version): number` counts non-deleted profile references.
- `BrowserVersionService.remove(version): Promise<void>` rejects `BROWSER_IN_USE` when usage count > 0, removes the canonical `%LOCALAPPDATA%/ICRLogin/browsers/<version>` directory through injected uninstaller, then removes the DB record; failed filesystem removal leaves the DB record intact.
- Browser API response exposes version/hash/size/install time/availability/profile usage only, never executable path.

- [ ] **Step 1: Write failing management tests** for same-version concurrent download → one installer call, failed install cleanup, uninstall unused version, reject referenced version, and DB preservation when filesystem removal fails.
- [ ] **Step 2: Write failing API tests** for available+installed listing, download, delete, sanitized DTOs, and offline listing of installed versions when remote manifest is unavailable.
- [ ] **Step 3: Run focused suites and verify RED.**
- [ ] **Step 4: Implement single-flight, usage query, safe uninstaller, and browser routes.**
- [ ] **Step 5: Run focused suites and verify GREEN.**
- [ ] **Step 6: Commit** `feat: expose managed browser local api`.

### Task 7: OpenAPI document and contract parity

**Files:**
- Create: `packages/core/src/api/openapi.ts`
- Modify: `packages/core/src/api/local-api-router.ts`
- Test: `packages/core/tests/local-api-openapi.test.ts`

**Interfaces:**
- Route: `GET /api/v1/openapi.json`.
- OpenAPI version is `3.1.0`; API info version starts at `1.0.0` independently of app version.
- Documents bearer auth as optional and all Phase-3 routes/status envelopes/error codes.

- [ ] **Step 1: Write failing OpenAPI tests** asserting every registered route+method exists in the document, server URL is localhost-only, schemas exclude secret/path fields, and API version is independent from package app version.
- [ ] **Step 2: Run focused test and verify RED.**
- [ ] **Step 3: Implement static typed OpenAPI document** adjacent to route registration; do not auto-reflect arbitrary handlers.
- [ ] **Step 4: Run focused test and verify GREEN.**
- [ ] **Step 5: Commit** `docs: add local api openapi contract`.

### Task 8: Electron main integration and encrypted API token loading

**Files:**
- Create: `apps/desktop/src/main/api-token-store.ts`
- Modify: `apps/desktop/src/main/config.ts`
- Modify: `apps/desktop/src/main/app-services.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Test: `apps/desktop/tests/api-token-store.test.ts`
- Test: `apps/desktop/tests/local-api-integration.test.ts`

**Interfaces:**
- `resolveLocalApiSettings(env, paths)` returns `{ host:'127.0.0.1', port:9495|configured, tokenFile }`; host is not configurable.
- `EncryptedApiTokenStore` stores/loads an optional token as encrypted text using existing Electron safeStorage-backed `SecretStore`; plaintext is never written to disk.
- Electron starts `LocalApiServer` with the same service objects used by IPC and stops it during app shutdown.
- Dev override `ICRLOGIN_API_TOKEN` may supply an in-memory token for local development; persistent token files remain encrypted.
- API bind failure does not corrupt Core or running profiles; desktop may continue while reporting a sanitized API startup error.

- [ ] **Step 1: Write failing token/config tests** for fixed localhost host, default/custom port, invalid port rejection, encrypted-at-rest token file, no plaintext token persistence, and env override precedence.
- [ ] **Step 2: Write failing desktop integration test** proving IPC and HTTP API share the same profile/runtime service graph and that app shutdown stops the listener.
- [ ] **Step 3: Run focused desktop tests and verify RED.**
- [ ] **Step 4: Implement token store/config/main wiring** with no renderer token exposure.
- [ ] **Step 5: Run focused tests and verify GREEN.**
- [ ] **Step 6: Commit** `feat: integrate local api with desktop main`.

### Task 9: External automation smoke, documentation, and Phase-3 gate

**Files:**
- Create: `packages/core/tests/local-api.chromium.integration.test.ts`
- Create: `docs/development/phase-3-local-api.md`
- Modify: `README.md`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Real-Chromium smoke: start server on localhost test port → create/use test profile → `POST /start` → verify `/json/version` + returned WebSocket URL → attach with Playwright `chromium.connectOverCDP(cdpHttpUrl)` → create a page → stop through HTTP API → verify process/runtime cleanup.
- Documentation includes curl examples and Playwright/Puppeteer/Selenium attach snippets using returned CDP data; no stealth plugins or anti-detection guidance.

- [ ] **Step 1: Write the integration smoke** and verify it fails before final wiring where appropriate.
- [ ] **Step 2: Run focused real-Chromium API smoke** on an available Chromium binary and verify GREEN.
- [ ] **Step 3: Write Phase-3 developer docs and update README** with endpoint base URL, optional bearer usage, API version, and automation attachment examples.
- [ ] **Step 4: Update CI gate** to run shared/core/desktop tests, `typecheck`, `lint`, desktop build, and the local-API Chromium integration smoke when a runner is provisioned.
- [ ] **Step 5: Run final gate:** `npm run typecheck`, `npm test`, `npm run lint`, `npm run build -w @icrlogin/desktop`, `npm run test:integration:chromium`, and the new local-API Chromium smoke; record infrastructure-only blockers separately.
- [ ] **Step 6: Whole-branch review** against the spec for localhost binding, secret/path redaction, lifecycle races, rate limiting, auth, API parity, and Phase-1/2 regression.
- [ ] **Step 7: Commit** `feat: complete ICRLogin phase 3 local api`.

## Self-review result

- **Spec coverage:** Localhost bind, configurable default port, optional bearer auth, profile/group/proxy/browser/process operations, CDP return values, start/stop/restart, OpenAPI, rate limiting, and desktop composition are all assigned to tasks.
- **Transport/business separation:** HTTP files own parsing/routing/envelopes only; lifecycle, proxy secret access, browser download/install/remove, and persistence remain Core responsibilities.
- **Type consistency:** Route DTO names are defined once in shared contracts; Electron main injects the existing `AppServices` objects rather than creating a second service graph.
- **Security coverage:** Host pinning, body bounds, auth comparison, secret/path redaction, route allowlisting, and no arbitrary shell/filesystem surface all have explicit tests.
- **Concurrency coverage:** Same-profile start remains guarded by BrowserService; same-version browser download gets a single-flight regression; browser uninstall has profile-reference enforcement.
- **Deferred intentionally:** Settings UI for creating/revealing/changing the persistent API token remains a later Settings task. Phase 3 supports encrypted token loading and an in-memory development override without exposing the token to renderer/API responses.
