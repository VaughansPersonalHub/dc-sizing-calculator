# How it works — engine in plain English

The DC Sizing Calculator's engine is a 16-step pipeline that turns a SKU master
+ ops profile into a sized DC: footprint, FTE, MHE fleet, dock count, support
areas, structural feasibility, and a layout solution. This document explains
each step in plain English. For the formula-level detail per step, open the
in-app **Help** dialog (`?`) and expand the **Engine steps** section.

---

## The data flow

```
SKU CSV ──► Step 0 (validate) ──► Step 1 (profile, ABC, CV)
                                         │
                                         ▼
              Step 2 (forward growth, peak year)
                                         │
                                         ▼
            Step 3 (slot sizing: PFP / CLS / Shelf)
                                         │
                                         ▼
                Step 4 (rack bays per zone)
                                         │
                                         ▼
               Step 4.5 (clear height check)  ── mandatory gate
                Step 4.6 (seismic mass check) ── mandatory gate
                                         │
                                         ▼
                  Step 5 (zone footprint m²)
                                         │
                                         ▼
            Step 6 (throughput: daily + peak uplift)
                                         │
                                         ▼
                  Step 7 (labour, FTE, travel models)
                  Step 8 (MHE fleet, charging, kVA)
                  Step 9 (dock schedule, staging)
                Step 10 (support areas, surau, customs)
                                         │
                                         ▼
            Step 11 (footprint roll-up + 4 feasibility gates)
                                         │
                              ┌──────────┴──────────┐
                              ▼                     ▼
                Step 12 (automation override)   Step 14 (tornado)
                  (replaces conventional         (17 params × low/high
                   storage + adds front-end)      = 34 variants)
                                         │
                                         ▼
                              Layout solver (Phase 7)
                                         │
                                         ▼
                                    Outputs
                  (Excel / PDF / PPT / CSV / .scc)
```

---

## What each step does

> The per-step summaries below are auto-generated from
> [`src/ui/help/step-explainers.ts`](../src/ui/help/step-explainers.ts).
> Edit the TS file, then run `npm run docs:build` and commit. A vitest drift
> guard fails the build if the two diverge.

<!-- BEGIN GENERATED:step-summaries -->

### Step 0 · Data validation

Runs every SPEC §7 data-quality check on the SKU set and emits errors / warnings / suppressions. Engine refuses to run until acknowledged.

*Sensitivity:* HIGH — every downstream step depends on a clean baseline. Bad inputs propagate through the entire pipeline.

### Step 1 · Demand profiling & ABC

Computes per-SKU velocity (lines/day), cube velocity, ABC class, seasonality flag, and aggregate daily totals.

*Sensitivity:* MODERATE — drives Step 3 slot allocation and Step 7 labour split. Sensitive to channel mix and CV cap.

### Step 2 · Forward growth

Projects demand from Year 1 baseline to the design horizon, picks the peak year for sizing.

*Sensitivity:* HIGH — peakYear drives every sizing-step output. Linear in growth rate; small assumption change ≫ output change.

### Step 3 · Slot sizing (PFP / CLS / Shelf)

Allocates each SKU to a slot type — PFP (pick-from-pallet) / CLS (carton-live-storage) / Shelf S/M/L — and computes positions needed.

*Sensitivity:* HIGH — slot counts feed Step 4 bays and Step 5 footprint. Especially sensitive to DSOH per channel.

### Step 4 · Rack bay alignment

Computes the number of structural rack bays needed per zone, aligned to bay width and the structural bay block.

*Sensitivity:* LOW-MODERATE — rounding losses at structural-block alignment can cost 5-15% per zone.

### Step 4.5 · Clear height (mandatory gate)

Verifies that the building's available clear height supports the rack levels Step 4 wants. Hard gate — failure marks the engagement infeasible until remediated.

*Sensitivity:* BINARY — pass/fail. If short, Step 4 levels reduce, footprint grows in Step 5, GFA goes up.

### Step 4.6 · Seismic mass (mandatory gate)

Verifies total racked mass against the building's allowable seismic mass for the design category. Hard gate.

*Sensitivity:* BINARY — drives anchorage, bracing, and worst-case the building shell upgrade.

### Step 5 · Storage footprint

Converts aligned bays per zone into m², applying grid efficiency (aisles, cross-aisles, structural waste, honeycombing).

*Sensitivity:* HIGH — single biggest contributor to GFA. Sensitive to honeycombing factors (vertical, horizontal).

### Step 6 · Throughput (daily + peak)

Computes daily inbound pallets, outbound pallets, and pick lines, then applies CV-based peak uplift.

*Sensitivity:* HIGH — peak drives Step 7 labour, Step 8 MHE fleet, Step 9 docks.

### Step 7 · Labour (FTE w/ travel models)

