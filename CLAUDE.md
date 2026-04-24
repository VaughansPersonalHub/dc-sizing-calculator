# DC Sizing Calculator — agent context

**Owner:** SCConnect (Vaughan)
**Spec:** [SPEC.md](./SPEC.md) — v3.0 locked single source of truth. Read it first.
**Target:** `calc.scconnect.co.nz` (Cloudflare Pages)
**Primary markets:** Korea, Taiwan, Vietnam, Malaysia, Singapore, Indonesia

## Build status

- Phase 0 (Foundation) — complete. Gate met: app mounts, tabs navigate, Dexie seeds 6 reference libraries on first load.
- Next: Phase 0.5 CI, then Phase 0.75 Cloudflare backend (Access + Workers + R2 + D1), then Phase 1+.

## Architecture (don't re-relitigate)

- Cloudflare Pages + Access + R2 + D1. **Zero custom servers.**
- Calc engine runs in Web Workers client-side. Engagement blobs (`.scc`) sync to R2 with ETag optimistic concurrency.
- Dexie is the local cache; R2 is the shared source of truth; D1 holds the engagement index + audit log.
- Chinese automation vendors (Geek+, HAI, Quicktron, Libiao) are first-class, not afterthoughts.

## Layout

```
src/
  app/              Hydration guard + root App
  stores/           6 Zustand stores (ui / engagement / data / engine / scenario / layout-view)
  db/               Dexie v1 schema (11 tables) + seed routine
  engine/           Pure-TS calc pipeline (Steps 0–14)
    steps/          Step01Profiling.ts … (to come)
    models/         Shared enums used by main + worker
    validators/     Step 0 ValidationLayer (to come)
  sync/             R2 push/pull (Phase 0.75)
  ui/
    tabs/           7 tabs (Engagements, Inputs, Reference, Design Rules, Scenarios, Outputs, Layout)
    components/     TabShell, Hydration skeleton, etc.
    layout-renderer/  D3 + SVG (Phase 5 / 7)
  libraries/        Seed data for the 6 reference libraries
  regional/         Per-region defaults for KR / TW / VN / MY / SG / ID
  schemas/          Zod schemas (validation at boundaries only)
  utils/            cn helper, id generator
workers/            engine.worker.ts / tornado.worker.ts / layout.worker.ts
tests/              Vitest (tests/engine, tests/integration) + Playwright (tests/e2e)
```

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server on :5173 |
| `npm run build` | Type-check + Vite production build |
| `npm test` | Vitest smoke suite |
| `npm run test:watch` | Vitest in watch mode |
| `npm run e2e` | Playwright (starts dev server) |
| `npm run lint` | ESLint |

## Conventions that matter

1. **Zod validates at boundaries.** CSV import, worker protocol decode, .scc load — yes. Inside the engine — no; use TS types.
2. **Demand data is `Float32Array`.** Half the memory of `number[]`, and transferable across worker boundaries with zero copy.
3. **No engine state in Zustand.** `engine.store` holds status + results only. Inputs live in `data.store` + `scenario.store`. Invalidate via `_inputHash` bump.
4. **Seeds are idempotent.** `seedReferenceLibrariesIfEmpty()` only writes when tables are empty, so user edits survive HMR.
5. **verbatimModuleSyntax + erasableSyntaxOnly** are on. Use `import type` for type-only imports. No enums, no namespaces, no parameter properties.
6. **Don't create random new files.** The spec prescribes the layout. If you add a new folder, update this file.
7. **Regional logic is data, not code.** Add a column to `REGIONAL_PROFILES` rather than a branch in the engine.

## Tech stack (locked; don't swap without asking)

React 19 · TypeScript 6 · Vite 8 · Tailwind 3.4 · Zustand 5 (Immer) · Dexie 4 · TanStack Table 8 · D3 7 · Recharts 3 · PapaParse 5 · SheetJS · @react-pdf/renderer · fflate · Zod 4 · Lucide · Vitest · Playwright · pptxgenjs.

Note — scaffold delivered React 19 / TS 6 / Vite 8 / Zustand 5 / Zod 4 (newer than the numbers written in SPEC v3.0). Behaviour is compatible; do not downgrade.

## Phase 0 gate — verified

- [x] `npm run build` passes (416 KB / 131 KB gz)
- [x] `npm test` — 12/12 smoke tests pass
- [x] App shell mounts, all 7 tabs navigate
- [x] Dexie schema v1 opens; seeds 6 reference libraries on first load
- [x] HydrationSkeleton / StorageUnavailableBanner / HydrationErrorBanner handle failure modes
- [x] Web Worker protocol + transferable Float32Array round-trip works

## What not to do

- Don't introduce a backend server. The architecture is Cloudflare-only.
- Don't add a ORM, Prisma, or a SQL schema beyond D1's two tables.
- Don't add Redux, React Context for global state, or a 7th store. Six stores is the target; scopes are fixed.
- Don't add React Server Components. This is a SPA.
- Don't enable React 18 compat mode — we're on 19.
- Don't invent new regional profiles outside KR/TW/VN/MY/SG/ID without a scope-change decision from Vaughan.
