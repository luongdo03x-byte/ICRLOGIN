# ICRLogin Real Runtime Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ICRLogin launch real isolated managed-Chromium profiles in dev mode with authenticated proxy routing, egress-IP/GeoIP resolution, auto/manual environment application, and per-profile launch progress.

**Architecture:** Keep `BrowserService` as the lifecycle owner and add focused runtime services under `packages/core/src/browsers` and `packages/core/src/network`. A `ProfileLaunchCoordinator` prepares network identity, managed Chromium, runtime proxy auth artifacts, and the effective environment, then delegates launch/CDP application back into the existing browser lifecycle.

**Tech Stack:** TypeScript, Node/Electron 38.1.2, React 19, TanStack Query, better-sqlite3, Zod, Chrome DevTools Protocol, Electron `safeStorage`, MaxMind GeoLite2 City MMDB.

**Spec:** `docs/superpowers/specs/2026-10-02-real-runtime-environment-design.md`

## Global Constraints

- Windows dev runtime first; no installer/cloud/multi-user work in this plan.
- Profiles use only Chromium versions managed by ICRLogin; never fall back to system Chrome.
- Preserve per-profile `user-data` and existing runtime reconciliation semantics.
- Renderer/preload must never receive proxy passwords, MaxMind license keys, unrestricted filesystem/process primitives, or full internal paths.
- Existing profiles migrate to `environmentMode = 'auto'`; latitude/longitude/accuracy default to `null`.
- GeoLite2 updater failure must never block startup when a previous valid DB exists.
- `webrtcEnabled = false` means protect against non-proxied UDP, not remove the WebRTC API.
- Final gates: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build -w @icrlogin/desktop`, then Windows real-browser smoke verification.

## Review Focus

- Authenticated proxy works without leaking credentials into renderer/logs and without an auth dialog.
- Egress lookup failure uses cache only when the route itself still works; stale state is visible and safe.
- Two concurrent profiles requesting one missing Chromium version share one install flight while receiving coherent progress.
- Failure after process spawn cleans runtime/process/temp auth artifacts but preserves `user-data`.
- Existing databases migrate safely and old profiles remain launchable with auto-environment defaults.

---

### Task 1: Extend profile contracts and database migration

**Files:**
- Modify: `packages/shared/src/profile.ts`
- Modify: `packages/shared/src/errors.ts`
- Create: `packages/core/src/db/migrations/005.ts`
- Modify: `packages/core/src/db/migrate.ts`
- Modify: `packages/core/src/repositories/profile-repository.ts`
- Create: `packages/core/src/repositories/network-identity-cache-repository.ts`
- Test: `packages/core/tests/migrate.test.ts`
- Test: `packages/core/tests/profile-repository.test.ts`

**Interfaces:**
- Produces `EnvironmentMode = 'auto' | 'manual'` and profile fields `environmentMode`, `latitude`, `longitude`, `accuracy`.
- Produces `NetworkIdentityCacheRepository` with `get(routeKey)`, `upsert(record)`, and `delete(routeKey)`.
- Adds error codes `PROXY_CONNECTION_FAILED`, `EGRESS_IP_RESOLUTION_FAILED`, `GEOIP_DATABASE_MISSING`, `GEOIP_LOOKUP_FAILED`, `BROWSER_ENVIRONMENT_APPLY_FAILED`, `PROXY_AUTH_RUNTIME_FAILED`.

- [ ] Write migration/profile repository tests proving existing rows become auto-mode with null coordinates and retain timezone.
- [ ] Run the focused tests and verify they fail before migration/schema changes.
- [ ] Implement shared schema/types, migration 005, repository persistence, and network identity cache table/repository.
- [ ] Run focused tests and verify pass.
- [ ] Commit: `feat: persist runtime environment configuration`.

### Task 2: Add egress-IP and GeoIP resolution services

**Files:**
- Create: `packages/core/src/network/egress-ip-resolver.ts`
- Create: `packages/core/src/network/geoip-service.ts`
- Create: `packages/core/src/network/network-identity-resolver.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/egress-ip-resolver.test.ts`
- Test: `packages/core/tests/network-identity-resolver.test.ts`
- Test: `packages/core/tests/geoip-service.test.ts`

**Interfaces:**
- `EgressIpResolver.resolve(proxy: ProxyRuntimeConfig | null): Promise<{ publicIp: string }>`.
- `GeoIpService.lookup(ip: string): Promise<GeoIpRecord>` where record contains country/city/timezone/latitude/longitude/accuracy/sourceDbVersion.
- `NetworkIdentityResolver.resolve(routeKey, proxy, options): Promise<ResolvedNetworkIdentity>` with `stale: boolean` and cache fallback semantics.

- [ ] Write tests for direct/proxy resolution, fallback endpoint behavior, proxy-unreachable failure, stale-cache fallback, and no-cache auto-mode failure.
- [ ] Run tests to verify failure.
- [ ] Implement the three services with injectable HTTP/proxy clients and MMDB reader boundaries so tests use fixtures only.
- [ ] Run focused tests and verify pass.
- [ ] Commit: `feat: resolve network identity and geo environment`.

### Task 3: Add GeoLite2 credential storage and updater

**Files:**
- Create: `packages/core/src/network/geoip-updater.ts`
- Modify: `packages/core/src/app-paths.ts`
- Modify: `apps/desktop/src/main/secret-store.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Test: `packages/core/tests/geoip-updater.test.ts`
- Test: `apps/desktop/tests/secret-store.test.ts`

