// Phase 10.7.4 — Provenance entries for the most-load-bearing
// engine outputs.
//
// Each entry pairs an output id (e.g. "step-7.totalPeakFte") with the
// step explainer it descends from + a tight "derived from" sentence
// callable in the popover. The popover renders the derivation inline
// so a reviewer can click any output number and see HOW the engine
// arrived at it without opening the StepExplainer card. Sensitivity
// is reused from the StepExplainer; there's no separate copy here so
// edits stay in one place.

export interface ProvenanceEntry {
  /** Stable output id — used as the React key + popover heading. */
  id: string;
  /** Friendly display label for the output. */
  label: string;
  /** Step explainer this output descends from. */
  stepExplainerId: string;
  /**
   * Inputs that drove this specific value. May be a subset of the
   * step's full inputs list — e.g. peakFte uses peak throughput +
   * productivity + Ramadan, not the bays output.
   */
  inputs: readonly string[];
  /** One-sentence derivation in plain English. */
  derivation: string;
  /** Optional citation topic from CITATIONS — links into the source. */
  citationTopic?: string;
}

export const PROVENANCE: readonly ProvenanceEntry[] = [
  {
    id: 'step-7.totalPeakFte',
    label: 'Peak FTE',
    stepExplainerId: 'step-7-labour',
    inputs: [
      'Step 6 peak pick-lines per day',
      'Productivity factor (ops profile)',
      'Travel model (sqrt area / shuttle / AMR / etc.)',
      'Availability factor (absenteeism + leave + breaks)',
      'Ramadan annual derate (MY/ID)',
    ],
    derivation:
      'Peak pick-lines and inbound/outbound flows split by category, divided by per-category productivity (lines/hour) with the travel model applied; result divided by the availability factor.',
    citationTopic: 'Walking pick speed',
  },
  {
    id: 'step-11.buildingFootprintGfaM2',
    label: 'Building GFA',
    stepExplainerId: 'step-11-rollup',
    inputs: [
      'Step 5 storage zone area (or Step 12 automation zone)',
      'Step 9 dock + staging area',
      'Step 10 support area (incl. Surau, customs, halal uplift)',
      'Soft-space allowance (ops profile)',
    ],
    derivation:
      'operationalM² × (1 + halal uplift) + officeAndAmenitiesM² + softSpace; canopy is added separately based on the in-coverage rule.',
  },
  {
    id: 'step-11.siteAreaM2',
    label: 'Site area',
    stepExplainerId: 'step-11-rollup',
    inputs: [
      'Site coverage cap (regional default, e.g. 50 % for ASEAN B2 zoning)',
      'Step 11 site coverage area (GFA + canopy when counted)',
    ],
    derivation:
      'siteCoverageM² ÷ maxSiteCoverageRatio. Sets the lot size required for the engagement to be feasible inside the local zoning cap.',
  },
  {
    id: 'step-9.inbound.blendedCycleMin',
    label: 'Inbound dock cycle',
    stepExplainerId: 'step-9-docks',
    inputs: [
      'Container mix (40HC pal/floor, 20ft pal/floor, curtain, cross-dock, van)',
      'Per-container cycle times from the ops profile',
    ],
    derivation:
      'Blended weighted average across the inbound container split. Cross-dock containers shorten the average; QC/decant + bonded customs lengthen it.',
    citationTopic: 'Container packing — 40HC pal/floor',
  },
  {
    id: 'step-9.totalDoors',
    label: 'Total doors',
    stepExplainerId: 'step-9-docks',
    inputs: [
      'Step 6 daily inbound + outbound containers',
      'Step 9 blended cycle min',
      'Door percentile target (default p95)',
    ],
    derivation:
      'inbound + outbound, each computed independently as containers × blendedCycleMin ÷ available door-minutes per day, sized to the percentile target.',
  },
  {
    id: 'step-5.totalAlignedAreaM2',
    label: 'Aligned storage area',
    stepExplainerId: 'step-5-footprint',
    inputs: [
      'Step 4 aligned bays (per zone)',
      'Per-zone bay footprint (rack library)',
      'Cross-aisle + main-aisle allowance (regional)',
    ],
    derivation:
      'Sum of (aligned bays × bay footprint) per zone, with cross-aisle and main-aisle allowances added per the regional defaults.',
    citationTopic: 'SCDF cross-aisle / fire compartment',
  },
  {
    id: 'step-3.pfpPositions',
    label: 'PFP positions',
    stepExplainerId: 'step-3-slot-sizing',
    inputs: [
      'Step 1 ABC class + cube velocity per SKU',
      'Forward DSOH days (per A/B/C bucket)',
      'Pallet library + pallet config per SKU',
    ],
    derivation:
      'Each forward-allocated SKU gets one or more PFP positions sized to its forward DSOH × daily cube velocity. Reserves are sized separately as CLS or shelf positions.',
    citationTopic: 'DSOH per channel × velocity',
  },
  {
    id: 'step-8.totalUnits',
    label: 'MHE fleet size',
    stepExplainerId: 'step-8-mhe',
    inputs: [
      'Step 7 labour / MHE class allocation',
      'Per-MHE class throughput (rack library)',
      'Per-MHE class available hours (battery chemistry)',
      'Utilisation target (ops profile)',
    ],
    derivation:
      'Per MHE class: required machine-hours / available hours / utilisation target, rounded up. Lithium opportunity charging gives 22h/day; lead-acid swap penalises 15-20%.',
  },
  {
    id: 'step-10.totalSupportM2',
    label: 'Support area',
    stepExplainerId: 'step-10-support',
    inputs: [
      'Office (m²/FTE × peak FTE)',
      'Surau + ablution (≥40 muslim staff trigger)',
      'Customs (bonded engagements only)',
      'VAS, returns, QC, DG, pack bench, empty-pallet, waste',
      'Halal uplift factor',
    ],
    derivation:
      'Sum of operational support (battery + VAS + returns + QC + ...) and office + amenities. Halal-certified engagements multiply the operational portion by the uplift factor.',
    citationTopic: 'Surau (prayer room) ratio',
  },
  {
    id: 'step-2.peakYear',
    label: 'Peak year',
    stepExplainerId: 'step-2-growth',
    inputs: ['Year-1 baseline demand (Step 1 totals)', 'Compound growth rate (ops profile)', 'Design horizon years (ops profile)'],
    derivation:
      'argmax of year_demand[1..horizon] where year_demand[n] = baseline × (1 + growthRate)^n. The peak year drives all downstream sizing.',
  },
  {
    id: 'step-6.peak.pickLinesPerDay',
    label: 'Peak pick lines',
    stepExplainerId: 'step-6-throughput',
    inputs: [
      'Step 1 average daily pick lines',
      'Peak uplift factor (ops profile)',
      'CV (driven by SKU peakedness)',
      'SKU peak correlation coefficient',
    ],
    derivation:
      'peak = avg × (1 + peakUpliftFactor × blendedCV). Correlation coefficient < 1 reduces blended CV when SKUs do not all peak together.',
    citationTopic: 'Peak uplift CV factor',
  },
];

export function findProvenance(outputId: string): ProvenanceEntry | undefined {
  return PROVENANCE.find((p) => p.id === outputId);
}
