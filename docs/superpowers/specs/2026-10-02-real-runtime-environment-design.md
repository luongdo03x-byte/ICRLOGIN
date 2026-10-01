# ICRLogin Real Runtime Environment Design

Date: 2026-10-02
Status: Design approved in chat; written spec pending explicit review
Scope: Sub-project 1 of the internal GPMLogin-like runtime roadmap

## 1. Goal

Turn ICRLogin from a profile-management UI into a real local browser runtime in development mode. A profile must persist real browser state, launch a managed Chromium build, route traffic through the configured proxy, apply the selected environment consistently, and expose launch progress in the UI.

This sub-project is intentionally focused on the runtime foundation. Deterministic Canvas/WebGL/Audio fingerprinting, advanced hardware fingerprint generation, and final installer packaging are separate follow-up sub-projects.

## 2. Success Criteria

A user can create a profile and press Open. ICRLogin then:

1. Resolves the effective network identity.
2. Uses the configured proxy, including username/password authentication where required.
3. Resolves the real public egress IP through that route.
4. Maps the egress IP to timezone and geolocation using a local GeoLite2 City database.
5. Automatically downloads, verifies, installs, and launches the selected managed Chromium version if it is not already installed.
6. Applies runtime environment settings before the profile is considered running.
7. Preserves cookies, localStorage, IndexedDB, cache, and login state in the profile's own user-data directory.
8. Shows per-profile progress without blocking the rest of the application.
9. Cleans up partial runtime state if any required step fails.
10. Recovers already-running Chromium profiles on the next ICRLogin start using the existing reconciliation mechanism.

## 3. Non-Goals

This design does not include:

- Cloud sync or multi-user accounts.
- Installer/release packaging.
- Full deterministic anti-fingerprint generation for Canvas/WebGL/Audio.
- Browser automation/training behavior.
- Remote control of profiles.
- Replacing the existing local SQLite data model with a server database.

## 4. Existing Architecture to Preserve

The current code already has several production-capable pieces that should be extended rather than replaced:

- ProfileService persists profile records and creates profile filesystem state.
- BrowserService owns browser lifecycle, runtime registry, runtime lock files, stop/restart, and cleanup.
- BrowserVersionService can ensure a managed Chromium version is installed and already implements single-flight installs.
- ChromiumLauncher starts a selected managed Chromium executable with an isolated user-data directory.
- ProcessRegistry and RuntimeSessionRepository track active runtimes.
- RuntimeReconciler restores runtime state after ICRLogin restarts.
- Electron safeStorage protects proxy credentials.
- Renderer access is restricted through typed preload IPC.

The new design must preserve those boundaries.

## 5. Architectural Decision

Introduce a launch-coordination layer instead of expanding BrowserService into a monolith.

High-level structure:

```text
BrowserService
  -> ProfileLaunchCoordinator
       -> NetworkIdentityResolver
            -> EgressIpResolver
            -> GeoIpService
       -> RuntimeEnvironmentResolver
       -> ProxyRuntimeExtensionBuilder
       -> BrowserVersionService
       -> ChromiumLauncher
       -> BrowserEnvironmentApplier
       -> LaunchProgressPublisher
```

BrowserService remains responsible for lifecycle semantics: start, stop, restart, runtime registration, runtime lock ownership, process cleanup, and recovery integration.

ProfileLaunchCoordinator is responsible for preparing everything required to start a profile and reporting progress.

## 6. Launch State Machine

Each profile has one launch-progress stream independent of other profiles.

```text
idle
 -> resolving-network
 -> resolving-geo
 -> downloading-browser    (only when missing)
 -> verifying-browser      (only when downloading)
 -> installing-browser     (only when downloading)
 -> preparing-runtime
 -> launching
 -> waiting-cdp
 -> applying-environment
 -> running

Any stage -> failed
```

The UI should render this state on the profile row. Only actions for that profile are disabled while it is starting. Other profiles and application screens remain usable.

Progress events must not contain proxy passwords, full filesystem paths, tokens, or other secrets.

## 7. Profile Environment Model

Extend the profile model with explicit auto/manual environment behavior.

```ts
type EnvironmentMode = 'auto' | 'manual';

interface ProfileEnvironmentFields {
  environmentMode: EnvironmentMode;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
}
```

Existing fields remain:

- language
- timezone
- windowWidth / windowHeight
- screenWidth / screenHeight
- webrtcEnabled
- geolocationMode
- userAgent

### Auto mode

The effective timezone and geolocation are resolved from the current public egress IP on each launch.

### Manual mode

The user-provided timezone, latitude, longitude, and accuracy are used. The network identity is still resolved for diagnostics and consistency warnings, but it does not overwrite manual values.

The database stores user intent. Runtime-effective values are calculated for each launch and are not blindly written back into profile configuration.

## 8. Network Identity Resolution

### Profile with proxy

1. Load proxy runtime configuration from the existing proxy service.
2. Perform a connectivity test through that exact proxy route.
3. Query an IP-echo endpoint through the proxy to obtain the public egress IP actually visible to websites.
4. Use fallback IP-echo endpoints when the primary endpoint is unavailable.
5. Cache successful network identity results by proxy ID.

