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

### Step 0 — Data validation

Runs every SPEC §7 data-quality check on your SKU set: fatal errors,
warnings, suppressions, per-code counts. Engine refuses to run until you
acknowledge the result. Four auto-fixes are available — each is reversible
and invalidates the acknowledgement.

### Step 1 — Demand profiling & ABC

Computes per-SKU velocity (lines/day), cube velocity (cm³/day), CV (volatility),
and ABC class (A = top 80% demand, B = next 15%, C = tail 5%). Sets the
foundation for everything downstream.

### Step 2 — Forward growth

Projects demand from Year 1 to the design horizon and picks the **peak year**
— the one that drives sizing. Compound growth uniform across all SKUs (no
per-SKU growth curves yet).

### Step 3 — Slot sizing

Allocates each SKU to a slot type (PFP / CLS / Shelf S/M/L) and computes
positions needed. Storage qty = lines/day × DSOH × peakYearMultiplier.
Slot type via {ABC × velocity × cube} threshold per SPEC §4.3.

### Step 4 — Rack bay alignment

Number of structural rack bays per zone, aligned to bay width and the
structural bay block. `bays_raw = positions / slotsPerBay / levels`, then
ceiling-rounded to the bay-block multiple.

### Step 4.5 — Clear height (mandatory gate)

Verifies usable rack height (eaves − sprinkler clearance − bottom-beam − beam
thickness) is enough for the levels Step 4 wants. Failure shrinks levels and
inflates Step 5 footprint.

### Step 4.6 — Seismic mass (mandatory gate)

Verifies total racked mass against the building's allowable seismic mass for
the design category. Failure drives anchorage, bracing, or worst-case shell
upgrade.

### Step 5 — Storage footprint

Converts aligned bays per zone into m², applying grid efficiency (aisles,
cross-aisles, structural waste, honeycombing). The single biggest contributor
to GFA.

### Step 6 — Throughput

Daily inbound pallets, outbound pallets, pick lines, plus a CV-based peak
uplift: `peak = avg × (1 + peakUpliftFactor × CV)`. Drives Step 7 labour,
Step 8 MHE, Step 9 docks.

### Step 7 — Labour

Sizes peak FTE per task using one of seven travel models (sqrt_area /
sequential_hv / shuttle_cycle / crane_cycle / g2p_port / amr_fleet / zero).
Applies multiplicative availability factor (SPEC §8.3) and Ramadan derate
(MY/ID, 30 days × 0.82×). Largest opex driver.

### Step 8 — MHE fleet & charging

Per-task fleet size with battery-chemistry-aware available hours (lithium
opportunity 23 h/d × 5 d/wk; lead-acid swap 18; fuel cell 23; AMR 22 × 7).
Charging area + kVA roll up.

### Step 9 — Dock schedule

Inbound + outbound doors via blended container mix (40HC pal/floor, 20ft pal/floor,
curtain, cross-dock, van) and bimodal staging (fast cross-dock vs slow
QC/decant). Peak day is a Poisson tail; percentile factor 1.5 covers the
90th-percentile day.

### Step 10 — Support areas

Office (1 m²/FTE), Surau (MY/ID — 1 m² per 50 muslim staff + 6 m² ablution),
customs (when bonded), VAS, returns, QC, DG, pack bench, empty pallet, waste,
antechamber (cold-chain), lithium kVA buffer.

### Step 11 — Footprint roll-up & feasibility

Sums operational + office + canopy + soft-space; computes site area; applies
four feasibility gates: slab UDL, seismic, envelope, clear height. Halal
uplift applies to whole operational area when halalCertifiedRequired.

### Step 12 — Automation override

When you pick an automation system, replaces conventional storage zones with
the system's footprint + a front-end induction area. Sizes robots, ports,
throughput capacity, kVA. Density is a step function; throughput uniform
across the day.

### Step 14 — Tornado sensitivity

Sweeps 17 SPEC parameters at low/high (34 variants), ranks by weighted
footprint + FTE delta. Each parameter swings independently — covariance not
modelled. The `α` weight (default 0.5) controls footprint vs FTE preference.

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
