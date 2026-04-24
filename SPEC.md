# DC Sizing Calculator — Design Specification v3.0

**Status:** Locked. Build starts on Vaughan sign-off.
**Supersedes:** v1.0, v2.0, and all in-chat spec fragments.
**Prepared by:** SCConnect / Claude (world-leading DC designer + software architect hats both on)
**Date:** 23 April 2026

---

## 0. Document purpose

This is the single-source-of-truth spec for the DC Sizing Calculator. It folds in:
- Original v1.0 and v2.0 specs
- Reviewer feedback1 (external critique, all accepted)
- Vaughan's feedback1 (block diagram fidelity, clear height check, aisle orientation, productivity per-engagement)
- Reviewer feedback2 (my item-by-item critical evaluation, 6 rejections)
- MD file tech spec (evaluated; 85% accepted with corrections)
- MA1–MA6 Asian market additions (halal, Chinese vendors, shift patterns, Ramadan, tiered mezzanine, cold-chain ante-chamber)
- Architecture decision (Cloudflare Pages + Access + R2 + D1)
- Primary markets locked: Korea, Taiwan, Vietnam, Malaysia, Singapore, Indonesia

After this sign-off there are no more spec documents — just code.

---

## 1. Executive summary

A web application for SCConnect's internal use that models distribution centre sizing, racking, labour, MHE, and layout from SKU input data across current and future scenarios. Deployed on Cloudflare infrastructure, accessed by the SCConnect team (currently Vaughan + collaborators), engagement-scoped, with multi-user shared access. The calc engine runs in the browser for performance; engagement data syncs to Cloudflare R2 for multi-user sharing. No backend servers to maintain.

Target primary markets: Korea, Taiwan, Vietnam, Malaysia, Singapore, Indonesia. Engine includes seismic, halal, monsoon/flood, typhoon, Ramadan, and shift-pattern logic appropriate to each.

Build estimate: ~26 sessions, phased across 10 stages with gates.

---

## 2. Architecture

### 2.1 System architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ USER BROWSER                                                    │
│                                                                 │
│   React 18 SPA (Vite build)                                     │
│   ├── Zustand (6 stores, Immer middleware)                      │
│   ├── Dexie (IndexedDB, local cache of active engagement)       │
│   ├── Web Workers (calc engine, pool of 4)                      │
│   ├── D3 + React SVG (block diagram)                            │
│   ├── Recharts (tornado, scenario compare)                      │
│   └── SyncLayer (R2 push/pull, optimistic concurrency)          │
│                                                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS + Cloudflare Access JWT
                             │
┌────────────────────────────┴────────────────────────────────────┐
│ CLOUDFLARE                                                      │
│                                                                 │
│   Pages         — hosts the SPA at calc.scconnect.co.nz         │
│   Access        — zero-trust SSO (Google/Microsoft)             │
│   R2 bucket     — engagement .scc blobs (compressed)            │
│   D1 (SQLite)   — engagement index, lock state, audit log       │
│   Workers       — R2/D1 API endpoints, auth verification        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Why this architecture

- **Cloudflare Pages + Access + R2 + D1 is infrastructure, not custom servers.** Zero Express, zero Postgres, zero containers to maintain. Vaughan already runs Cloudflare for scconnect.co.nz; adding this is a 15-minute setup.
- **R2 stores engagement blobs** (≤10 MB compressed each). Free tier covers 10 GB, unlimited requests. SCConnect's entire engagement history fits comfortably.
- **D1 stores metadata** (engagement list, last-modified, locks, audit). SQLite-compatible, 100k rows free.
- **Cloudflare Access is SSO** — you allowlist people by email domain or individual, they log in with Google/Microsoft/etc. No password management.
- **Performance stays browser-side.** Calc engine runs locally in Web Workers. 20k SKUs process in <150 ms. No server round-trip for calculations.
- **Multi-user via optimistic concurrency.** ETag-based conflict detection on save. Concurrent edits show a merge dialog.
- **Offline works.** Dexie is primary store while working. Sync queue replays on reconnection.

### 2.3 User flow

1. User navigates to `calc.scconnect.co.nz`.
2. Cloudflare Access redirects to SSO; user authenticates.
3. SPA lists user's accessible engagements from D1 via Workers API.
4. User opens engagement → SPA pulls `<engagement_id>.scc` from R2.
5. .scc blob is decompressed, Dexie hydrated, Zustand populated.
6. User works at full local performance.
7. On save: Dexie serialised to .scc, compressed, pushed to R2 with `If-Match: <etag>`.
8. On etag mismatch: merge dialog with "take theirs / keep mine / side-by-side diff".
9. On engagement close or tab close: auto-save.

### 2.4 Failure modes

| Failure | Behaviour |
|---|---|
| IndexedDB blocked (incognito, corporate policy) | Banner: "Storage unavailable — session-only mode." All work lives in memory, lost on close. |
| R2 reachable but write fails | Queue for retry. Notify user. Local Dexie preserves work. |
| R2 unreachable (offline) | Full offline operation. Sync on reconnection. |
| Cloudflare Access token expired mid-session | Transparent refresh; on failure, re-auth prompt without data loss. |
| Concurrent edit conflict | Merge dialog: "X saved at HH:MM. Take theirs / keep mine / side-by-side diff." |
| Corrupted .scc on load | Fail safe to last known good; alert user; suggest manual restore. |

