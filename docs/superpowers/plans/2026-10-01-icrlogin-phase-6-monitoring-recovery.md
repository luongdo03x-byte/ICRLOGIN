# ICRLogin Phase 6 Monitoring & Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add redacted structured logs, low-frequency CPU/RAM monitoring for managed Chromium instances, startup integrity/temp recovery, and a typed desktop monitoring surface.

**Architecture:** Core owns log formatting/redaction, process metric aggregation and recovery orchestration behind injectable interfaces. Windows-specific metric collection stays in the Electron main process and uses `execFile` argument arrays; renderer only receives sanitized DTOs through explicit IPC.

**Tech Stack:** TypeScript, Node.js, SQLite/better-sqlite3, Electron, React, Vitest, Zod.

**Spec:** `docs/superpowers/specs/2026-09-27-icrlogin-v1-design.md`

## Global Constraints
- Windows 10/11 x64 V1; local-first only.
- Monitoring interval is low-frequency; default 5 seconds.
- Never log proxy passwords, bearer tokens, encrypted secrets, user-data paths or executable paths.
- Renderer gets no generic process/filesystem/database primitives.
- Corruption must not trigger destructive automatic reset.

## Review Focus
- Metrics reader failure must produce unavailable metrics without crashing the app.
- PID reuse/stale runtime entries must not be attributed without registry/reconciler ownership.
- Log redaction must handle nested objects and authorization/cookie/password-like keys.
- Startup integrity failure must preserve the existing database and surface recovery state.
- Temp cleanup must only touch managed staging prefixes under ICRLogin roots.

---

### Task 1: Structured redacted logger
**Files:** Create `packages/core/src/logging/redaction.ts`, `packages/core/src/logging/logger.ts`; Test `packages/core/tests/logger.test.ts`; Modify core exports.
**Interfaces:** Produce `StructuredLogger` with `info/warn/error(event, fields?)` and recursive `redactForLog(value)`.
- [ ] Write failing redaction/logger tests covering secrets, nested fields and bounded serialization.
- [ ] Run focused test RED.
- [ ] Implement JSONL logger with timestamp/level/event and safe fields.
- [ ] Run focused test GREEN.
- [ ] Commit `feat: add redacted structured logging`.

### Task 2: Runtime process metrics core
**Files:** Create `packages/core/src/monitoring/process-monitor.ts`; Test `packages/core/tests/process-monitor.test.ts`.
**Interfaces:** Consume registry runtimes and `ProcessMetricsReader.read(pid)`; produce `ProcessMetricSnapshot[]` with profileId/pid/cpuPercent/workingSetBytes/sampleAt/status.
- [ ] Write failing aggregation tests including reader failure and disappeared PID.
- [ ] Run RED.
- [ ] Implement one-shot `sample()` and polling start/stop with default 5000 ms.
- [ ] Run GREEN.
- [ ] Commit `feat: add managed process monitoring`.

### Task 3: Windows metric reader
**Files:** Create `apps/desktop/src/main/windows-process-metrics.ts`; Test `apps/desktop/tests/windows-process-metrics.test.ts`.
**Interfaces:** `WindowsProcessMetricsReader.read(pid)` uses PowerShell/CIM through `execFile` and returns CPU time + working set needed for delta CPU calculation, or null.
- [ ] Write parser/argument tests.
- [ ] Run RED.
- [ ] Implement safe PID validation and JSON parsing.
- [ ] Run GREEN.
- [ ] Commit `feat: add windows process metrics reader`.

### Task 4: Startup integrity and managed temp recovery
**Files:** Create `packages/core/src/recovery/startup-recovery.ts`; Test `packages/core/tests/startup-recovery.test.ts`; Modify database/recovery wiring.
**Interfaces:** `StartupRecoveryService.run()` executes `PRAGMA quick_check`, removes only `.staging-*`, `.restore-*`, `.purging-*`, browser/download temp prefixes, and returns a typed recovery report. Integrity failure returns `databaseHealthy:false` and never deletes/recreates DB.
- [ ] Write failing integrity and path-boundary tests.
- [ ] Run RED.
- [ ] Implement recovery report/cleanup.
- [ ] Run GREEN.
- [ ] Commit `feat: add startup integrity recovery`.

### Task 5: Typed IPC + monitoring UI
**Files:** Create shared Phase-6 DTO/channel module; modify app service graph/main/preload/window types/client; create `MonitoringPage.tsx`; tests for IPC/preload/renderer model.
**Interfaces:** Expose `monitoring.snapshot()` and `monitoring.recoveryStatus()` only; Settings/Recovery surface shows CPU/RAM per managed runtime and startup health.
- [ ] Write failing bridge/model tests.
- [ ] Run RED.
- [ ] Wire monitor/recovery services and sanitized DTOs.
- [ ] Add UI with unavailable/error states, no internal paths.
- [ ] Run focused tests.
- [ ] Commit `feat: expose monitoring and recovery ui`.

### Task 6: Integration/docs/review
**Files:** Create monitoring/recovery integration test and `docs/development/phase-6-monitoring-recovery.md`; update README.
- [ ] Add integration test for live registry aggregation and corrupt-DB non-destructive report fixture.
- [ ] Run full gate: typecheck, tests, lint, desktop build, Chromium integration; record runner blocker if no step executes.
- [ ] Whole-branch review and fix Critical/Important findings.
- [ ] Commit `docs: complete phase 6 monitoring recovery`.
