# ICRLogin

ICRLogin is a Windows-first, local-first Chromium profile manager and automation foundation.

Phase 1 currently provides the core profile/database/proxy/browser lifecycle, localhost CDP runtime management, restart reconciliation, and a hardened Electron shell. The full GPM-familiar desktop workflow is implemented in later phases.

## Development

Prerequisites: Windows 10/11 x64 for production smoke testing, Node.js 22+, and npm.

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run test:integration:chromium
npm run build -w @icrlogin/desktop
npm run dev -w @icrlogin/desktop
```

Developer details and Phase-1 limitations are documented in [`docs/development/phase-1-core.md`](docs/development/phase-1-core.md).

The approved design and implementation plans are under [`docs/superpowers/`](docs/superpowers/).