**Interfaces:**
- `GeoIpUpdater.ensureFresh(): Promise<GeoIpUpdateResult>` with seven-day default cadence and atomic replacement.
- Desktop secret boundary stores MaxMind account/license material encrypted and never returns it through renderer APIs.

- [ ] Write updater tests for not-due, valid replacement, failed-download preserving old DB, invalid-download preserving old DB.
- [ ] Run tests to verify failure.
- [ ] Implement paths, updater, secure credential integration, and best-effort startup refresh.
- [ ] Run focused tests and verify pass.
- [ ] Commit: `feat: manage local geolite database`.

### Task 4: Generate per-profile proxy-auth runtime extension and WebRTC policy

**Files:**
- Create: `packages/core/src/proxies/proxy-runtime-extension.ts`
- Modify: `packages/core/src/proxies/proxy-args.ts`
- Modify: `packages/core/src/browsers/chromium-launcher.ts`
- Test: `packages/core/tests/proxy-runtime-extension.test.ts`
- Test: `packages/core/tests/chromium-launcher.test.ts`

**Interfaces:**
- `ProxyRuntimeExtensionBuilder.prepare(profileId, proxy): Promise<{ extensionPath: string | null; cleanup(): Promise<void> }>`.
- Chromium launch input accepts runtime extension paths separately from user extension paths and applies `disable_non_proxied_udp`-equivalent policy when protection is enabled.

- [ ] Write tests proving auth extension is generated only when credentials exist, includes no renderer exposure, and cleanup removes runtime files.
- [ ] Write launcher tests proving runtime and user extensions are both loaded and WebRTC protection flag/policy is selected correctly.
- [ ] Run tests to verify failure.
- [ ] Implement builder and launcher changes.
- [ ] Run focused tests and verify pass.
- [ ] Commit: `feat: add authenticated proxy runtime support`.

### Task 5: Resolve and apply effective browser environment via CDP

**Files:**
- Create: `packages/core/src/browsers/runtime-environment-resolver.ts`
- Create: `packages/core/src/browsers/browser-environment-applier.ts`
- Modify: `packages/core/src/browsers/cdp-client.ts`
- Test: `packages/core/tests/runtime-environment-resolver.test.ts`
- Test: `packages/core/tests/browser-environment-applier.test.ts`

**Interfaces:**
- `RuntimeEnvironmentResolver.resolve(profile, networkIdentity): EffectiveRuntimeEnvironment`.
- `BrowserEnvironmentApplier.apply(webSocketUrl, environment): Promise<void>` applies UA/language/timezone/device metrics/geolocation/permission behavior before runtime becomes `running`.

- [ ] Write tests for auto vs manual environment selection, stale diagnostics, `allow/ask/block` geolocation semantics, and WebRTC protection metadata.
- [ ] Run tests to verify failure.
- [ ] Implement resolver and CDP applier with required-command failures mapped to `BROWSER_ENVIRONMENT_APPLY_FAILED`.
- [ ] Run focused tests and verify pass.
- [ ] Commit: `feat: apply resolved browser environment`.

### Task 6: Add launch coordinator and browser download progress propagation

**Files:**
- Create: `packages/shared/src/launch-progress.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/core/src/browsers/profile-launch-coordinator.ts`
- Modify: `packages/core/src/browsers/browser-version-service.ts`
- Modify: `packages/core/src/browsers/browser-service.ts`
- Modify: `apps/desktop/src/main/app-services.ts`
- Test: `packages/core/tests/profile-launch-coordinator.test.ts`
- Test: `packages/core/tests/browser-version-service.test.ts`
- Test: `packages/core/tests/browser-service.test.ts`