---

## 3. Tech stack

| Concern | Technology | Notes |
|---|---|---|
| Framework | React 18 + TypeScript 5.3+ | StrictMode enabled |
| Bundler | Vite 5.x | Tree-shaking, asset compression |
| Styling | Tailwind CSS 3.4+ + shadcn/ui | Consistent design system |
| UI state | Zustand 4.5+ with Immer | 6 stores, see §4.3 |
| Local persistence | Dexie 4.x | IndexedDB wrapper |
| Shared persistence | Cloudflare R2 + D1 via Workers | Engagement-scoped |
| Auth | Cloudflare Access | SSO, allowlist |
| Calc engine | Web Workers, pool of 4 | Transferable Float32Array |
| Data grids | TanStack Table v8 | Inline editing |
| Diagrams | D3 7.x + React SVG | Double-stage architecture (§5.6) |
| Charts | Recharts 2.x | Tornado, scenario compare |
| CSV parsing | PapaParse 5.x | Streaming |
| Excel export | SheetJS (xlsx) 0.20+ | Multi-sheet |
| PDF export | react-pdf 3.x | Client reports |
| Snapshot compression | fflate 0.8+ | Gzip for .scc and blob |
| Validation | Zod 3.x | Runtime boundary checks |
| Icons | Lucide React | shadcn-compatible |
| Testing | Vitest + Playwright | Engine unit + UI smoke |
| CI/CD | GitHub Actions → Cloudflare Pages | Preview per branch |

---

## 4. Frontend architecture

### 4.1 Project structure

```
/src
  /app               # Vite entry, router, App shell
  /stores            # Zustand stores (6)
  /db                # Dexie schema + repository layer
  /engine            # Calc pipeline (pure TS, workers)
    /steps           # Step01...Step14 functions
    /models          # TravelModel, SlotType, VelocityBucket enums
    /validators      # Step 0 ValidationLayer
  /sync              # R2 push/pull, conflict resolution
  /ui
    /tabs            # Inputs, Reference, DesignRules, Scenarios, Outputs, Layout
    /components      # Shared components (shadcn + custom)
    /layout-renderer # D3 layout engine, SVG generation
  /libraries         # Seed data for 6 reference libraries
  /regional          # Regional defaults (KR, TW, VN, MY, SG, ID)
  /schemas           # Zod schemas
  /utils             # General utilities
/workers
  /engine.worker.ts  # Main calc engine
  /tornado.worker.ts # Tornado variant runner
  /layout.worker.ts  # Block diagram layout
/tests
  /engine            # Canonical input/output pairs per step
  /integration       # End-to-end scenarios
```

### 4.2 Application shell (Hydration Guard pattern)

`App.tsx` blocks on a `useHydration()` hook. The TabShell and router do not mount until:

1. Dexie schema check passes (migrations run if version mismatch)
2. Cloudflare Access token validated
3. Baseline or last-opened engagement loaded into Zustand
4. All six reference libraries are populated (seed if empty)

While hydrating: skeleton loader. On failure: "Storage Unavailable" banner with fallback to in-memory session.

### 4.3 Zustand stores (six, not five)

See spec for full TypeScript interfaces of the six stores:
1. `ui.store.ts` — volatile chrome (activeTab, toasts, darkMode)
2. `engagement.store.ts` — multi-engagement scoping (activeEngagementId, syncStatus, regionProfile)
3. `data.store.ts` — persistent reference data (6 libraries, SKU count, library hash)
4. `scenario.store.ts` — active scenario config (scenarios, opsProfile, forwardDrivers, automationConfig, tornadoParams)
5. `engine.store.ts` — engine lifecycle (status, progress, lastResult, cache)
6. `layout-view.store.ts` — viewport for block diagram (zoom, pan, visibleLayers, flowPattern)

Cross-store subscriptions: `data.store` and `scenario.store` invalidate `engine.store._inputHash`. `engagement.store` resets `data.store.skuCount` and `scenario.store` when active engagement changes.

### 4.4 UI: six tabs

1. **Engagements** — list, switch, create, delete. Shows sync status.
2. **Inputs** — SKU CSV upload, Data Quality Dashboard, Ops Profile, Forward Drivers
3. **Reference** — all 6 libraries, TanStack editor per library
4. **Design Rules** — sigma, percentiles, soft-space, grid efficiency, aisle orientation per zone, system selection
5. **Scenarios** — baseline + variants, tornado parameter selector, run button
6. **Outputs** — Schedule of Areas, BOM, FTE, dock schedule, tornado chart, scenario compare, export panel
7. **Layout** — block diagram renderer (lazy; on-demand per scenario)

Engagement Setup Wizard runs on engagement creation. See §9.

---

## 5. Data model

### 5.1 Dexie schema (local cache)

Tables: engagements, skus, racks, mhe, productivity, buildings, pallets, automation, scenarios, resultsCache, appMeta. Version 1. Indexes as per spec with `[engagementId+id]` compound keys on SKUs.