### Profile without proxy

Use the same flow through the direct system network connection.

### Failure policy

- If the proxy itself cannot connect, profile launch fails.
- If the proxy works but new egress-IP resolution fails, use the most recent cached network identity when available and mark it stale.
- If there is no usable cache, continue only when manual environment mode provides enough environment data; otherwise fail with a clear error.

## 9. Network Identity Cache

Add a cache repository/table for non-secret resolved data.

Suggested fields:

```text
route_key          proxy:<id> or direct
public_ip
country_iso
city_name
timezone
latitude
longitude
accuracy
resolved_at
source_db_version
```

Passwords, proxy usernames, tokens, and MaxMind license keys must never be stored in this table.

The renderer receives only the safe diagnostic subset.

## 10. GeoIP Service

Use MaxMind GeoLite2 City as the local IP-to-location database.

Responsibilities:

- Read the local `.mmdb` file.
- Resolve public IP -> country/city/timezone/latitude/longitude.
- Track database metadata/version/update time.
- Expose whether the current lookup uses a current or stale database.

The GeoIP lookup occurs locally after the egress IP is known. It must not call an external geolocation API during normal profile launch.

## 11. GeoIP Updater

The desktop main process owns GeoLite2 updates.

Default behavior:

- Check at startup whether an update is due.
- Target update cadence: every 7 days.
- Download to a temporary file.
- Validate the downloaded archive/database before replacing the active database.
- Replace atomically.
- If update fails, retain the previous valid database and do not block browser startup.

MaxMind credentials are treated as secrets and stored using the same secure-storage boundary as other secrets. They are never exposed to renderer code or logs.

## 12. Proxy Authentication Runtime Extension

Chromium launch continues to use `--proxy-server` for routing.

A generated runtime extension is used only where browser-level proxy authentication is needed.

Responsibilities:

- Supply proxy credentials on authentication challenges.
- Be generated per profile launch from main-process data.
- Live under profile runtime/temp state, not shared application state.
- Be removed or replaced safely when no longer needed.
- Never expose credentials to the renderer.

The extension is loaded alongside user-assigned extensions. Runtime-generated and user-managed extensions remain logically separate.

## 13. WebRTC Policy

`webrtcEnabled` is interpreted as follows:

- `true`: normal WebRTC behavior allowed.
- `false`: protect against direct non-proxied UDP paths rather than disabling the WebRTC API entirely.

The runtime applies a Chromium policy/switch equivalent to `disable_non_proxied_udp` behavior where supported.

The intended observable property is that normal HTTP traffic and WebRTC must not reveal the machine's direct public IP when a proxy profile is configured.

## 14. Managed Chromium Only

Profiles launch only Chromium versions managed by ICRLogin.

Do not fall back to system Chrome or another installed browser executable.

If the selected version is not installed, BrowserVersionService automatically installs it. Existing single-flight behavior is retained so concurrent profile launches requesting the same version do not trigger duplicate downloads.

## 15. Browser Download Progress

Extend BrowserVersionService so `ensureInstalled()` can accept progress reporting rather than discarding it.

The install path should expose semantic phases such as:

```text
downloading
verifying
installing
```

Where byte counts are available, also expose percent/received/total.

ProfileLaunchCoordinator maps browser-install progress into the profile's launch-progress stream.

## 16. Runtime Environment Resolution

RuntimeEnvironmentResolver produces one immutable effective-environment object for the current launch.

Example shape:

```ts
interface EffectiveRuntimeEnvironment {
  publicIp: string | null;
  networkIdentityStale: boolean;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  language: string;
  userAgent: string | null;
  windowWidth: number;
  windowHeight: number;
  screenWidth: number;
  screenHeight: number;
  geolocationMode: 'allow' | 'ask' | 'block';
  protectWebRtc: boolean;
}
```

This object is runtime-only. It can be returned to diagnostics after secrets are removed.

## 17. CDP Environment Application

After Chromium launches and CDP is reachable, BrowserEnvironmentApplier applies the effective environment before the runtime is marked `running`.

Apply where supported:

- User agent override.
- Accept-Language / navigator language behavior.
- Timezone override.
- Device/screen metrics.
- Geolocation coordinates and accuracy.
- Geolocation permission behavior.
- Any runtime script/policy hooks required for consistent screen/language values.

Failure to apply a required override fails profile startup and triggers cleanup. Optional diagnostics may warn instead of failing only when the missing feature has an explicit fallback.

## 18. Geolocation Semantics

`geolocationMode` continues to mean browser permission behavior:

- allow
- ask
- block

Coordinates are independent profile/environment values.

When mode is `allow`, the runtime applies the resolved/manual coordinates and grants permission where possible.

When mode is `ask`, coordinates may be configured but the website must still request permission.

When mode is `block`, requests are denied regardless of stored coordinates.

## 19. Session Isolation

Each profile keeps its existing isolated directory:

```text
<profilesDir>/<profileId>/user-data
```

