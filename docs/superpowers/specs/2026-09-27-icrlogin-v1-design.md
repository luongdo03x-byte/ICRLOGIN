# ICRLogin V1 Design Specification

## Purpose

ICRLogin is a Windows 10/11 x64, local-first Chromium profile manager for legitimate browser isolation, QA, and automation. It should provide a workflow familiar to GPMLogin users while using original ICRLogin branding and implementation. V1 deliberately excludes fingerprint fabrication or mechanisms intended to bypass platform detection.

## Product scope

V1 manages local Chromium profiles, proxies, browser versions, groups/tags, extensions, backup/restore, logs, settings, local automation APIs, process monitoring, installer/update flows, and recovery. Data is local by default. Cloud sync, multi-user server operation, macOS/Linux, Firefox, public remote API exposure, and anti-detection fingerprint spoofing are out of scope.

## Architecture

Use Electron + React + TypeScript + Node.js + SQLite. The renderer is a thin UI that talks to a main-process Core through typed IPC. Core owns database access, files, secrets, Chromium processes, proxy configuration, browser artifacts, local API, and runtime reconciliation. Core interfaces remain UI-independent so future clients can reuse them.

## Local data layout

Default root is `%LOCALAPPDATA%\\ICRLogin` with `data/icrlogin.db`, `profiles/<uuid>/user-data`, `browsers/<version>`, `extensions`, `backups`, `downloads/temp`, `logs`, `trash`, and `config`. Chromium user-data remains filesystem-backed; SQLite stores metadata and references. Operations that combine database and filesystem work use staging directories and atomic promotion where possible.

## Profiles

Each profile has a UUID, name, optional group, pinned Chromium version, optional proxy, deterministic environment settings, startup URLs, timestamps, and a distinct Chromium user-data directory. A profile may have at most one running browser instance. New profiles default to the latest supported stable Chromium but may select another supported version. Existing profiles never silently change browser version.

Environment settings supported in V1 are user-agent, language, timezone, window size, screen resolution, WebRTC on/off, geolocation permission, and startup URLs. They are deterministic configuration, not randomized hardware identity fabrication.

## Proxy system

V1 supports HTTP, HTTPS, and SOCKS5 proxies with optional username/password authentication. Proxy secrets are encrypted with a Windows-protected secret adapter (Electron safeStorage/DPAPI-backed implementation) and must never appear in renderer payloads, process command lines, or logs. Profiles reference proxy records rather than embedding credentials.

## Managed Chromium

ICRLogin downloads and manages Chromium itself rather than relying on system Chrome. Browser artifacts come from a manifest abstraction that supplies version, Win64 URL, SHA-256, and size. Installations download to staging, verify SHA-256, validate archive paths, extract to staging, verify executable presence, and atomically promote. Failed installs never become installed records. Cached manifests and already-installed browsers continue to support offline profile launches.

## Browser lifecycle

Lifecycle states include STOPPED, QUEUED, STARTING, RUNNING, STOPPING, CRASHED/ERROR. Starting validates profile and proxy, ensures the pinned browser, allocates a localhost debugging port, builds safe launch arguments, spawns Chromium, waits for CDP readiness, applies runtime environment settings, records runtime state, and opens startup URLs. Failed startup cleans the child process, port, locks, and runtime record. Stop requests graceful browser shutdown first, then terminates the exact process tree after timeout if required.

Runtime state tracks profile ID, root PID, Chromium version/path, user-data path, debugging port, start time, and status. Reconciliation after ICRLogin restart validates PID/command-line identity and CDP before reattaching; stale sessions/locks are cleared safely.

## Automation

A local API binds only to `127.0.0.1`, with configurable port (default 9495) and optional bearer token. It exposes typed profile/proxy/browser/process operations and returns stable typed error codes. Starting a profile returns PID, remote debugging port, CDP HTTP URL, and browser WebSocket debugger URL so Playwright, Puppeteer, or Selenium can attach. No LAN/public bind is supported in V1. Renderer IPC is explicitly allowlisted and never exposes generic filesystem, shell, process, database, or secret primitives.

## Desktop UI

Use a dark sidebar and light primary workspace with original ICRLogin branding. Main navigation: Profiles, Groups, Proxy, Browser Manager, Extensions, Settings. Profiles table supports status, group, browser version, proxy, user-agent, last-used time, actions, search/filter/sort, multi-select, clone, import/export, backup, and trash. Create Profile uses a wizard: General → Proxy → Browser Environment → Startup URLs → Review.

## Groups, tags, extensions, and bulk operations

Profiles belong to at most one group in V1 and may have multiple tags. Deleting a group moves profiles to Ungrouped. Extension manager supports local unpacked/package sources and profile/group assignment. Bulk start uses a bounded queue (default three concurrent starts); bulk operations report partial success/failure rather than rolling back unrelated successes.

## Storage, backup, and recovery

SQLite uses ordered transactional migrations, foreign keys, WAL where appropriate, indexes, and integrity checks. Full profile backup is allowed only when stopped and stores a versioned manifest, profile metadata, browser user-data, and extension assignment but not Chromium binaries. Restore validates checksums/compatibility, extracts to staging, and assigns a new UUID on collision. Soft delete moves profile data to trash; permanent deletion is separate.

Startup performs database integrity checks, stale temp cleanup, runtime reconciliation, and lock cleanup. Corruption does not trigger destructive automatic reset; the UI offers recovery/restore paths.

## Process management and Windows integration

ICRLogin monitors running Chromium instances and aggregates CPU/RAM by instance at a low-frequency interval. Start operations are queued; profile operations use per-profile locks. The application is single-instance, supports system tray behavior and optional launch-with-Windows, and does not automatically restart crashed profiles by default. Closing behavior is user-configurable and must not kill active profiles unexpectedly.

## Installer and updates

Package Windows x64 with Electron Builder + NSIS. Chromium is not bundled in the installer. App version, API version, DB schema version, and backup format version evolve independently. Production releases should be code-signed. App update and Chromium update lifecycles are separate; updates are verified and must not force-kill running profiles.

## Testing and quality

All behavior-bearing implementation follows TDD. Maintain unit tests for services and state machines, filesystem/SQLite integration tests, API contract tests, real-Chromium smoke tests, Electron desktop smoke tests, migration fixtures, crash/recovery tests, and backup/restore tests. Release gates include typecheck, lint, unit/integration tests, API tests, desktop smoke, packaging smoke, installer, migration, and backup/restore verification.

Target scale for V1 is roughly 50 profiles with 5–10 running browsers. Core queries/search should feel immediate at this scale; long-running copy/download/archive work must stream or run off the Electron event loop.

## Security requirements

Electron uses `contextIsolation: true`, `nodeIntegration: false`, and sandboxing where compatible. Use a strict CSP, Zod validation on shared boundaries, canonical path checks, zip-slip prevention, argument arrays rather than shell command concatenation, log redaction, localhost-only CDP/API listeners, and encrypted secret storage. Arbitrary Chromium flags and arbitrary shell/file primitives are out of scope for V1.

## V1 completion criteria

A fresh Windows install can launch ICRLogin, download and verify a supported Chromium, create a persistent isolated profile, configure deterministic environment options and HTTP/HTTPS/SOCKS5 proxy, start the pinned Chromium, attach via CDP/Playwright, stop/restart/reconcile safely, manage profiles/groups/tags/extensions, backup/restore, and update ICRLogin without losing profile data.