### 5.2 R2 storage layout

```
scconnect-dc-sizing/
├── engagements/
│   ├── <engagement_id>/
│   │   ├── current.scc        # compressed latest snapshot
│   │   ├── history/*.scc      # auto-pruned >30 days or >50 versions
│   │   └── manifest.json      # metadata, schema version, last modifier
└── shared/libraries/          # team-wide reference data overrides
```

### 5.3 D1 schema (engagement index)

Two tables: `engagements` (id, name, client_name, region_profile, created_at/by, last_modified_at/by, etag, lock_holder, status, sku_count, scenario_count) and `audit_log` (engagement_id, user_email, action, timestamp, details JSON). Indexes on region, modified timestamp, and engagement audit.

### 5.4 SkuRecord

TypeScript interface with:
- id, engagementId (scoping), name, category, subCategory
- `weeklyUnits: Float32Array` (52 weeks), weeksOnFile
- Physical: unitCubeCm3, unitWeightKg, caseQty
- Palletisation: inboundPalletId, outboundPalletId, palletTi, palletHi, stackable
- Classification: tempClass, dgClass, halalStatus
- channelMix {retailB2bPct, ecomDtcPct, marketplacePct}
- isEventDrivenSeasonal + seasonalEventTag
- Optional overrides: slotTypeOverride, velocityOverride
- Validation: validationStatus, validationIssues
- Profile (denormalized from engine Step 1)

### 5.5 Storage budget

Per-engagement R2 blob ceiling: 10 MB. Soft warning at 20k SKUs with 52-week demand; hard warning at 40k SKUs. Typical 20k SKUs: ~5 MB compressed via fflate.

---

## 6. Regional profiles

### 6.1 Setup wizard

On creating a new engagement, user selects region. Wizard pre-populates Ops Profile, Building Library defaults, and flags Asian-specific features to enable. User can override any default.

### 6.2 Regional defaults table

| Parameter | Korea | Taiwan | Vietnam | Malaysia | Singapore | Indonesia |
|---|---|---|---|---|---|---|
| Primary inbound pallet | T11 | T11 | 1200×1000 | T11 | T11 | 1200×1000 |
| Primary outbound pallet | T11 | T11 | T11 | T11 | T11 | T11 |
| Mixed pallet common | No | Yes | Yes | Low | Medium | Yes |
| Seismic design category | C | **D** | B | A-B | A | **D-E** |
| Seismic soil class default | B (stiff) | C | D (soft, delta) | B | B | D (soft) |
| Cross-aisle spacing (m) | 22 | 22 | 22 | 22 | **20** (SCDF) | 22 |
| Cross-aisle width (m) | 2.4 | 2.4 | 2.4 | 2.4 | 2.4 | 2.4 |
| Typhoon design wind (km/h) | 180 | **250** | **220** (central) | 130 | 130 | 140 |
| Flood plinth height (m) | 0.3 | 0.4 | **0.6–1.0** | 0.5 | 0.3 | **0.6–1.0** |
| Monsoon drainage (mm/hr) | 80 | 130 | **150** | 120 | 100 | **150** |
| Office density (m²/FTE) | 9 | 9 | 10 | 10 | **7** | 10 |
| Halal certification | No | No | No | **Yes (JAKIM)** | Partial | **Yes (MUI)** |
| Surau / prayer room | No | No | No | **Yes, mandated ≥40 Muslim staff** | Optional | **Yes, mandated ≥40 Muslim staff** |
| Ramadan derate window | — | — | — | **30 days, 0.82x** | Partial | **30 days, 0.82x** |
| Shift pattern default | 2×8h, 5.5d | 2×8h, 5.5d | 2×10h, 6d | 2×10h, 6d | 2–3×8h, 6d rotating | 2×10h, 6d |
| Public holidays/yr | 15 | 11 | 11 | 14 | 11 | 16 |
| Cold-chain ante-chamber | Optional | Optional | **Required** | **Required** | Required | **Required** |
| Dehumidification allowance | 2% op area | 3% | **5%** | **5%** | 4% | **5%** |
| Customs/bonded DC common | Medium | Low | **High** | High | **High** (FTZ) | High (KPBPB) |
| Tiered mezzanine common | Yes (2-tier) | Yes | Low | Low | **Yes (3-tier)** | Low |
| Grid reliability (hrs/day) | 24 | 24 | 22 | 24 | 24 | 22 |
| Backup generator default | Yes | Yes | **Yes, mandatory** | Yes | Yes | **Yes, mandatory** |

### 6.3 Region-specific logic triggers

**Korea** — Standard seismic calc (Cat C), no halal logic, 5.5-day week.

**Taiwan** — High-seismic derating (Cat D) may cap rack height; typhoon cladding (Cat 3 equiv); seismic mass check gates rack levels.

**Vietnam** — Monsoon drainage + plinth affects site grading; mixed pallet (inbound 1200×1000, outbound T11) triggers repack allowance; soft soil D reduces rack height ceiling; bonded zone allowance if flagged (3–5% op area).

