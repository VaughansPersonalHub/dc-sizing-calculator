// Phase 10.2 — Per-step "How it works" content.
//
// One entry per engine step (0..14). Each entry is the source of truth
// for the step explainer card on the Scenarios tab AND the entry in
// the Help dialog's "Engine steps" section. Phase 10.3 will add a
// `caveats` field per step; Phase 10.6 will add `benchmarks`.
//
// Keep wording terse and information-dense — the audience is a tech
// reviewer who wants the math + assumption surface, not marketing copy.

export interface StepExplainer {
  /** Anchor id used for #step-X URL fragments. */
  id: string;
  /** Display title — matches the result card title on Scenarios tab. */
  title: string;
  /** Step number (e.g. "0", "4.5", "14") for ordering / display. */
  number: string;
  /** One-sentence summary of what the step computes. */
  what: string;
  /** Key formula(s) in plain text. Multi-line ok. */
  formula: string;
  /** Bullet list of inputs the step consumes. */
  inputs: readonly string[];
  /** Bullet list of outputs the step produces. */
  outputs: readonly string[];
  /** Bullet list of the assumptions baked in. */
  assumptions: readonly string[];
  /**
   * Sensitivity profile — one of HIGH / MODERATE / LOW / BINARY / META,
   * followed by a one-sentence rationale.
   */
  sensitivity: string;
}

