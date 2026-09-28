# ICRLogin

ICRLogin is a Windows-first, local-first Chromium profile manager and automation foundation.

Phase 1 provides the core profile/database/proxy/browser lifecycle, localhost CDP runtime management, restart reconciliation, and hardened Electron foundation. Phase 2 adds the usable desktop workflow for Profiles, Groups, Proxy Manager and Browser Manager through a typed allowlisted IPC bridge. Extensions and Settings remain explicit later-phase placeholders.

## Development

Prerequisites: Windows 10/11 x64 for production smoke testing, Node.js 22+, and npm.

```powershell
npm install
npm run lint
npm run typecheck
npm test
npm run test:integration:chromium
npm run build -w @icrlogin/desktop
npm run dev -w @icrlogin/desktop
```

Developer details are documented in [`docs/development/phase-1-core.md`](docs/development/phase-1-core.md) and [`docs/development/phase-2-desktop-ui.md`](docs/development/phase-2-desktop-ui.md).

The approved design and implementation plans are under [`docs/superpowers/`](docs/superpowers/).
