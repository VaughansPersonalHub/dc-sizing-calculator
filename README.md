# DC Sizing Calculator

SCConnect internal web tool for distribution-centre sizing, racking, labour,
MHE, and block-diagram layout, across Korea, Taiwan, Vietnam, Malaysia,
Singapore, and Indonesia. Live at **`calc.scconnect.co.nz`** behind Cloudflare
Access.

- [SPEC.md](./SPEC.md) — locked v3.0 design spec.
- [CLAUDE.md](./CLAUDE.md) — agent / developer conventions, build status.
- [docs/USAGE.md](./docs/USAGE.md) — happy-path walkthrough for first-time
  users.
- [docs/HOW-IT-WORKS.md](./docs/HOW-IT-WORKS.md) — engine internals in plain
  English.
- [docs/LIMITATIONS.md](./docs/LIMITATIONS.md) — consolidated list of what the
  engine does NOT model.
- [docs/SCRIPT.md](./docs/SCRIPT.md) — recorder-ready 7-10 min narration for a
  walkthrough video.

## Quick start

```bash
npm install
npm run dev       # http://localhost:5173
npm run build
npm test
```

## Status

The SPEC v3.0 build (Phases 0-9) shipped with all 187 tests passing and the
production deployment live at `calc.scconnect.co.nz`. Phase 10 (Trust /
Help / UX) is in progress — see [CLAUDE.md](./CLAUDE.md) for the latest gate
state and bundle metrics.

Press `?` anywhere in the running app to open the Help dialog (keyboard
cheatsheet, tab map, glossary, per-step explainers, ways it could be wrong,
sources & citations).
