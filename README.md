# DC Sizing Calculator

SCConnect internal web tool for distribution-centre sizing, racking, labour, MHE, and
block-diagram layout, across Korea, Taiwan, Vietnam, Malaysia, Singapore, and Indonesia.

See [SPEC.md](./SPEC.md) for the locked v3.0 design spec and [CLAUDE.md](./CLAUDE.md) for
agent / developer conventions.

## Quick start

```bash
npm install
npm run dev       # http://localhost:5173
npm run build
npm test
```

## Phase 0 status

- App mounts and hydrates from IndexedDB.
- 6 reference libraries (racks, MHE, productivity, buildings, pallets, automation) seed on first load.
- 6 regional profiles (KR / TW / VN / MY / SG / ID) wired for wizard use in Phase 1.5.
- 7 navigable tabs (placeholder content — Phase 1+ replaces each).
- Web Worker protocol + transferable `Float32Array` demand buffer round-trips end-to-end.
- Build: **416 KB / 131 KB gzipped**. Tests: **12 / 12 passing**.
