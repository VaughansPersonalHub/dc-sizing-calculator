# DC Sizing Calculator — agent context

**Owner:** SCConnect (Vaughan)
**Spec:** [SPEC.md](./SPEC.md) — v3.0 locked single source of truth. Read it first.
**Target:** `calc.scconnect.co.nz` (Cloudflare Pages)
**Primary markets:** Korea, Taiwan, Vietnam, Malaysia, Singapore, Indonesia

## Build status

- Phase 0 (Foundation) — complete. Gate met: app mounts, tabs navigate, Dexie seeds 6 reference libraries on first load.
- Phase 0.5 (CI + Pages) — complete. GitHub Actions CI runs lint + build + tests on every push; `wrangler.toml` binds D1 + R2 to the Pages project.
- Phase 0.75 (Cloudflare backend) — live. Pages Functions API under `functions/api/*` with Access JWT verification, D1 migrations applied remote (`engagements` + `audit_log`), R2 blob GET/PUT with optimistic concurrency (ETag / If-Match), sync layer skeleton in `src/sync/`. `CF_ACCESS_AUD` set on Production + Preview; 401s come back correctly for unauthed/forged requests.
- Phase 1 (Reference Libraries) — editors live. Generic `LibraryTable` (TanStack v8, inline edit, add/delete, reset-to-seed, filter+sort) fronts six per-library column sets. Repository layer `src/db/repositories/*` is the only writer to Dexie; each upsert refreshes `data.store` which bumps `_libraryHash` and invalidates the engine cache.
- Phase 1.5 (Regional Defaults + Engagement Setup Wizard) — live. Dexie bumped to v2 with a new `opsProfiles` table keyed by engagementId; `.scc` envelope bumped to schemaVersion=2 (still accepts v1). Wizard walks name → region → flag review → create and writes the right defaults: MY/ID get halal + Surau + Ramadan; SG gets the 20 m SCDF cross-aisle; ID gets mandatory backup generator. EngagementsTab replaced with a real list that merges API + local-only rows.
- Next: Phase 2 SKU ingestion (PapaParse streaming, Float32Array, 20k in <3s).

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
    repositories/   Write-through wrappers for each library (upsert/delete/resetToSeed) — the UI calls these, not Dexie directly
  engine/           Pure-TS calc pipeline (Steps 0–14)
    steps/          Step01Profiling.ts … (to come)
    models/         Shared enums used by main + worker
    validators/     Step 0 ValidationLayer (to come)
  sync/             R2 push/pull (Phase 0.75)
  ui/
    tabs/           7 tabs (Engagements, Inputs, Reference, Design Rules, Scenarios, Outputs, Layout)
    components/     TabShell, Hydration skeleton, etc.
      library/      LibraryTable (generic TanStack v8 editor) + per-library editors under editors/
    layout-renderer/  D3 + SVG (Phase 5 / 7)
  libraries/        Seed data for the 6 reference libraries
  regional/         Per-region defaults for KR / TW / VN / MY / SG / ID
  schemas/          Zod schemas (validation at boundaries only)
  utils/            cn helper, id generator
workers/            engine.worker.ts / tornado.worker.ts / layout.worker.ts (browser Web Workers — do not confuse with Cloudflare Workers)
functions/          Cloudflare Pages Functions (server-side). Each .ts file here is a route.
  api/
    _middleware.ts         Access JWT guard on every /api/* request
    engagements/
      index.ts             GET list / POST create
      [id]/
        index.ts           GET meta / DELETE archive
        blob.ts            GET/PUT .scc with If-Match optimistic concurrency
        history.ts         list R2 history objects for engagement
        restore.ts         copy a history blob back to current.scc
  utils/                   access.ts (JWT + JWKS), audit.ts, engagement.ts, env.ts, response.ts
migrations/         D1 SQL migrations, applied via `wrangler d1 migrations apply`
tests/              Vitest (tests/engine, tests/integration) + Playwright (tests/e2e)
```

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server on :5173 (proxies `/api` → wrangler :8788) |
| `npm run build` | Type-check (app + workers + functions) + Vite production build |
| `npm test` | Vitest smoke + integration suite |
| `npm run test:watch` | Vitest in watch mode |
| `npm run e2e` | Playwright (starts dev server) |
| `npm run lint` | ESLint |
| `npx wrangler pages dev dist` | Local Pages runtime with Functions (use after `npm run build`) |
| `npx wrangler d1 migrations apply scconnect-dc-sizing-meta` | Apply D1 schema |
| `npx wrangler d1 migrations apply scconnect-dc-sizing-meta --local` | Apply D1 schema to local miniflare DB |

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

## Phase 0.75 gate — verified

- [x] `wrangler.toml` binds D1 `scconnect-dc-sizing-meta` + R2 `scconnect-dc-sizing`
- [x] D1 migration `migrations/0001_init.sql` applied to remote (APAC SIN)
- [x] Pages Functions verify Access JWT (RS256, JWKS cache) and write audit_log rows
- [x] R2 GET/PUT with If-Match etag concurrency; history mirror + restore wired
- [x] Sync layer skeleton (`src/sync/*`) round-trips .scc via fflate, Float32Array preserved
- [x] `CF_ACCESS_AUD` set on Production + Preview
- [x] `/api/engagements` → 401 `missing_access_jwt` unauthed · 401 `unknown_kid` forged
- [x] Login at calc.scconnect.co.nz hydrates behind Access

## Phase 1 gate — verified

- [x] All 6 libraries have editable TanStack grids under Reference tab
- [x] Inline edit persists through `src/db/repositories/*` → Dexie bulkPut
- [x] Add row / delete row / reset-to-seed per library
- [x] `data.store` library hash bumps on every edit → engine cache invalidates
- [x] `npm run build` + `npm run lint` + `npm test` (17/17) all green (489 KB / 150 KB gz)

## Phase 1.5 gate — verified

- [x] Dexie v2 adds `opsProfiles` table; `.scc` envelope v2 round-trips it and still reads v1
- [x] `buildDefaultOpsProfile(region)` + `regionalFeatureFlags(region)` drive the wizard
- [x] MY / ID → halal, Surau, Ramadan (30 days × 0.82); SG → 20 m cross-aisle; ID → backup gen
- [x] EngagementsTab lists API engagements + local-only fallback when API unreachable
- [x] `npm run build` + `npm run lint` + `npm test` (24/24) all green (544 KB / 167 KB gz)

## What not to do

- Don't introduce a backend server. The architecture is Cloudflare-only.
- Don't add a ORM, Prisma, or a SQL schema beyond D1's two tables.
- Don't add Redux, React Context for global state, or a 7th store. Six stores is the target; scopes are fixed.
- Don't add React Server Components. This is a SPA.
- Don't enable React 18 compat mode — we're on 19.
- Don't invent new regional profiles outside KR/TW/VN/MY/SG/ID without a scope-change decision from Vaughan.