export const STEP_EXPLAINERS: readonly StepExplainer[] = [
  {
    id: 'step-0-validation',
    number: '0',
    title: 'Step 0 · Data validation',
    what: 'Runs every SPEC §7 data-quality check on the SKU set and emits errors / warnings / suppressions. Engine refuses to run until acknowledged.',
    formula:
      'Per-row Zod schema + cross-row checks (channel-mix sum ≈ 1.0, CV ≤ 3, ≥26 weeks history, halal status complete on halal-flagged engagements).',
    inputs: ['SkuRecord[] with 52-week Float32Array', 'OpsProfile.halalCertifiedRequired'],
    outputs: [
      'fatalErrors, warnings, suppressedSkus',
      'stats: totalSkus, cleanSkus, warningSkus, fatalSkus, suppressedSkus',
      'codesByCount (per SPEC §7 code)',
      'inputHash (used to lock the acknowledgement)',
    ],
    assumptions: [
      'Weekly demand is a complete year (52 points) — partial history → PARTIAL_HISTORY warning.',
      'Channel mix should sum to 1.0; the auto-fix only rescales when within ±5%.',
      'CV > 3 is treated as a likely data spike, not a real demand pattern.',
      'Auto-fixes are reversible — they edit Dexie and drop the acknowledgement hash.',
    ],
    sensitivity:
      'HIGH — every downstream step depends on a clean baseline. Bad inputs propagate through the entire pipeline.',
  },
  {
    id: 'step-1-profiling',
    number: '1',
    title: 'Step 1 · Demand profiling & ABC',
    what: 'Computes per-SKU velocity (lines/day), cube velocity, ABC class, seasonality flag, and aggregate daily totals.',
    formula:
      'lines_per_day = Σ(weekly_demand) / 52 / 7\n' +
      'cube_velocity_cm³_per_day = lines_per_day × unitCubeCm3\n' +
      'CV = stddev(weekly_demand) / mean(weekly_demand)\n' +
      'ABC: A = top 80% of demand, B = next 15%, C = tail 5%.',
    inputs: ['SkuRecord[] from Step 0 (with optional suppression list)'],
    outputs: [
      'Per-SKU: velocity class, cube velocity, CV, seasonality flag',
      'Totals: totalLinesPerDay, totalCubeVelocityCm3PerDay, countByVelocity',
    ],
    assumptions: [
      'Weekly demand is uniform within the week (no day-of-week shape).',
      '52-week window represents a typical year — no growth correction yet (that is Step 2).',
      '1 line ≈ 1 outbound pick (lines and picks treated interchangeably).',
    ],
    sensitivity:
      'MODERATE — drives Step 3 slot allocation and Step 7 labour split. Sensitive to channel mix and CV cap.',
  },
  {
    id: 'step-2-growth',
    number: '2',
    title: 'Step 2 · Forward growth',
    what: 'Projects demand from Year 1 baseline to the design horizon, picks the peak year for sizing.',
    formula:
      'year_demand[n] = baseline × (1 + growthRate)^n\n' +
      'peakYear = argmax(year_demand[1..horizon])',
    inputs: [
      'Step 1 totals',
      'OpsProfile.designHorizonYears',
      'OpsProfile.demandGrowthRate (compound, per year)',
    ],
    outputs: ['Per-year totals', 'peakYear marker (the year used for all downstream sizing)'],
    assumptions: [
      'Compound growth is uniform across all SKUs and channels (no per-SKU growth curves).',
      'No SKU churn modelled (new launches, discontinuations).',
      'Growth applies equally to inbound and outbound (not modelled separately).',
    ],
    sensitivity:
      'HIGH — peakYear drives every sizing-step output. Linear in growth rate; small assumption change ≫ output change.',
  },
  {
    id: 'step-3-slot-sizing',
    number: '3',
    title: 'Step 3 · Slot sizing (PFP / CLS / Shelf)',
    what: 'Allocates each SKU to a slot type — PFP (pick-from-pallet) / CLS (carton-live-storage) / Shelf S/M/L — and computes positions needed.',
    formula:
      'storage_qty_units = lines_per_day × DSOH_days × peakYearMultiplier\n' +
      'pfp_positions = ceil(storage_qty / pallet_capacity_units)\n' +
      'slot_type = f(ABC class, velocity, cube) per SPEC §4.3 thresholds.',
    inputs: [
      'Step 1 + 2 outputs',
      'OpsProfile.dsoh per channel × velocity class',
      'racks library (slot capacity, density)',
      'pallets library (TI/HI, max load)',
    ],
    outputs: [
      'pfpPositions, clsLanes, shelfPositionsSmall/Medium/Large',
      'weightWarnings (SKUs that exceed pallet max load)',
      'repackSkus (inbound and outbound pallets differ)',
    ],
    assumptions: [
      'Each SKU goes to one slot type — no split-zone allocation.',
      'Pallet TI/HI is correct; the engine does not re-derive it from cube + case dimensions.',
      'Repack flag is informational; physical repack zone is added in Step 10.',
    ],
    sensitivity:
      'HIGH — slot counts feed Step 4 bays and Step 5 footprint. Especially sensitive to DSOH per channel.',
  },
  {
    id: 'step-4-bays',
    number: '4',
    title: 'Step 4 · Rack bay alignment',
    what: 'Computes the number of structural rack bays needed per zone, aligned to bay width and the structural bay block.',
    formula:
      'bays_raw = positions / slotsPerBay / levels\n' +
      'alignedBays = ceil(bays_raw / structuralBayBlock) × structuralBayBlock',
    inputs: [
      'Step 3 slot counts',
      'racks library (slotsPerBay, levelsDefault, structuralBayBlock)',
    ],
    outputs: ['Per-zone alignedBays + rawSlots'],
    assumptions: [
      'A zone uses a single rack system (no mixed-rack zones).',
      'Alignment to structural blocks is mandatory — partial blocks are rounded up.',
    ],
    sensitivity:
      'LOW-MODERATE — rounding losses at structural-block alignment can cost 5-15% per zone.',
  },
  {
    id: 'step-4-5-clear-height',
    number: '4.5',
    title: 'Step 4.5 · Clear height (mandatory gate)',
    what: 'Verifies that the building\'s available clear height supports the rack levels Step 4 wants. Hard gate — failure marks the engagement infeasible until remediated.',
    formula:
      'usableRackM = eavesM − sprinklerClearanceM − bottomBeamClearanceM − beamThicknessMm/1000\n' +
      'requiredRackM = levels × levelHeightM\n' +
      'ok = usableRackM ≥ requiredRackM',
    inputs: [
      'BuildingTemplate.clearHeights (eaves, sprinkler clearance)',
      'racks.levels',
      'beamThicknessMm + bottomBeamClearanceMm',
    ],
    outputs: [
      '{ ok, shortfallLevels, requiredRackHeightMm, usableRackHeightMm }',
      'feasibilityFlags.clearHeight',
    ],
    assumptions: [
      'SPEC ESFR sprinkler-clearance default applies (1 m).',
      'Ceiling is uniform — no portal-frame variation accommodated yet.',
    ],
    sensitivity:
      'BINARY — pass/fail. If short, Step 4 levels reduce, footprint grows in Step 5, GFA goes up.',
  },
  {
    id: 'step-4-6-seismic',
    number: '4.6',
    title: 'Step 4.6 · Seismic mass (mandatory gate)',
    what: 'Verifies total racked mass against the building\'s allowable seismic mass for the design category. Hard gate.',
    formula:
      'seismicMassT = pallets_total × (avgPalletKg + emptyPalletKg) / 1000\n' +
      'allowableMassT = perFloorAllowable × allowableRatio × siteAreaM2',
    inputs: [
      'Step 3 slot counts × pallet weights',
      'BuildingTemplate.seismic.{designCategory, allowableRatio, soilClass}',
      'pallets library (maxLoadKg, emptyWeightKg)',
    ],
    outputs: ['{ ok, seismicMassT, allowableMassT, remediation }', 'feasibilityFlags.seismic'],
    assumptions: [
      'Average pallet load ≈ maxLoadKg × 0.6 (utilisation factor).',
      'Structural rack mass already accounted for in racks.rackMassKgPerPosition.',
      'Importance level is fixed at 2 (storage occupancy) unless overridden in BuildingTemplate.',
    ],
    sensitivity:
      'BINARY — drives anchorage, bracing, and worst-case the building shell upgrade.',
  },
  {
    id: 'step-5-footprint',
    number: '5',
    title: 'Step 5 · Storage footprint',
    what: 'Converts aligned bays per zone into m², applying grid efficiency (aisles, cross-aisles, structural waste, honeycombing).',
    formula:
      'zone_m² = bays × bayWidthM × (bayDepthM + aisleWidthM/2)\n' +
      '         / fillFactor / honeycombing.{vertical,horizontal}',
    inputs: [
      'Step 4 alignedBays',
      'racks.{bay, aisle, fillFactor, honeycombing}',
      'mhe.aisleWidthMmDefault',
    ],
    outputs: [
      'Per-zone alignedAreaM2',
      'totalAlignedAreaM2, averageGridEfficiency',
      'Per-zone aisleHint (orientation + count) — feeds layout solver.',
    ],
    assumptions: [
      'Aisles split equally between adjacent zones (no asymmetric aisle ownership).',
      'Cross-aisles every N bays per SCDF / FM Global fire-code defaults (region-driven).',
      'Perimeter walkway ≈ 1 m around the storage block.',
    ],
    sensitivity:
      'HIGH — single biggest contributor to GFA. Sensitive to honeycombing factors (vertical, horizontal).',
  },
  {
    id: 'step-6-throughput',
    number: '6',
    title: 'Step 6 · Throughput (daily + peak)',
    what: 'Computes daily inbound pallets, outbound pallets, and pick lines, then applies CV-based peak uplift.',
    formula:
      'peak = avg × (1 + peakUpliftFactor × CV)\n' +
      'inbound_pallets_per_day = (storage_qty / DSOH) × replenishment_factor',
    inputs: [
      'Step 1 daily lines',
      'Step 3 slot counts',
      'OpsProfile.peakUpliftFactor',
      'channel mix',
    ],
    outputs: [
      'daily { inboundPallets, outboundPallets, pickLinesPerDay }',
      'peak  { inboundPallets, outboundPallets, pickLinesPerDay }',
    ],
    assumptions: [
      'Peak uplift is the same across all channels (no per-channel peak modelling).',
      'Pick-line ↔ outbound-pallet ratio is fixed by channel.',
      'Inbound ≈ outbound on a steady-state basis (DSOH replacement).',
    ],
    sensitivity: 'HIGH — peak drives Step 7 labour, Step 8 MHE fleet, Step 9 docks.',
  },
  {
    id: 'step-7-labour',
    number: '7',
    title: 'Step 7 · Labour (FTE w/ travel models)',
    what: 'Sizes peak FTE per task using one of seven travel models, applies availability factor (multiplicative method) and Ramadan derate.',
    formula:
      'rate = staticTime + travelTimeForModel(zoneAreaM2, travelCoefficient)\n' +
      'fte = peak_units / rate / hoursPerShift / shiftsPerDay\n' +
      'total = Σ(per-task FTE) / availabilityFactor\n' +
      'annual_fte = total × (1 + ramadanAnnualImpact)',
    inputs: [
      'Step 5 zone areas',
      'Step 6 peak',
      'productivity library (per task)',
      'MHE library',
      'OpsProfile.{availabilityFactor, ramadanDerate}',
    ],
    outputs: [
      'totalBaseFte, totalPeakFte',
      'ftePerCategory (picking, putaway, replenishment, …)',
      'availability, ramadanAnnualImpact',
      'warnings (e.g. WALKING_PICK_IN_LARGE_ZONE)',
    ],
    assumptions: [
      'Throughput is uniform across the shift (no peak-shoulder ramps modelled).',
      'Travel coefficient is calibrated to similar-size DCs — engagement override available.',
      'Availability factor uses the multiplicative method (NOT additive sum) per SPEC §8.3.',
      'Ramadan derate applies annually for MY/ID engagements at 30 days × 0.82×.',
    ],
    sensitivity:
      'VERY HIGH — labour is the largest opex driver. Most sensitive to productivity confidence + travel coefficient.',
  },
  {
    id: 'step-8-mhe',
    number: '8',
    title: 'Step 8 · MHE fleet & charging',
    what: 'Sizes MHE fleet per task category, accounts for battery chemistry\'s charging downtime, computes charging area and kVA.',
    formula:
      'available_hours_per_unit:\n' +
      '  lithium opportunity = 23 h/d × 5 d/wk\n' +
      '  lead-acid swap     = 18 h/d × 5 d/wk (1 h swap per shift)\n' +
      '  fuel cell           = 23 h/d × 5 d/wk\n' +
      '  AMR                 = 22 h/d × 7 d/wk × 50 wk/yr\n' +
      'fleet = peak_unit_demand / (available × utilisationTarget)',
    inputs: [
      'Step 7 task split',
      'MHE library (battery type, charging footprint, kVA, utilisation target)',
      'OpsProfile.shiftsPerDay',
    ],
    outputs: [
      'Per-fleet count + battery type',
      'totalChargingFootprintM2, totalChargingKva',
    ],
    assumptions: [
      'Available hours are nominal (no maintenance windows beyond charging).',
      'Single-fleet-per-task — no mixed VNA + reach within one zone.',
      'VNA routing override applies for VNA aisles (operator stays in-aisle).',
    ],
    sensitivity:
      'MODERATE — fleet size is integer-rounded so step changes occur at unit boundaries.',
  },
  {
    id: 'step-9-docks',
    number: '9',
    title: 'Step 9 · Dock schedule (inbound + outbound)',
    what: 'Sizes inbound/outbound dock doors using a blended container mix and bimodal staging (fast cross-dock vs QC/decant).',
    formula:
      'blended_cycle_min = Σ(mix_fraction × cycle_min_per_container_type)\n' +
      'doors = peak_containers × percentile_factor / (operating_hours × 60 / blended_cycle_min)\n' +
      'staging_m² = cross_dock_pct × fast_cycle_m² + qc_decant_pct × slow_cycle_m²',
    inputs: [
      'Step 6 peak inbound/outbound',
      'OpsProfile.containerMix (40HC pal/floor, 20ft pal/floor, curtain, cross-dock, van)',
      'OpsProfile.percentileDocks (default 1.5 = 90th percentile day)',
    ],
    outputs: [
      'inbound  { doorsRequired, blendedCycleMin, containersPerDay }',
      'outbound { doorsRequired, blendedCycleMin, containersPerDay }',
      'staging  { totalM2, fastCrossDockM2, qcDecantM2 }',
    ],
    assumptions: [
      'Random container arrival (no ASN-driven dock scheduling).',
      'Cross-dock and QC/decant are mutually exclusive per container.',
      'Percentile factor 1.5 covers the 90th-percentile day — increase for higher service levels.',
    ],
    sensitivity:
      'MODERATE-HIGH — peak day is a Poisson tail; percentile_factor sets the safety margin.',
  },
  {
    id: 'step-10-support',
    number: '10',
    title: 'Step 10 · Support areas',
    what: 'Sums all non-storage areas: office, surau (MY/ID), customs (bonded), VAS, returns, QC, DG, pack bench, empty pallet, waste, antechamber (cold), lithium kVA buffer.',
    formula:
      'office_m² = officeM2PerFte × peakFte\n' +
      'surau_m² = (muslim_staff_count / 50) × 1 m² + 6 m² ablution\n' +
      'halal_uplift_factor = ~0.15 when halalCertifiedRequired',
    inputs: [
      'Step 7 FTE',
      'OpsProfile.{halalCertifiedRequired, isBonded}',
      'Regional context (Surau / Ramadan / officeM2PerFte)',
      'BuildingTemplate.coldChain.antechamberRequired',
    ],
    outputs: [
      'Per-area m² (office, surau, ablution, battery, vas, returns, qc, customs, tempAntechamber)',
      'operationalSupportM2, officeAndAmenitiesM2',
      'halalUpliftFactor + warnings',
    ],
    assumptions: [
      'Office: SPEC default 1 m²/FTE — region overrides apply (KR / SG denser).',
      'Surau ratio: 60% of staff are muslim in MY / ID for sizing.',
      'Lithium-charging kVA buffer ≈ kVA × 1.2 for grid sag tolerance.',
    ],
    sensitivity:
      'LOW-MODERATE — support is ≤ 25% of GFA typically, but Surau / customs / antechamber can each add significant area.',
  },
  {
    id: 'step-11-rollup',
    number: '11',
    title: 'Step 11 · Footprint roll-up & feasibility',
    what: 'Sums operational + office + canopy + soft-space; computes site area; applies four feasibility gates {slab UDL, seismic, envelope, clear height}.',
    formula:
      'operationalM² = (storage + staging + dock_strip + support) × (1 + halalUpliftFactor)\n' +
      'GFA = operational + office + (canopy if columned > exempt)\n' +
      'siteAreaM² = GFA / maxSiteCoverage\n' +
      'softSpace = phase2HorizontalM² + phase2VerticalM²',
    inputs: [
      'Steps 5, 9, 10 outputs',
      'BuildingTemplate.envelope (length × width or polygon)',
      'OpsProfile.softSpacePct',
      'AutomationConfig (optional — swaps storage with Step 12 footprint)',
    ],
    outputs: [
      'rollup { operationalM2, officeAndAmenitiesM2, GFA, canopy, siteAreaM2, softSpace, automationSavingsM2 }',
      'structural { staticSlabUdlTPerM2, slabLoadingTPerM2, slabFailure, overEnvelope, envelopeShortfallM2 }',
      'feasibilityFlags { slab, seismic, envelope, clearHeight }',
      'infeasible (overall flag)',
    ],
    assumptions: [
      'Canopy in-coverage rule: columned canopy counts toward site coverage; cantilever > 6 m is exempt.',
      'Soft-space split horizontal/vertical based on mezzanine availability.',
      'Halal uplift applies to the whole operational area (not just storage).',
    ],
    sensitivity:
      'HIGH — final GFA. Sensitive to halal uplift, soft-space %, canopy treatment.',
  },
  {
    id: 'step-12-automation',
    number: '12',
    title: 'Step 12 · Automation override',
    what: 'When an automation system is selected, replaces conventional storage zones with the system\'s footprint + front-end induction area.',
    formula:
      'storage_m² = pallets_or_bins / density_per_unit\n' +
      'robots = ceil(peak_lines_per_hr / robot_throughput)\n' +
      'ports = ceil(robots × port_ratio)\n' +
      'kVA = robots × per_robot_kva + ports × port_kva',
    inputs: [
      'Step 11 conventional storage_m²',
      'Peak throughput',
      'AutomationConfig.system_id',
      'Automation library (per-system density / throughput / kVA)',
    ],
    outputs: [
      '{ systemId, robotCount, portCount, throughputCapacityPerHour, requiredPeakPerHour, meetsThroughput, frontEndAreaM2, estimatedKva, replacedZoneArea, replacedFootprintDelta }',
    ],
    assumptions: [
      'Density is a step function (rounded by physical unit).',
      'Peak throughput is uniform across the day.',
      'Front-end induction area is a fixed multiple of port count.',
    ],
    sensitivity:
      'HIGH — automation can swing footprint −50% to +20% depending on system & SKU mix.',
  },
  {
    id: 'step-14-tornado',
    number: '14',
    title: 'Step 14 · Tornado sensitivity',
    what: 'Runs 17 SPEC §13 parameters at low/high (34 variants) and ranks by weighted footprint + FTE delta.',
    formula:
      'For each parameter P:\n' +
      '  variant_low  = baseline.replace(P, P.low_band)\n' +
      '  variant_high = baseline.replace(P, P.high_band)\n' +
      'weightedDelta = α × footprint_delta + (1 − α) × fte_delta',
    inputs: ['Baseline result', 'OpsProfile.tornadoWeights {α}'],
    outputs: ['34 variants ranked by weightedDelta with feasibility flags'],
    assumptions: [
      'Each parameter swings independently — no covariance modelled.',
      '±25% (or calibrated band) per parameter.',
      'Ranking is sum-weighted, not max — small deltas on multiple metrics rank above a single big delta on one.',
    ],
    sensitivity: 'META — this IS the sensitivity layer.',
  },
];