Sizes peak FTE per task using one of seven travel models, applies availability factor (multiplicative method) and Ramadan derate.

*Sensitivity:* VERY HIGH — labour is the largest opex driver. Most sensitive to productivity confidence + travel coefficient.

### Step 8 · MHE fleet & charging

Sizes MHE fleet per task category, accounts for battery chemistry's charging downtime, computes charging area and kVA.

*Sensitivity:* MODERATE — fleet size is integer-rounded so step changes occur at unit boundaries.

### Step 9 · Dock schedule (inbound + outbound)

Sizes inbound/outbound dock doors using a blended container mix and bimodal staging (fast cross-dock vs QC/decant).

*Sensitivity:* MODERATE-HIGH — peak day is a Poisson tail; percentile_factor sets the safety margin.

### Step 10 · Support areas

Sums all non-storage areas: office, surau (MY/ID), customs (bonded), VAS, returns, QC, DG, pack bench, empty pallet, waste, antechamber (cold), lithium kVA buffer.

*Sensitivity:* LOW-MODERATE — support is ≤ 25% of GFA typically, but Surau / customs / antechamber can each add significant area.

### Step 11 · Footprint roll-up & feasibility

Sums operational + office + canopy + soft-space; computes site area; applies four feasibility gates {slab UDL, seismic, envelope, clear height}.

*Sensitivity:* HIGH — final GFA. Sensitive to halal uplift, soft-space %, canopy treatment.

### Step 12 · Automation override

When an automation system is selected, replaces conventional storage zones with the system's footprint + front-end induction area.

*Sensitivity:* HIGH — automation can swing footprint −50% to +20% depending on system & SKU mix.

### Step 14 · Tornado sensitivity

Runs 17 SPEC §13 parameters at low/high (34 variants) and ranks by weighted footprint + FTE delta.

*Sensitivity:* META — this IS the sensitivity layer.

<!-- END GENERATED:step-summaries -->

---

## Sources & citations

> Auto-generated from [`src/ui/help/citations.ts`](../src/ui/help/citations.ts).
> Edit the TS file, then run `npm run docs:build`.

<!-- BEGIN GENERATED:citations -->

### Surau (prayer room) ratio

**Value:** 1 m² per 50 muslim staff + 6 m² ablution area

**Source:** JAKIM (Jabatan Kemajuan Islam Malaysia)

**Reference:** JAKIM 2018 housing-guidance booklet for Halal-certified facilities; SPEC §6.2 MY/ID profiles encode the same ratio.

**Used by:** Step 10 · Support areas

**Notes:** Trigger threshold ≥ 40 muslim staff. Indonesia (MUI) defaults to the same ratio.

### Halal segregation uplift

**Value:** ~15% operational area uplift when halalCertifiedRequired

**Source:** JAKIM / MUI segregation rules

**Reference:** JAKIM Halal Manual Procedure 2014 (rack + dock + receiving lane segregation). 15% derived from prior SCConnect engagements in MY/ID.

**Used by:** Step 10 · Support areas · Step 11 · Footprint roll-up

**Notes:** Engagement override available. Lower if existing rack inventory can be repurposed; higher for full duplication.

### SCDF cross-aisle / fire compartment

**Value:** 20 m maximum cross-aisle / fire-compartment dimension (SG)

**Source:** Singapore Civil Defence Force (SCDF)

**Reference:** SCDF Fire Code 2018 §6.4 (storage occupancy); applied to SG region defaults only.

**URL:** <https://www.scdf.gov.sg/firecode/>

**Used by:** Step 5 · Storage footprint

**Notes:** Other ASEAN markets default to FM Global / NFPA 13.

### ESFR sprinkler clearance

**Value:** 1 m vertical clearance between top of stored goods and ESFR sprinkler deflector

**Source:** FM Global Data Sheet 8-9

**Reference:** FM Global Property Loss Prevention Data Sheet 8-9 (Storage of Class 1, 2, 3, 4 and Plastic Commodities); SPEC default for ESFR_K25.

**URL:** <https://www.fmglobaldatasheets.com/>

**Used by:** Step 4.5 · Clear height

**Notes:** In-rack sprinkler systems can reduce this — not modelled in v1; engagement override available.

### Walking pick speed

**Value:** ~0.5 m/s laden walking, ~1.0 m/s empty walking

**Source:** MTM-2 (Methods-Time Measurement)

**Reference:** MTM-2 standard times (1965, refined 2003). SPEC productivity library uses these as the floor for sqrt-area travel-coefficient calibration.

**Used by:** Step 7 · Labour

**Notes:** Region-calibrated overrides apply: KR/SG dense layouts ≈ 0.45 m/s, MY/ID open layouts ≈ 0.55 m/s.

### Slab UDL — typical industrial

**Value:** 5 t/m² (default for non-specified slab)

**Source:** Industry rule of thumb (ASEAN industrial)