**Malaysia** — Halal zone duplication (~15% uplift); Surau 15 m² per 50 Muslim staff (default 70% Muslim workforce); Ramadan 0.82x for 30 days in FTE sizing; JAKIM-compliant dock separation flag.

**Singapore** — Cross-aisle 20 m (SCDF mandate >6m high-piled); office 7 m²/FTE (tightest); high tiered-mezzanine likelihood; typical FTZ bonded flag.

**Indonesia** — Very high seismic Cat D-E (rack height constraint); soft soil common (further derate); halal (MUI) identical to MY; Surau + Ramadan active; monsoon + flooding active; backup generator mandatory (~22 hr/day reliability).

---

## 7. Engine Validation Layer (Step 0)

Runs before any calc step. Blocks division-by-zero, impossible configs, negative inventory.

ValidationResult = { fatalErrors, warnings, suppressedSkus, stats }.

ValidationCodes: ZERO_DEMAND, NEGATIVE_DEMAND, ZERO_CASE_QTY, IMPOSSIBLE_PALLET_CONFIG, PALLET_WEIGHT_EXCEEDS_RACK, INBOUND_OUTBOUND_MISMATCH, MISSING_CHANNEL_MIX, CV_OUTLIER, UNIT_CUBE_IMPOSSIBLE, MISSING_HALAL_STATUS, PARTIAL_HISTORY, SEASONAL_TAG_MISSING.

UI: Data Quality Dashboard on Inputs tab. Auto-fix actions: suppress zero-demand, cap CV at 3.0, auto-classify halal from category, pad partial-history with category median. User must acknowledge before engine runs.

---

## 8. Calculation Pipeline (Steps 1–14)

All pure TS functions. Web Worker with transferable Float32Array buffers.

### Step 1 — SKU Profiling & Omnichannel Decomposition

Per-SKU: mu, sigma, cv, seasonalityIndex, peakWeek84/95/99, cubeVelocityCm3PerDay, linesPerDay. Channel decomposition into retailB2b/ecomDtc/marketplace volumes. Pick profile derived from channel mix + opsProfile. Velocity bucket via Pareto (default A:20/B:30/C:30/D:20) on lines/day. Confidence flag if weeksOnFile<26. Category stats for new-SKU projection filter out isEventDrivenSeasonal.

### Step 2 — Forward Growth

**Gross new SKUs + lagged discontinuations**, NOT net delta. Yearly plans from fyStart to fyDesign. Grown existing SKUs use growthFactor = (1+LFL[cat][year]) × storeCount[year]/storeCount[0]. Gross new SKUs sampled from category median with non-seasonal CV baseline. Discontinuations still occupy slots during discontinuationLagMonths. DSOH shift applied by velocity tier, not category. Engine sizes to peak year.

### Step 3 — Slot Sizing (Mixed Pallet, Forward/Reserve Split, Weight Check)

Per SKU, branch by slotType (PFP/CLS/Shelf):

- **PFP**: slot dims driven by inbound pallet; unitsPerOutboundPallet drives inventory pallets; forward-face DSOH by velocity tier; reserve = peakInventoryPallets − forwardPositions; total positions split honeycombing (vhc × hhc). **Corrected** weight check: totalOnBeamPair = slotsPerBay × weightPerPallet compared to maxLoadPerBeamPairKg (not divided). Plus singleSlotOverload check.
- **CLS**: lane depth from case dims not fixed case count; casesNeededInLane = peakWeeklyCases × replenCycle / 7; laneDepthMm = casesNeededInLane × caseDepthMm / clsLaneFillFactor; select variant by depth; lanes with honeycombing.
- **Shelf**: pickFaceCube = peakWeek84 × unitCubeCm3 × dsohDays / 7; allocate small/medium/large shelf slots by SKU cube and category.

Repack time added if inboundPalletId ≠ outboundPalletId.

### Step 4 — Aggregate to Bays

Group by slot type. rawBays = ceil(totalSlots / slotsPerBay). **alignedBays = roundUpToBlock(rawBays, system.structuralBayBlock)** — system-specific block, not global.

### Step 4.5 — Clear Height Violation Check (MANDATORY GATE)

palletHeight = inboundPallet.heightMm + assignedLoadHeightMm.
levelsRequired = ceil(alignedBays / baysPerRow / levelsDefault).
requiredRackHeightMm = bottomBeamClearance + levels×(palletHeight+beamThickness) + sprinklerClearance.
If > usableRackHeight: engine emits violation with shortfallLevels AND both options (footprintExpansion OR mezzanineOption with slab load required).

### Step 4.6 — Seismic Mass Check

totalRackMassKg summed across zones including avgPalletWeight + rackMassPerPosition.
seismicMassT = totalRackMassKg × seismicCoefficient / 1000.
allowableMassT = slabLoading × floorArea × allowableRatio.
If exceeded: maxSafeLevels computed; recommendation to reduce height or upgrade slab/anchorage.

### Step 5 — Footprint per Zone

bayWidth = bay.widthMm + flueSpace.transverseMm. aisleWidth = max(mhe.aisleWidthMmMin, sys.aisle.widthMmDefault). baysPerRow from opsProfile preference or sqrt(alignedBays).

