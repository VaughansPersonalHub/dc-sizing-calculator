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
- Phase 2 (SKU Ingestion) — live. PapaParse streams CSV in 1 MiB chunks, each row goes through Zod + a Float32Array builder for the 52-week demand curve, then batches write through the new `src/ingestion/sku-repo.ts`. Perf: 20k rows parse + validate + Float32-build in ~520 ms (6× under the 3 s budget).
- Phase 3 (Engine Core, Steps 0–6) — live. Pure-TS pipeline with mandatory gates 4.5 (clear height) and 4.6 (seismic mass) runs in a Web Worker via transferable Float32Array. Step 0 ValidationLayer ships every SPEC §7 code + auto-fix helpers. Pipeline runs 5 000 SKUs end-to-end in ~36 ms (SPEC budget 50 ms). UI trigger lives on the Scenarios tab — happy path renders feasibility + per-step summary cards.
- Phase 2.5 (Data Quality Dashboard) — live. Surfaces Step 0 output (stats + per-code breakdown), exposes the four SPEC auto-fixes (clamp negatives, suppress zero-demand, cap CV, normalise channel mix), and gates the engine "Run" button behind an explicit Acknowledge. Acknowledgement is hash-locked to the current SKU set + halal flag — any CSV import or auto-fix application invalidates it.
- Phase 4 (Engine Steps 7–11) — live. Step 7 labour applies the seven SPEC travel models (sqrt_area / sequential_hv / shuttle_cycle / crane_cycle / g2p_port / amr_fleet / zero), the availability factor method (NOT multiplicative summing), and Ramadan annual derate for MY/ID. Step 8 fleet sizes MHE per battery chemistry (lithium opportunity / lead-acid swap / fuel cell). Step 9 sizes inbound + outbound doors from blended container mix and bimodal staging (fast cross-dock vs QC/decant). Step 10 rolls up support areas including Surau (15m²/50 muslim staff + 6m² ablution), customs (bonded engagements only), halal uplift factor, ante-chamber, lithium kVA buffer. Step 11 totals operational + officeAndAmenities + canopy and runs four feasibility gates (clearHeight, seismic, slab UDL, envelope fit). Scenarios tab surfaces all 11 steps end-to-end.
- Phase 5 (Layout Feasibility) — live. Pure-TS rectangle solver in `src/ui/layout-renderer/solver.ts` packs Step 5 storage zones (largest-first), the Step 9 dock strip + doors (south wall, inbound left / outbound right), and the Step 10 support cluster (east strip) against the building envelope. Overflow is detected per-rect and as a Step 11.overEnvelope mirror. Layout tab renders the result via D3 scales + React SVG with role-coloured fills, hatched-overflow overlay, layer toggles (storage / staging / docks / support / labels / scale / north), legend, and fit-status banner.
- Phase 6 (Automation + Scenarios + Tornado) — live. Step 12 sizes the alternative automated storage path for AutoStore / Exotec / Geek+ / HAI / Quicktron / pallet shuttle (single + mother-child) / mini-load ASRS / pallet AGV / Libiao sorter; per-system density, robot count, port count, throughput capacity, kVA. Step 11 substitutes the conventional storage zones for the automated footprint + front-end induction area when AutomationConfig is supplied — GFA / siteArea / footprintGfa all reflect the swap, with `conventionalRackedM2` + `automationSavingsM2` exposed for side-by-side comparison. ScenarioRunner distributes work across a 4-worker pool (default), tagging each result with feasibility. Step 14 tornado generator emits 17 SPEC params × {low, high} = 34 variants, runs them in the pool, ranks by weighted delta (footprint + FTE), 30+ variants in <1.5s SPEC budget. Scenarios tab gains an automation system picker, "Run tornado" button + horizontal-bar tornado chart with footprint/FTE metric toggle and hatched-infeasibility overlay.
- Next: Phase 7 Visio-grade SVG layout (Step 13) — polygon envelopes, 11-layer toggling, flow arrows, fire egress, SVG export.

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
    pipeline.ts     Orchestrator — runs Steps 0..12 in order, returns full result envelope
    runner.ts       Main-thread façade — reads Dexie + stores, posts to worker
    inputsBuilder.ts  Shared engagement→PipelineInputs helper (used by runner + tornadoRunner)
    scenarioRunner.ts  4-worker pool that distributes ScenarioOverrides
    tornado.ts      Step 14: 17 SPEC params × {low, high} = 34 variants
    tornadoRunner.ts  Main-thread façade for the tornado
    workerClient.ts Spawns the engine Worker, transfers Float32 demand
    protocol.ts     Worker message shapes (run / progress / result / error)
    steps/          Step01..Step12 (Profiling, ForwardGrowth, SlotSizing, Bays incl. 4.5/4.6, Footprint, Throughput, Labour, MheFleet, DockSchedule, SupportAreas, FootprintRollup, Automation)
    models/         Shared engine types (EngineSku, EngineOpsProfile, EnginePallet, EngineRackSystem, EngineBuildingEnvelope, EngineMheClass, EngineProductivityCell, EngineRegionalContext, EngineAutomationSystem, EngineAutomationConfig) — kept Zod-free for the worker
    validators/     Step0ValidationLayer.ts — runValidationLayer + applyAutoFixes
  ingestion/        CSV → validated SkuRecord → Dexie. PapaParse + Zod + Float32Array.
  sync/             R2 push/pull (Phase 0.75)
  ui/
    tabs/           7 tabs (Engagements, Inputs, Reference, Design Rules, Scenarios, Outputs, Layout)
    components/     TabShell, Hydration skeleton, etc.
      library/      LibraryTable (generic TanStack v8 editor) + per-library editors under editors/
    layout-renderer/  Phase 5: simple rectangle solver (solver.ts, types.ts) +
                      D3/React SVG (SimpleLayoutSvg.tsx, useLayoutResult.ts).
                      Phase 7 swaps in polygons, flow arrows, fire egress.
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