**Interfaces:**
- `ProfileLaunchStage` matches the spec state machine.
- `BrowserVersionService.ensureInstalled(version, onProgress?)` forwards installer progress while preserving single-flight.
- `ProfileLaunchCoordinator.prepareAndLaunch(...)` publishes semantic profile-scoped stages and returns the data BrowserService needs for runtime registration.

- [ ] Write tests for ordered stages, missing-browser install progress, shared install flight, and failure cleanup after spawn.
- [ ] Run tests to verify failure.
- [ ] Implement progress contract, ensureInstalled progress propagation, coordinator, and BrowserService integration without moving lifecycle ownership out of BrowserService.
- [ ] Run focused tests and verify pass.
- [ ] Commit: `feat: coordinate real profile launch pipeline`.

### Task 7: Expose safe IPC/preload launch progress and GeoIP status

**Files:**
- Modify: `packages/shared/src/desktop-api.ts`
- Modify: `apps/desktop/src/main/ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/src/api/icr-client.ts`
- Test: `apps/desktop/tests/preload-phase4.test.ts`
- Test: `apps/desktop/tests/ipc-phase4.test.ts`
- Test: `apps/desktop/tests/renderer/icr-client.test.ts`

**Interfaces:**
- Renderer can subscribe/unsubscribe to safe `ProfileLaunchProgress` events.
- Renderer can read safe effective-environment diagnostics and GeoIP status, but never secrets.

- [ ] Write contract tests proving allowlisted event shape and absence of credential/path fields.
- [ ] Run tests to verify failure.
- [ ] Implement shared IPC types, main handlers/events, preload bridge, and renderer client methods.
- [ ] Run focused tests and verify pass.
- [ ] Commit: `feat: expose safe runtime progress diagnostics`.

### Task 8: Wire profile wizard and row progress UX

**Files:**
- Modify: `apps/desktop/src/renderer/src/pages/profiles/ProfileWizard.tsx`
- Modify: `apps/desktop/src/renderer/src/pages/profiles/profile-wizard-model.ts`
- Modify: `apps/desktop/src/renderer/src/pages/profiles/ProfilesPage.tsx`
- Modify: `apps/desktop/src/renderer/src/i18n/i18n.ts`
- Test: `apps/desktop/tests/renderer/profile-wizard-phase4-model.test.ts`
- Test: `apps/desktop/tests/renderer/profiles-page-model.test.ts`
- Test: `apps/desktop/tests/i18n.test.ts`

**Interfaces:**
- Wizard supports auto/manual environment mode plus latitude/longitude/accuracy; timezone is manually editable in manual mode.
- Profile rows render current launch stage/percent and stale-network warning; only the active profile row is disabled while starting.

- [ ] Write model/UI tests for environment validation and per-profile progress/stale display behavior.
- [ ] Run tests to verify failure.
- [ ] Implement wizard fields, row progress mapping, and Vietnamese/English translations.
- [ ] Run focused tests and verify pass.
- [ ] Commit: `feat: add real runtime profile controls`.

### Task 9: Integration hardening and regression verification

**Files:**
- Modify/Create tests under `packages/core/tests/` and `apps/desktop/tests/` only as needed for integration coverage.
- Update: `docs/superpowers/specs/2026-10-02-real-runtime-environment-design.md` status after verified completion.

**Interfaces:**
- No new production interface unless a failing integration test proves one is required.

- [ ] Add integration coverage for profile persistence, launch order, cleanup preserving `user-data`, runtime reconciliation compatibility, and two-profile session isolation assumptions.
- [ ] Run `npm run typecheck` and require zero errors.
- [ ] Run `npm run lint` and require zero errors.
- [ ] Run `npm test` and require all workspace tests pass.
- [ ] Run `npm run build -w @icrlogin/desktop` and require successful main/preload/renderer builds.
- [ ] On Windows dev runtime, manually verify authenticated proxy egress IP, timezone, geolocation, WebRTC protection, session persistence, automatic Chromium install/progress, two-profile cookie isolation, and app restart reconciliation.
- [ ] Commit: `test: verify real runtime environment`.

## Self-review result

- Spec coverage: all requirements in sections 1-29 map to Tasks 1-9; deterministic Canvas/WebGL/Audio fingerprinting remains intentionally outside this plan.
- Type consistency: environment, progress, network identity, and coordinator interfaces are defined once and consumed by later tasks.
- Review focus: each listed failure class is pinned to a task-level test.
- Proportion: plan stays at signatures/test outcomes rather than implementation transcripts.