**Reference:** Common floor-loading spec for greenfield ASEAN logistics; SPEC default. Specialty cold-store / multi-story DCs typically 7-10 t/m².

**Used by:** Step 11 · Footprint roll-up (structural gate)

**Notes:** CRITICAL: always validate against the actual building structural drawings — slab type / slab thickness / column-spacing all interact.

### Seismic design category

**Value:** A-F per IBC 2018 / regional equivalents

**Source:** IBC 2018; regional codes (KS in KR, GB/T in CN, SNI in ID, UBBL in MY)

**Reference:** International Building Code 2018 §1613; SPEC regional profiles encode a default per region (KR=D, TW=D, VN=C, MY=B, SG=A, ID=D).

**Used by:** Step 4.6 · Seismic mass

**Notes:** Site-specific PGA can shift the category by one bucket; engagement override critical.

### T11 pallet (1100×1100)

**Value:** ISO 6780 Size 3 — 1100 × 1100 × 150 mm, max 1500 kg

**Source:** ISO 6780 (Flat pallets for intercontinental materials handling)

**Reference:** ISO 6780:2003. T11 is the dominant Asian pallet — JIS Z 0601 in JP, KS in KR.

**URL:** <https://www.iso.org/standard/35988.html>

**Used by:** Step 3 · Slot sizing · Step 4 · Bays · Step 9 · Docks

### Ramadan productivity derate

**Value:** 30 days × 0.82× FTE rate (annual blanket)

**Source:** SPEC §6.2 (synthesised from prior MY/ID engagements)

**Reference:** No published academic source — derived from ~6 SCConnect MY/ID engagement audits, 2018-2023. Phase 10.4 will generalise into a learning-curve.

**Used by:** Step 7 · Labour

**Notes:** Conservative estimate; some operations report 0.75× during the last week of Ramadan; the blanket smooths the daily variation.

### Peak uplift CV factor

**Value:** peak = avg × (1 + peakUpliftFactor × CV)

**Source:** SPEC §6.3 heuristic

**Reference:** Synthesised from ~12 engagements 2019-2024. peakUpliftFactor ≈ 1.5 covers the 90th percentile day.

**Used by:** Step 6 · Throughput

**Notes:** Engagement override expected — strict-SLA operations (e.g. medical, electronics) push this to 2.0+.

### DSOH per channel × velocity

**Value:** A-class B2B: 7-14 d · A-class ecom: 5-10 d · C-class: 30-60 d

**Source:** SPEC §6.2 regional defaults

**Reference:** Region-tuned defaults per channel × velocity class. Engagement override expected.

**Used by:** Step 3 · Slot sizing

**Notes:** Highly engagement-specific — every client has its own DSOH policy.

### Container packing — 40HC pal/floor

**Value:** 20-22 T11 pallets per 40HC (single-row, floor-stack)

**Source:** Industry packing tables

**Reference:** Standard 40HC dimensions 12.03 × 2.35 × 2.69 m (internal); T11 1100×1100 floor-stack pattern. SPEC default 21.

**Used by:** Step 9 · Dock schedule

**Notes:** Cube-cap (volume) often binds before floor-stack count for low-density goods.

### Office area per FTE

**Value:** 1 m² per FTE (operational support office)

**Source:** SPEC §6.2 regional defaults

**Reference:** KR/SG: 0.7-1.0 m²/FTE (denser); MY/ID/VN: 1.0-1.5 m²/FTE. SPEC default 1.0 m²/FTE.

**Used by:** Step 10 · Support areas

**Notes:** Excludes exec / meeting / break spaces — those are bundled into a separate amenities allowance.

<!-- END GENERATED:citations -->

---

## Why these specific 16 steps

The pipeline is the SPEC v3.0 §3 build sequence. Each step has one
responsibility, transforms typed inputs into typed outputs, and is unit-tested
against a fixture. The two **mandatory gates** (Step 4.5, 4.6) are short-circuit
checks — if they fail, downstream steps still run, but the feasibility flag is
permanently red until remediated.

The order matters: every step assumes the previous step's output is complete.
Step 7 needs Step 5 (zone areas) and Step 6 (peak throughput); Step 11 needs
Steps 5, 9, 10. The DAG is acyclic — no circular dependencies — which is what
makes the engine deterministic and re-runnable on every input change.

---

## Where to drill in

- Each step's formula, inputs, outputs, assumptions, sensitivity, and caveats:
  open the **Help** dialog (`?`) and expand the **Engine steps** section, or
  the **How it works** card beneath each result card on the Scenarios tab.
- The full SPEC: [SPEC.md](../SPEC.md).
- The repo conventions: [CLAUDE.md](../CLAUDE.md).
- Limitations consolidated in one place: [LIMITATIONS.md](./LIMITATIONS.md).