**Aisle orientation**: matches_flow | perpendicular_to_flow | auto_optimize.

VNA transfer aisle OR end-of-aisle turnaround, **NOT both** (bug fix).
Cross-aisles from **ops profile** (bug fix from hardcoded 25m). crossAisles = floor(zoneWidthRaw / crossAisleSpacingMm).

auto_optimize tries horizontal and vertical orientation, picks lower total travel weighted by activity.

Column grid alignment: zoneAligned = ceil(raw/grid)×grid. gridEfficiency = rawArea / alignedArea. If < threshold, suggest alternate bay counts.

### Step 6 — Throughput

Inbound sized by inbound pallet; outbound by outbound pallet. Repack labour adder where standards differ. Peak σ pooling with correlation coefficient (0.3 mixed FMCG, 0.6 seasonal grocery, 0.7 fashion). Container decant palletisation yield factor (default 0.88). Mode-specific calcs for cross-dock, VAS, returns, QC hold.

### Step 7 — Labour with Mode-Specific Travel Models

TravelModelType: sqrt_area | sequential_hv | shuttle_cycle | crane_cycle | g2p_port | amr_fleet | zero.

Per-task travel time branches by model:
- **sqrt_area** (Dunbar/Moodie): coefficient × 18 × sqrt(zoneArea/baselineZoneArea).
- **sequential_hv** (VNA Chebyshev-aware): aisleLen/travelSpeed + liftHeight/liftSpeed.
- **shuttle_cycle**: 2×depth/shuttleSpeed + transferSec.
- **crane_cycle** (mini-load ASRS): hSec + vSec + pickDepositSec.
- **g2p_port** (AutoStore/Exotec): portWalkDistance / 1.2 m/s.
- **amr_fleet**: avgTaskDistance / (agvSpeed × (1 − min(0.35, 0.006×fleetSize))).
- **zero**: automation eliminates travel.

totalTimePerUnit = staticTime + travel + repackAdder. Rate = 3600/totalTime. Batch multiplier = min(2.5, 1 + 0.18×(batchSize−1)^0.85).

baseFte = volume / (rate × productiveHoursPerDay).
**Availability factor method** (NOT multiplicative stacking): availability = (1−absent)(1−leave)(1−sick). peakFte = baseFte × peakUplift / availability.

Regional: MY/ID apply Ramadan ~8% annual impact (30 days × 0.18 deficit).

MHE warning: sqrt_area + zoneArea>15000 = WALKING_PICK_IN_LARGE_ZONE.

### Step 8 — MHE Fleet

Per class: totalTaskHours summed.

availableHoursPerUnit:
- AMR lithium_opportunity: 22hr × 7d × 50wk
- Lithium opportunity MHE: productiveHours × operatingDays
- Lead-acid swap: shiftHours − 15min×shiftsPerDay penalty, × operatingDays

fleetCount = ceil(totalTaskHours / (availableHoursPerUnit × utilisationTarget)).

### Step 9 — Dock Schedule

Door cycle times: 40HC palletised 25min, 40HC floor-loaded 60min, 20ft pal 18min, 20ft floor 45min, curtain-sider 30min, cross-dock pallet 12min, van 8min. Staging bimodal: fast cross-dock 0.5h, QC/decant 4h. Blended by category mix.

### Step 10 — Support Areas

Battery area branches by chemistry. Office = (adminFte+supervisorFte) × regionalOfficeM2PerFte. Surau mandated MY/ID ≥40 Muslim staff: 15m² per 50 Muslim + 6m² ablution. Customs (if bonded): inboundVolume × customsHoldPct. VAS = benches×12+20. Returns, QC, DG cage per opsProfile. **Halal uplift 15%** when engagement.halalCertifiedRequired. Temperature zones with ante-chamber for tropical. Pack bench, empty pallet, waste. Lithium kVA buffer.

### Step 11 — Footprint Roll-up & Structural Checks

operational = Σ zoneArea + VAS + returns + QC + DG + packBench + emptyPallet + battery + customs + tempZones.
operational ×= (1 + halalUpliftFactor).

officeAndAmenities = office + Surau + amenities + training + firstAid.

canopyArea = operational × canopyAllowancePct.

**buildingFootprintGfa = operational + officeAndAmenities** (canopy separate).

Canopy in coverage if columned OR cantilever>exemptMaxM. siteCoverageArea = buildingFootprintGfa + (canopyCountedInCoverage ? canopyArea : 0). siteArea = siteCoverageArea / maxSiteCoverage.

Soft space split: phase2HorizontalM2 + phase2VerticalM2 (separate %).

Structural gates: staticSlabUdl > slabLoading = slabFailure. seismicFailure from Step 4.6. envelope fit if buildingLibRef: overEnvelope + envelopeShortfallM2.

feasibilityFlags: {slab, seismic, envelope, clearHeight}. infeasible = any FAIL.

### Step 12 — Automation Override (Density-Based)