Chromium must always launch with that exact profile-specific user-data directory.

Closing Chromium must not delete it. Therefore cookies, localStorage, IndexedDB, cache, permissions, and login sessions survive browser restarts.

Different profiles must never share a user-data directory.

## 20. Runtime Files

Recommended profile runtime layout:

```text
profiles/<profileId>/
  user-data/
  runtime/
    profile.lock
    proxy-auth-extension/
```

Generated runtime secrets must not be placed in files that are included in profile backups unless explicitly encrypted and designed for that purpose.

The proxy-auth runtime extension should be regenerated from secure proxy credentials instead of being treated as persistent configuration.

## 21. Persistence and Migrations

A database migration adds the new profile environment columns and network identity cache table.

Migration requirements:

- Existing profiles remain valid.
- Existing profiles default to `environmentMode = 'auto'`.
- Existing timezone values are retained as fallback/manual-compatible values.
- New latitude/longitude/accuracy fields default to null.
- Migration must be covered by tests and continue using the existing pre-migration backup mechanism.

## 22. IPC and Preload Contract

Add typed, allowlisted IPC for:

- launch progress subscription
- safe effective-environment diagnostics
- GeoIP status
- GeoIP credential/update settings

No IPC method may expose:

- proxy password
- MaxMind license key
- raw safeStorage data
- unrestricted filesystem primitives
- process/shell execution

## 23. Renderer UX

Profile row behavior:

```text
Open
 -> Resolving network...
 -> GeoIP...
 -> Downloading 42%...
 -> Verifying...
 -> Installing...
 -> Preparing...
 -> Launching...
 -> Applying environment...
 -> Running
```

If cached network identity is used, show a non-blocking stale-data indicator.

Profile wizard gains:

- Auto environment from IP / Manual override selector.
- Latitude.
- Longitude.
- Accuracy.
- Existing timezone field remains editable in manual mode.
- Clear explanation that auto mode resolves environment from the actual public egress IP.

## 24. Error Model

Add distinct errors instead of collapsing runtime failures into a generic browser-start error where actionable detail exists.

Candidate categories:

```text
PROXY_CONNECTION_FAILED
EGRESS_IP_RESOLUTION_FAILED
GEOIP_DATABASE_MISSING
GEOIP_LOOKUP_FAILED
BROWSER_ENVIRONMENT_APPLY_FAILED
PROXY_AUTH_RUNTIME_FAILED
```

Renderer messages should be user-readable while logs preserve technical detail without secrets.

## 25. Cleanup and Transactional Startup

Profile startup is treated as a staged operation.

If any stage fails after Chromium is spawned:

1. Terminate the spawned process.
2. Remove runtime registration.
3. Remove runtime session persistence.
4. Remove the runtime lock.
5. Clean generated proxy-auth runtime artifacts.
6. Keep persistent profile `user-data` intact.
7. Preserve the original error for the caller.

Do not delete user browser state because a launch attempt failed.

## 26. Testing Strategy

### Unit tests

- Environment mode validation.
- Effective environment resolution.
- Auto vs manual override behavior.
- Cached/stale network identity fallback.
- GeoIP lookup mapping.
- Proxy runtime extension generation without renderer exposure.
- Launch progress transitions.
- BrowserVersionService progress propagation.
- WebRTC policy selection.

### Integration tests

Use controlled local fixtures where possible:

- Profile creation persists environment fields.
- Launch coordinator invokes stages in correct order.
- Missing managed browser triggers install before launch.
- Two launches for one Chromium version share a single install flight.
- Runtime environment is applied before runtime becomes running.
- Failure after spawn cleans process/runtime state but preserves profile data.
- Existing profile migrations remain valid.

### Real browser manual verification

On Windows development runtime:

- HTTP public IP matches configured proxy route.
- Authenticated proxy launches without Chromium auth dialog.
- Timezone matches auto-resolved value.
- Geolocation reports configured/effective coordinates.
- WebRTC does not expose direct public IP when protection is enabled.
- Browser state persists after close/open.
- Two profiles do not share cookies/session state.
- Missing Chromium automatically downloads and shows per-profile progress.
- Application restart reconciles a Chromium process left running.

## 27. Verification Gates

Before this sub-project is declared complete:

```powershell
npm run typecheck
npm run lint
npm test
npm run build -w @icrlogin/desktop
```

In addition, the real-browser manual verification list in section 26 must be exercised on Windows.

GitHub Actions status is not a substitute for local evidence if runners remain unavailable.

## 28. Implementation Boundaries

This sub-project should not introduce fingerprint randomization beyond what is required to faithfully apply current profile environment fields.

The next sub-project will add deterministic fingerprint generation based on a persistent seed and consistency model for Canvas/WebGL/Audio/hardware attributes.

## 29. Follow-up Sub-projects

After Real Runtime Environment is complete:

1. Deterministic Fingerprint Runtime.
2. Profile UX / Fingerprint Summary / Diagnostics.
3. Hardening, recovery, API parity, and final internal-use regression pass.

Those projects must build on the launch pipeline defined here rather than bypassing it.