## Phase 2 gate — verified

- [x] CSV upload UI with drag-drop, progress, error summary in InputsTab
- [x] PapaParse chunked streaming; per-row Zod + Float32Array 52-week build
- [x] SKU rows scoped by engagementId via `src/ingestion/sku-repo.ts` (bulkPut on each batch)
- [x] Perf: 20 000 rows in ~520 ms (SPEC budget is 3 s) — vitest integration test
- [x] `npm run build` + `npm run lint` + `npm test` (26/26) all green (607 KB / 185 KB gz)
- [ ] 500 KB bundle warning: will code-split in Phase 9 polish — no blocker for functional gate

## Phase 3 gate — verified

- [x] Step 0 ValidationLayer: every SPEC §7 code + applyAutoFixes (4 actions)
- [x] Steps 1–6 implemented as pure functions; pipeline.ts composes them
- [x] Step 4.5 clear-height + Step 4.6 seismic-mass mandatory gates emit feasibility flags
- [x] Web Worker runs the pipeline; Float32Array demand transferred (zero-copy)
- [x] `runEngineForEngagement(engagementId)` reads Dexie, packs payload, posts to worker
- [x] Scenarios tab "Run engine" button surfaces feasibility + per-step summary cards
- [x] 5 000 SKUs end-to-end in ~36 ms (SPEC §14 budget is 50 ms — within budget)
- [x] 43 new engine tests; 69/69 total passing; bundle 617 KB raw / 188 KB gz

## Phase 2.5 gate — verified

- [x] Data Quality Dashboard renders Step 0 stats + per-code counts beneath the Inputs upload
- [x] Four auto-fix toggles (clamp negatives / suppress zero / cap CV / normalise channel mix)
  call applyAutoFixes through the existing repository so Dexie + data.store stay in sync
- [x] Acknowledgement hash-locked to (SKU set + halal flag); CSV import or fix-apply drops it
- [x] Scenarios "Run engine" button disabled + warning banner until validation acknowledged
- [x] 5 new tests on the acknowledge state machine; 74/74 total passing (633 KB / 193 KB gz)

## Phase 4 gate — verified