Systems (first-class Chinese vendors):
- AutoStore grid (G2P cubic, 9×stackHeight×0.85 bins/m², 500 cycles/hr/robot)
- Exotec Skypod (150 compartments/m², 25/hr/robot)
- **Geek+ P-series** (140 compartments/m², 20/hr/robot)
- **HAI Robotics HaiPick ACR** (180 cases/m², 300 cases/hr/robot)
- **Quicktron multi-tier** (120 cases/m², 250/hr/robot)
- Pallet shuttle single-deep (15–25 pal/m², 50 cycles/hr/aisle)
- Pallet shuttle mother-child (30–45 pal/m², 40 cycles/hr/aisle)
- Mini-load ASRS (60–80 totes/m², 100 cycles/hr/aisle)
- Pallet AGV Kiva-class (40 trips/hr/AGV)
- **Libiao cross-belt sorter** (15,000 parcels/hr)

AutomationConfig: system, stackHeight, cellsPerM2 override, shuttlesPerAisle, channelDepth, portsManual, robotsManual, sizeToThroughputTarget, packingEfficiency (0.82 CPG / 0.65 softlines), motherChildMode, frontEndDepthM.

### Step 13 — Layout Generation (Visio-grade)

On-demand when Layout tab viewed. NOT in tornado loop.

- Polygon envelope support (not just rectangles)
- Per-zone aisle orientation
- Flexible dock placement (click wall segments)
- 11 toggleable layers (grid, storage, staging, docks, support, flow, fire egress, pedestrian, labels, scale, north)
- SVG + PNG export
- Infeasibility overlay (hatched + shortfall annotation)

### Step 14 — Scenario Engine & Tornado

Run scenarios in 4-worker pool. Tornado = 17 curated params × {low, high}. Feasibility filter separates feasible from infeasible. Ranked by weighted delta: wFootprint×|ΔFootprint| + wFte×|ΔFte| (default 0.5/0.5).

**17 tornado params**: peak factor ±20%, DSOH global ±20%, productivity ±15%, absenteeism+leave ±25%, softSpace 10/20/30%, storeCount ±15%, LFL ±2pp/yr, net SKU delta ±20%, floor-load share ±10pp, channel DTC ±10pp, forward/reserve velocity cutoff, HHC ±5pp, pick method (voice↔RF), automation on/off, grid efficiency threshold, max rack height ±20%, clear height.

---

## 9. Reference libraries (v3.0 schemas)

### 9.1 Rack library

Per system: system_id, name, category, supplier_refs (including Chinese: Nanjing Inform, HAI Racking), bay (widthMm, depthMm, heightMmDefault, heightMmRange), slotsPerBay, levelsDefault, load (perLevelKg, maxLoadPerBeamPairKg, maxSinglePalletKg), aisle (widthMmMin, widthMmDefault, crossAisleMm), flueSpace (transverseMm, longitudinalMm), bottomBeamClearanceMm, beamThicknessMm, minPresentationPallets, honeycombing (verticalFactor, horizontalDefault), fillFactor, slotVolumeM3, slotTypeCompat, storageType, densityRating, seismic (designCategory, soilClassRating, importanceLevel, anchorageRequired, bracingPattern), structuralBayBlock, rackMassKgPerPosition, costPerPalletPositionUsd, notes.

**Seed (20 systems)**: selective single-deep T11/1200×1000, selective double-deep, push-back 3/5-deep, drive-in 4/8-deep, **drive-through** (FIFO ASEAN), pallet flow gravity, VNA selective 1650/1800, CLS SK2/SK3/SK4, longspan, bin shelving, mobile, multi-tier mezzanine, **cantilever**, **tyre rack**, AutoStore, Exotec, HAI HaiPick ACR, pallet shuttle (single+mother-child), mini-load ASRS, radio shuttle (aliased to pallet_shuttle with multi-supplier refs).

### 9.2 MHE library

Per class: mhe_id, name, category, aisleWidthMmMin/Default, aisleTransferWidthMm, endOfAisleTurnaroundMm, liftHeightMmMax, travelSpeedKph, liftSpeedMpm, ratePerTaskPerHour (putawayPallet, replenPallet, retrievePallet), battery {type, chargingFootprintM2PerUnit, swapStationM2, chargingKva}, utilisationTargetDefault, usefulLifeYears, operatorCertification, notes.

**Seed (13 classes)**: walkie pallet, CB 2.5t 4-wheel, **CB 2.5t 3-wheel** (ASEAN), **stand-on stacker** (JP/KR), reach single, reach double-deep, VNA turret, man-up order picker, **medium-level order picker** (multi-tier mezz), LLOP, tugger/train, AMR (Locus/Fetch/Geek+ P), AGV pallet (Quicktron/Geek+ M).

### 9.3 Productivity matrix

ProductivityCell: method, unitType, slotType, staticTimeSecPerUnit, travelModelType, travelCoefficient, baselineZoneAreaM2, derivedRateAtBaseline, rateRange {low_p25, median, high_p75}, densityAssumption, source, wercPercentileReference, confidence (heuristic|validated|engagement_calibrated), engagementOverrides {engagement_id: {rate, notes}}.

**Per-engagement overrides supported** — global WERC baseline untouched when engagement tunes values.

### 9.4 Building library

