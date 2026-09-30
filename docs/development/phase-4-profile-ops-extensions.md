# Phase 4 — Profile Operations, Tags, Templates, Bulk Actions, Extensions

Phase 4 extends the local-first ICRLogin Core/Desktop stack with reusable metadata and profile-management workflows while keeping the renderer behind the typed preload bridge.

## Added capabilities

- Tags with many-to-many profile assignment and batch projection for profile lists.
- Configuration clone with a clean Chromium `user-data` directory.
- Full clone with copied Chromium `user-data`, new UUID, staging/atomic promotion, rollback, stopped-state validation, and the same per-profile operation lock used by BrowserService.
- Profile templates containing configuration, tag IDs, and extension assignment IDs only. Templates never store Chromium session data, proxy passwords, API tokens, or internal extension paths.
- Local extension manager for unpacked folders and CRX2/CRX3 packages.
- Extension archive hardening: malformed CRX rejection, ZIP path normalization, absolute/`..`/NUL path rejection, symlink rejection, manifest validation, staging cleanup, post-copy unpacked re-scan, and canonical managed extension paths.
- Extension deletion uses staged filesystem removal: the managed directory is atomically renamed first, metadata is deleted second, a metadata failure restores the original directory, and successful metadata deletion commits the staged removal.
- Profile/group extension assignment and global enable/disable.
- Chromium launch integration through Core-resolved internal extension paths only; renderer input never becomes an arbitrary Chromium flag.
- Bounded bulk start queue with default concurrency `3` and accepted range `1..5`, ordered results, de-duplication, partial failures, and Retry failed support in the desktop UI.
- Bulk stop, group move, proxy assignment, tag add/remove, and soft delete.
- Desktop Profiles UI now includes tags, tag filtering/search, clone/template actions, multi-select bulk toolbar and partial-result dialog.
- Extensions page replaces the previous placeholder. Templates are available as a secondary Profiles view while the approved six primary navigation items remain unchanged.

## Database schema

Migration `003` adds:

- `tags`
- `profile_tags`
- `extensions`
- `profile_extensions`
- `group_extensions`
- `profile_templates`

Foreign keys and cascades apply to assignment metadata. Template references are validated before profile creation so stale group/proxy/tag/extension references fail with `INVALID_REQUEST` instead of silently creating broken references.

## Extension storage and launch boundary

Imported extensions are copied/extracted under the managed ICRLogin extensions directory. Core persists the internal source path, but public `ExtensionRecord`/IPC DTOs never expose it.

At launch, `ExtensionService.resolvePaths(profileId)` resolves the union of direct and group assignments, removes disabled entries and duplicates, and supplies the resulting internal directories to BrowserService. Chromium receives one `--load-extension=` argument only when the resolved set is non-empty.

Phase 4 does not add fingerprint spoofing, stealth extensions, CAPTCHA bypass, platform-detection bypass, arbitrary Chromium flags, or account-abuse automation.

## Runtime safety

- Full clone is serialized with BrowserService using the same `ProfileOperationLock` and re-checks `stopped` while holding the lock.
- Extension mutations use `ProfileMutationCoordinator`, which acquires the same shared profile operation locks used by browser start/stop and re-checks runtime state while the lock is held.
- Profile extension assignment/removal and template-applied extension sets require affected profiles to remain stopped through the mutation.
- Group extension changes lock all affected profiles in stable order before changing assignment metadata.
- Enable/disable/delete lock all profiles affected by the extension before mutation, preventing a browser-start TOCTOU race.
- Extension deletion stages filesystem removal before metadata deletion and rolls the filesystem rename back when metadata deletion fails.
- Bulk delete checks each profile runtime state in Core; a running profile fails that item without rolling back unrelated successes.

## Verification state

Fresh semantic checks performed during Phase 4 include:

- Phase-4 profile model RED→GREEN: tag filtering/search, mixed-state bulk action availability, failed-ID retry selection and stable clone/template labels.
- Template draft initialization RED→GREEN: template configuration seeds a create draft without replacing the requested profile name.
- Extension UI model RED→GREEN: internal path redaction, assignment counts and conservative running-profile mutation guard.
- Database migration focused gate on SQLite: migration order `[1,2,3]`, new tables, unique profile-tag assignment, and extension assignment foreign keys.
- Tag repository/service focused gate on SQLite: uniqueness, idempotent set/add/remove, delete cascade, unknown references and batch profile/tag projection.
- Clone/template focused filesystem gate: clean config clone, full user-data clone, rollback and stale-reference validation.
- Full-clone TOCTOU regression: source runtime state is re-checked while holding the shared profile lock, so a concurrent start prevents the clone before user-data copy.
- Extension mutation TOCTOU regression: extension mutations wait on the same profile lock as BrowserService and fail if the browser has become running before mutation begins.
- Extension importer/service semantic gate: unpacked and CRX header handling, unsafe path rejection, invalid manifest cleanup, post-copy symlink re-scan, assignments, dedupe and public DTO path redaction.
- Extension delete atomicity regression: metadata failure triggers filesystem rollback; metadata success commits staged removal only afterward.
- Bulk service semantic gate: bounded default concurrency, ordering, duplicate IDs, partial failures and per-item results.
- Fresh Chromium 144 smoke in the sandbox: a minimal unpacked extension launches with `--load-extension`, the remote-debugging endpoint returns a WebSocket debugger URL, and the Chromium process is cleaned up afterward.

Full workspace `npm install / typecheck / test / lint / build` is not claimed from the sandbox because outbound package installation is unavailable. The GitHub Actions run for current Phase-4 head `f47510c1c2f2b436264a0aad7d756671e70f7eba` failed before executing any job step (`runner_id=0`, `steps=[]`), so it provides no code/test result. A Windows 10/11 Electron application smoke remains a release gate before shipping.
