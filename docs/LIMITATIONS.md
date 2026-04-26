# Limitations — ways the engine could be wrong

Consolidated list of every caveat baked into the SPEC v3.0 pipeline. The same
content is surfaced inline in the **Help** dialog (open with `?` → **Ways it
could be wrong (consolidated)**) and on each step's expander card on the
Scenarios tab.

This is the doc to hand to a sceptical reviewer alongside the Schedule of
Areas. It will save you the conversation that starts with *"how do I know
this number isn't bullshit?"*.

> The per-step caveats below are auto-generated from
> [`src/ui/help/step-explainers.ts`](../src/ui/help/step-explainers.ts).
> Edit the TS file, then run `npm run docs:build` and commit. A vitest drift
> guard fails the build if the two diverge.

---

<!-- BEGIN GENERATED:per-step-caveats -->

## Step 0 · Data validation

- Data-quality checks are syntactic and cross-row, not semantic — a SKU labelled "electronics" with weight 50 kg will pass.
- No outlier detection beyond the CV cap — long-tail demand spikes within CV ≤ 3 still get through.
- Halal status is a single boolean field, not ingredient-level certification.
- Channel mix tolerance is ±5% — only auto-fixes within that band; bigger gaps are surfaced as fatal errors.

## Step 1 · Demand profiling & ABC

- Velocity classification is static — no SKU-lifecycle modelling (intro / mature / EOL).
- Seasonality is a binary flag — multi-peak SKUs (Christmas + Chinese New Year + back-to-school) are not separated.
- Channel mix is assumed constant year-round — no Q4 e-commerce spike modelling.
- 1 line ≈ 1 outbound pick — batch-pick efficiency is not modelled.

## Step 2 · Forward growth

- Compound growth is uniform across all SKUs — no per-SKU growth curves.
- No SKU churn (new launches, discontinuations) modelled.
- No price elasticity / promo modelling — growth is volume only.
- Inbound and outbound grow at the same rate (steady-state stocking assumption).

## Step 3 · Slot sizing (PFP / CLS / Shelf)

- Single-zone allocation per SKU — no split (e.g. fast-mover replenishment from reserve modelled inventory-wise).
- Pallet TI/HI is taken at face value — engine does not re-derive it from cube + case dimensions.
- Repack flag is informational; physical repack zone is added separately in Step 10.
- Slot-type thresholds are heuristic — engagement-specific overrides not yet supported.

## Step 4 · Rack bay alignment

- A zone uses a single rack system — no mixed-rack zones (e.g. PFP + CLS in one).
- Beam-to-floor clearance is fixed — no multi-deep variations modelled.
- Structural bay block is a hard alignment — partial blocks always round up.

## Step 4.5 · Clear height (mandatory gate)

- Single uniform ceiling height — portal-frame variation and high-bay sub-zones not modelled.
- Sprinkler clearance is fixed at the SPEC default; in-rack sprinklers are not modelled.
- Beam thickness is taken from the rack library — no allowance for non-standard or imported racking.

## Step 4.6 · Seismic mass (mandatory gate)

- Average pallet load is heuristic (60% of max) — variable rack loading is not modelled.
- Static check only — dynamic seismic events (live loads during MHE operation) are not modelled.
- Importance level is fixed at 2 (storage occupancy) unless overridden in BuildingTemplate.
- Soil-class and damping factors come from the BuildingTemplate — no on-site geotech variation.

## Step 5 · Storage footprint

- Aisles split equally between adjacent zones — no asymmetric ownership.
- Cross-aisle frequency from regional fire-code defaults, not optimised.
- Honeycombing factors are heuristic — could under- or over-state real waste.
- Perimeter walkway ≈ 1 m everywhere — irregular building shapes not optimised.

## Step 6 · Throughput (daily + peak)

- Peak uplift is uniform across channels — no per-channel peak (e.g. ecom Q4 vs B2B steady).
- Pick-line ↔ outbound-pallet ratio is fixed by channel; no batch-pick efficiency modelling.
- Inbound = outbound on a steady-state basis — does not model deliberate inventory build-ups.
- No diurnal / day-of-week peak shape — peak is a single multiplier on the daily average.

## Step 7 · Labour (FTE w/ travel models)

- Throughput is uniform across the shift — no peak-shoulder ramps modelled.
- Travel coefficient is calibrated to similar-size DCs — applies regardless of operator skill or training.
- Availability factor uses the multiplicative method (SPEC §8.3) — not all consultants agree; alternative is additive sum.
- Ramadan derate is an annual blanket; no day-of-Ramadan shift-pattern variation modelled.
- No fatigue / shift-end productivity decay modelled.
- Phase 10.4 will generalise the Ramadan derate into a reusable learning curve framework.

## Step 8 · MHE fleet & charging

- Available hours are nominal — no maintenance windows beyond charging.
- Single-fleet-per-task — no mixed VNA + reach within one zone.
- Charging area is a single block — distributed charging stations not modelled.
- Battery degradation over lifecycle is not modelled (assumes new-condition cycles).

## Step 9 · Dock schedule (inbound + outbound)

- Random container arrival — no ASN-driven dock scheduling.
- Cross-dock and QC/decant are mutually exclusive per container — no partial cross-dock.
- Percentile factor 1.5 covers 90th percentile; engagements with stricter SLAs need a higher factor.
- Trailer / shipping yard sizing not modelled (parking, queuing, swap area).

## Step 10 · Support areas

- Office sizing is m²/FTE heuristic — no exec / open-plan / hot-desk ratio modelling.
- Surau ratio assumes 60% muslim staff in MY/ID; engagement override available but not the norm.
- Customs space assumes one bonded zone — multi-bonded sites (FTZ + KPBPB) not modelled.
- Lithium kVA buffer is a fixed multiplier — no transient inrush modelling.

## Step 11 · Footprint roll-up & feasibility

- Canopy in-coverage rule is binary (in / out) — no partial canopy modelled.
- Soft-space % is global, not per-zone.
- Halal uplift applies to the whole operational area — could be over-applied for partial halal segregation.
- Site coverage is a single ratio — no bonus-area negotiation modelled (e.g. KR setbacks).

## Step 12 · Automation override

- Density is a step function (rounded by physical unit) — not interpolated between system sizes.
- Throughput uniform across day — no peak ramp on automation.
- Front-end induction area is a fixed multiple of port count — adjacency efficiencies not modelled.
- No automation-vendor pricing or lead-time modelling — output is footprint-only.
- Hybrid automation (e.g. AutoStore + manual decant + AGV) is not modelled — pick one system per Step 12.

## Step 14 · Tornado sensitivity

- Each parameter swings independently — no covariance between parameters modelled.
- Linear ranking (sum-weighted footprint + FTE) — interaction effects not surfaced.
- 17 SPEC parameters fixed — adding more requires curation against the variance budget.
- ±25% (or calibrated band) per parameter — does not match the empirical distribution of every input.

<!-- END GENERATED:per-step-caveats -->

---

## Out of scope (SPEC §16)

These are explicitly NOT in v3.0 — adding any of them is a scope-change
decision:

- Rent / depreciation / capex costing
- FMEA / client DC risk register
- Cycle counting / inventory accuracy
- Training curve modelling
- Live WMS integration (Manhattan, BY, SAP EWM)
- Multi-facility network design

The next-phase plan ([CLAUDE.md](../CLAUDE.md) Phase 10.7 + Phase 11 + Scope
extensions) tracks each as a parked todo with effort estimate.