Per template: building_id, name, regionProfile, envelope (lengthM, widthM, totalFootprintM2, polygonVertices, obstacles), site (totalSiteM2, maxBuildingCoveragePct, minYardM2), clearHeights (eavesM, apexM, sprinklerClearanceM, usableRackM), columnGrid (spacingXM, spacingYM, columnWidthMm, pattern), floor (slabLoadingTPerM2, flatnessClass, jointPattern, drainageSlopePct, totalFloorAreaM2), seismic (designCategory, soilClass, importanceLevel, allowableRatio), typhoon (designWindSpeedKmh, claddingRating, roofAnchorageEnhanced), monsoon (plinthHeightM, floodReturnPeriodYears, drainageCapacityMmPerHr), fire (sprinklerClass, inRackSprinklers, egressTravelDistanceMaxM, compartmentMaxM2), docks, mezzanine (tiers, perTierSlabLoadKgPerM2, perTierClearHeightM, perTierMaxM2, goodsLiftCapacityKg, goodsLiftCount), office, power (gridReliabilityHoursPerDay, backupGeneratorKva, backupAutonomyHrs, upsForWmsKva), coldChain (chilledZoneM2/setpointC, frozenZoneM2/setpointC, antechamberRequired/M2, airlockRequired, dehumidificationAllowancePct, insulationPanelMm), customsBonded (required, holdAreaPct, fencedCageM2, dedicatedDockLane).

### 9.5 Pallet library

Per standard: pallet_id, name, region[], dimensionsMm {length, width, height}, maxLoadKg, emptyWeightKg, typicalCubeM3, fitsContainer40ftHc, fitsContainer20ft, isoReference.

Seed: T11 (default Korea, Japan, ASEAN), 1200×1000 (China primary, Vietnam partial), Euro 1200×800 (rare Asia), GMA 1200×1000 (legacy), half-pallet.

### 9.6 Automation library

Per §8 Step 12. Density model, supplier refs (Chinese vendors first-class), throughput formula.

---

## 10. Ops Profile

Full schema per spec with: engagementId, regionProfile, operatingDaysPerYear (300), shiftsPerDay (2), hoursPerShift (10), breakAllowanceMinutesPerDay (40), productivityFactor (0.82), absenteeismPct (0.08), leaveFraction (0.12), sickReliefPct (0.05), peakUplift (1.35), sigmaStorage (1.0), percentileDocks (0.95), percentileStaging (0.95), horizontalHoneycombingFactor (0.88), gridEfficiencyThreshold (0.88), preferredAspectRatio (1.6), skuPeakCorrelationCoefficient (0.3), floorloadPalletisationYield (0.88), dsohDays (14), forwardFaceDsohDays {A:1.0, B:2.5, C:0, D:0}, discontinuationLagMonths (3), dsohChangeByVelocity, paretoBreakpoints {A:0.20, B:0.50, C:0.80, D:1.00}, replenTriggerDays (0.5), clsLaneFillFactor (0.90), crossAisleSpacingM (22), crossAisleWidthM (2.4), canopyAllowancePct (0.11), canopyType (cantilever), canopyOverhangM (1.2), canopyCoverageExemptMaxM (1.2), maxSiteCoverage (0.55), phase2HorizontalPct (0.20), phase2VerticalPct (0.10), softSpacePct (0.20), clearHeightMm (12500), ordersPerBatch (5), repackSecPerPallet (90), adminFte (5), supervisorFte (4), totalStaff (85), vasBenches (4), returnsRatePct (2), returnsHandleTimeHours (0.3), qcSampleRate (0.10), qcDwellHours (8), avgDgSkuFootprintM2 (0.5), dgMultiplier (2.5), palletFootprintM2 (1.44), packerThroughput (60), tornadoWeights {footprint: 0.5, fte: 0.5}.

---

## 11. Sync layer (R2 + D1)

openEngagement(id): pull manifest from D1, pull .scc from R2, decompress, hydrate Dexie transactionally, update Zustand.

saveEngagement(): serialize active engagement, compress with fflate, PUT to R2 with If-Match: etag. On conflict: set syncStatus='conflict', show merge dialog.

Auto-save debounced 30s after last edit. History snapshots every 10 saves or manual checkpoint.

Worker endpoints (Cloudflare Workers, all gated by Access JWT):
- GET /engagements
- GET /engagements/:id
- GET /engagements/:id/blob
- PUT /engagements/:id/blob (If-Match header)
- POST /engagements
- DELETE /engagements/:id
- GET /engagements/:id/history
- POST /engagements/:id/restore

---

## 12. Export formats

- Schedule of Areas: multi-sheet Excel via SheetJS
- Block diagram SVG: native serializer (Illustrator/Inkscape editable)
- Block diagram PNG: html2canvas at 300 DPI
- Summary report PDF: react-pdf with assumptions log, key metrics, tornado, side-by-side scenarios
- Tornado PPT: pptxgenjs
- .scc snapshot: fflate+JSON (full engagement archive, rehydrates in app)
- Assumptions CSV: flat CSV of all ops profile + scenario variables

---

## 13. Build sequence (~26 sessions)