- [x] Step 7 Labour: seven travel models, availability factor method, Ramadan derate, batch multiplier, WALKING_PICK_IN_LARGE_ZONE warning
- [x] Step 8 MHE Fleet: per-battery available hours (AMR 22h×7d×50w / lithium / lead-acid swap penalty / fuel cell), utilisation target, charging footprint + kVA roll-up, VNA routing override
- [x] Step 9 Dock Schedule: blended container mix (40HC pal/floor, 20ft pal/floor, curtain, cross-dock, van), bimodal staging, percentileDocks
- [x] Step 10 Support Areas: office, Surau (≥40 muslim trigger), customs (bonded), VAS, returns, QC, DG, pack bench, empty pallet, waste, ante-chamber, lithium kVA buffer, halal uplift factor
- [x] Step 11 Footprint Roll-up: operational × (1 + halal), canopy in-coverage rule (columned vs cantilever > exempt), siteArea = siteCoverage / maxSiteCoverage, soft-space split, four feasibility gates {slab, seismic, envelope, clearHeight}
- [x] Pipeline pass-through: productivity library, MHE library, regional context (Surau / Ramadan / officeM2/FTE), isBonded flag
- [x] Scenarios tab surfaces Steps 7–11 alongside existing Steps 0–6 cards
- [x] 37 new engine tests (Step 7+8: 10, Step 9+10: 16, Step 11: 11); 111/111 total passing
- [x] `npm run build` + `npm run lint` (1 pre-existing warning) green; bundle 639 KB / 195 KB gz

## Phase 5 gate — verified

- [x] Pure-TS rectangle solver in `src/ui/layout-renderer/solver.ts` packs Step 5 zones, Step 9 doors, Step 10 support cluster against the building envelope
- [x] Engine envelope grows {lengthM, widthM} so the solver knows the container shape
- [x] LayoutTab renders the result via D3 scales + React SVG: envelope outline, role-coloured rects, south-wall doors (inbound/outbound), compass + scale bar + legend
- [x] Fit-check banner reflects Step 11.overEnvelope + per-rect overflow; hatched red overlay on overflowing rects
- [x] Layer toggles wired to `useLayoutViewStore` (storage / staging / docks / support / labels / scale / north)
- [x] Solver runs in < 10 ms for 200-SKU engagements
- [x] 6 new tests (placement, overflow, doors, support strip, empty zones, perf); 117/117 total passing
- [x] `npm run build` + `npm run lint` green; bundle 669 KB / 206 KB gz (+30 KB for d3-scale)

## Phase 6 gate — verified

- [x] Step 12 Automation Override: 10 systems supported (AutoStore / Exotec / Geek+ / HAI HaiPick / Quicktron / pallet shuttle single+mother-child / mini-load ASRS / pallet AGV / Libiao sorter), per-system density math, robot+port count sizing, throughput-meets-peak gate
- [x] Pipeline accepts optional `automationConfig` + `automationLibrary`; emits step12 output alongside step1-11
- [x] ScenarioRunner: 4-worker pool (clamped to ≤ overrides.length), FIFO queue distribution, failures captured separately, applyOverride pure
- [x] Step 14 Tornado: 17 SPEC params curated, 34 variants, ranking by weightedDelta (default 0.5/0.5)
- [x] inputsBuilder.ts extracts shared engagement→PipelineInputs logic used by both runners
- [x] Scenarios tab "Run tornado" button + horizontal bar chart with footprint/FTE toggle and hatched-infeasibility overlay
- [x] 24 new tests (Step 12: 10 incl. Step 11 swap, scenarioRunner: 7, tornado: 7); 141/141 total passing
- [x] 30 variants in < 1.5s (SPEC §13 Phase 6 gate); fake-worker harness for tests
- [x] Automation swap: Step 11 substitutes conventional zones for automated footprint when AutomationConfig present; GFA reflects savings
- [x] Scenarios tab automation picker drives engagement-level Step 12 selection
- [x] `npm run build` + `npm run lint` green; bundle 684 KB / 210 KB gz

## What not to do

- Don't introduce a backend server. The architecture is Cloudflare-only.
- Don't add a ORM, Prisma, or a SQL schema beyond D1's two tables.
- Don't add Redux, React Context for global state, or a 7th store. Six stores is the target; scopes are fixed.
- Don't add React Server Components. This is a SPA.
- Don't enable React 18 compat mode — we're on 19.
- Don't invent new regional profiles outside KR/TW/VN/MY/SG/ID without a scope-change decision from Vaughan.