| Phase | Deliverable | Sessions | Gate |
|---|---|---|---|
| 0 | Foundation — Vite + React + Tailwind + shadcn + Zustand 6-store + Dexie schema + Hydration Guard + Worker boilerplate | 2 | App mounts, tabs navigate, Dexie seeds libraries |
| 0.5 | CI + Testing — Vitest + Playwright + GitHub Actions + CF Pages preview | 1 | Push to branch = preview URL |
| 0.75 | Cloudflare backend — Access auth, Workers API, R2, D1, sync skeleton | 2 | Can create engagement, save blob, pull it back, auth enforced |
| 1 | Reference Libraries — TanStack editors for all 6 libraries, CRUD | 2 | All libraries editable, persist across reload |
| 1.5 | Regional defaults + Engagement Setup Wizard — 6 regional profiles | 1 | MY engagement → halal + Ramadan + Surau defaults apply |
| 2 | SKU Ingestion — PapaParse streaming, Zod validation, Float32Array, bulkPut | 2 | 20k CSV in <3s, validation fires |
| 2.5 | Data Quality Dashboard — error counts, auto-fix actions | 1 | User cleans data before engine runs |
| 3 | Engine Core (Steps 0–6) incl. Clear Height Check 4.5, Web Worker + transferables | 3 | Engine runs end-to-end on test data |
| 4 | Advanced Engine (Steps 7–11) — labour w/ travel models, MHE, docks, support (Surau, halal, customs, Ramadan), rollup w/ slab+seismic | 3 | Schedule of Areas renders, structural flags appear |
| 5 | Layout Feasibility — simple D3 rectangle-packing, fit check, basic SVG | 2 | Visual feasibility confirmation |
| 6 | Automation & Scenarios — Step 12 density (Chinese vendors), scenarios, tornado, worker pool, feasibility filter | 3 | Compare conventional vs AutoStore vs HaiPick; 30 variants in <1.5s |
| 7 | Visio-Grade SVG Layout — 11-layer diagram, polygon envelopes, obstacles, flow arrows, fire egress, hit-test, SVG export | 3 | Client-presentable block diagram |
| 8 | Outputs & Export — Excel, PDF (react-pdf), PPT tornado, .scc snapshot | 2 | All export formats tested |
| 9 | Polish — edge cases, perf profiling, keyboard shortcuts, error boundaries | 2 | Production build deployable |

**Total: 26 sessions.**

---

## 14. Performance budget

| Operation | Target |
|---|---|
| SKU CSV parse 20k rows | <3s |
| Validation 20k SKUs | <200ms |
| Engine Steps 1–11 (5k SKUs) | <50ms |
| Engine Steps 1–11 (20k SKUs) | <150ms |
| Tornado 30 variants | <1.5s |
| Layout generation 30 zones | <200ms |
| Layout SVG render | <50ms |
| Tab switch | <100ms |
| Dexie bulk write 20k SKUs | <2s |
| R2 push (5 MB .scc) | <2s |
| R2 pull (5 MB .scc) | <2s |
| .scc export | <3s |
| .scc import | <4s |

---

## 15. Risk register

See spec. Key risks: Safari Transferable fallback, IndexedDB quota, R2 sync conflicts, malformed Asian CSVs (UTF-8 + BOM), D3 polygon layout fallback, WERC heuristic defaults, packingEfficiency sanity bounds, CF Access mid-session refresh, R2/D1 free-tier monitoring, regional logic audit, debounced auto-save + recovery dialog.

---

## 16. Out of scope

- Rent, depreciation, capex costing
- FMEA / client DC risk register
- Cycle counting / inventory accuracy
- Training curve modelling
- Live WMS integration (Manhattan, BY, SAP EWM)
- Multi-facility network design

---

## 17. Glossary

PFP (Pick-From-Pallet), CLS (Carton Live Storage), VNA (Very Narrow Aisle), DSOH (Days Stock On Hand), CV (Coefficient of Variation), VHC/HHC (Vertical/Horizontal Honeycombing), TI/HI (Ties/Layers), ESFR (Early Suppression Fast Response), DG (Dangerous Goods), LPH/CPH/UPH, UDL, WERC, G2P, ASRS, AMR, AGV, ACR, JAKIM, MUI, Surau, SCDF, SNI, JIS, KS, GB/T, UBBL, FTZ/KPBPB, T11 (ISO 6780 size 3, 1100×1100), .scc (SCConnect engagement snapshot).

---

## 18. Sign-off required

Before code starts, Vaughan confirms:
1. Architecture locked (CF Pages + Access + R2 + D1)
2. 26-session build estimate acceptable
3. Engagement Setup Wizard UX right
4. Chinese automation vendors in scope (Geek+, HAI, Quicktron, Libiao, Mushiny)
5. All six primary markets' defaults (KR, TW, VN, MY, SG, ID) acceptable
6. Export formats sufficient (Excel + PDF + PPT + SVG + .scc)

**Phase 0 kickoff** — Cloudflare Pages project, GitHub repo (SCConnect org), Vite + React scaffolding, Dexie schema, Zustand 6-store skeleton, Hydration Guard. 2 sessions. Gate: app mounts, nav works, Dexie seeds libraries.

No more spec documents. Only code and commits.

**End of v3.0.**
