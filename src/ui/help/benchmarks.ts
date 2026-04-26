// Phase 10.6a — Industry benchmark dataset.
//
// Drives the BenchmarkChip primitive + the Calibration section in
// HelpDialog (added in 10.6c). Each entry pairs a derived metric with
// the industry-typical band so a sceptical reviewer can see, at a
// glance, whether the engine output sits within the range a published
// benchmark would predict.
//
// The valueFn operates on a small subset of PipelineOutputs (mirrored
// here as BenchmarkInput) so this module stays independent of the
// engine package — adding a field means extending the local interface,
// not threading a new type through src/engine.

export type BenchmarkStatus = 'ok' | 'near' | 'outside';

export interface BenchmarkSource {
  name: string;
  reference: string;
  url?: string;
}

/**
 * Subset of PipelineOutputs consumed by the built-in benchmarks. Mirrors
 * the shape used in ScenariosTab.tsx; kept local so help/ doesn't depend
 * on engine/.
 */
export interface BenchmarkInput {
  step3: { totals: { pfpPositions: number; clsLanes: number } };
  step5: { totalAlignedAreaM2: number };
  step6: { peak: { pickLinesPerDay: number } };
  step7: { totalPeakFte: number };
  step8: { totalUnits: number; totalChargingFootprintM2: number };
  step9: {
    inbound: { blendedCycleMin: number };
    outbound: { blendedCycleMin: number };
  };
  step11: {
    rollup: {
      buildingFootprintGfaM2: number;
      siteCoverageM2: number;
      siteAreaM2: number;
    };
  };
}

export interface Benchmark {
  /** Stable identifier — the BenchmarkChip lookup key. */
  id: string;
  /** Short label rendered inside the chip. */
  label: string;
  /** Display unit suffix (e.g. "m²", "min"). */
  unit: string;
  /** Long-form description shown in the tooltip + Calibration section. */
  description: string;
  /** Industry-typical band; values within are classified 'ok'. */
  band: { low: number; high: number };
  /** Optional explicit value formatter. Defaults to fixed-2 + unit. */
  format?: (v: number) => string;
  /** Compute the metric value; null when not applicable for this run. */
  valueFn: (result: BenchmarkInput) => number | null;
  /** Step explainer id this chip is co-located with on Scenarios. */
  stepExplainerId: string;
  /** Sources backing the band. */
  sources: readonly BenchmarkSource[];
  /** Optional caveats — printed under the band in the tooltip. */
  notes?: string;
}

/**
 * Classify a metric against its band.
 *
 * - ok      → value within [low, high]
 * - near    → value within ±max(15% of band-width, 5% of band.high)
 *             on either side of the band — within reviewer's tolerance
 * - outside → otherwise (red flag)
 */
export function classifyBenchmark(
  value: number,
  band: { low: number; high: number }
): BenchmarkStatus {
  if (value >= band.low && value <= band.high) return 'ok';
  const width = band.high - band.low;
  const tol = Math.max(width * 0.15, band.high * 0.05);
  if (value >= band.low - tol && value <= band.high + tol) return 'near';
  return 'outside';
}

function safeDiv(num: number, den: number): number | null {
  if (!Number.isFinite(num) || !Number.isFinite(den)) return null;
  if (den <= 0) return null;
  return num / den;
}

function pf(v: number, digits = 2): string {
  return v.toFixed(digits);
}

const WERC_REF = 'WERC DC Measures (Warehouse Education and Research Council annual industry benchmark)';
const WERC_URL = 'https://www.werc.org/page/DCMeasures';

export const BENCHMARKS: readonly Benchmark[] = [
  {
    id: 'fte_per_k_lines',
    label: 'FTE / 1k peak lines',
    unit: 'FTE',
    description:
      'Peak-week FTE divided by peak pick lines per day (in thousands). Most-cited single productivity benchmark for B2C / B2B distribution centres. Highly automated DCs sit under the band; manual cross-dock operations sit above.',
    band: { low: 1.5, high: 4.0 },
    format: (v) => `${pf(v, 1)} FTE / 1k`,
    valueFn: (r) => safeDiv(r.step7.totalPeakFte, r.step6.peak.pickLinesPerDay / 1000),
    stepExplainerId: 'step-7-labour',
    sources: [
      { name: 'WERC DC Measures', reference: WERC_REF, url: WERC_URL },
      {
        name: 'MWPVL International benchmarking',
        reference:
          'MWPVL "Distribution Centre Industry Benchmarks" annual review — typical pick-pack DCs sit 2.0–3.5 FTE/1k lines.',
      },
    ],
    notes:
      'AutoStore / shuttle-ASRS deployments commonly come in below 1.5; cross-dock or B2B-heavy operations come in above 4.0 — both are real, not necessarily wrong. Use the chip as a sanity nudge, not a hard gate.',
  },
  {
    id: 'dock_cycle_inbound_min',
    label: 'Inbound dock cycle',
    unit: 'min',
    description:
      'Blended container-mix dock-occupancy time per inbound container. Driven by container split (40HC pal vs floor stack vs 20ft curtain vs cross-dock) and unloading throughput.',
    band: { low: 30, high: 55 },
    format: (v) => `${pf(v, 0)} min`,
    valueFn: (r) => (r.step9.inbound.blendedCycleMin > 0 ? r.step9.inbound.blendedCycleMin : null),
    stepExplainerId: 'step-9-docks',
    sources: [
      {
        name: 'WERC DC Measures',
        reference: 'WERC dock-throughput median 35–50 min/inbound container.',
        url: WERC_URL,
      },
      {
        name: 'CSCMP Annual State of Logistics',
        reference:
          'Council of Supply Chain Management Professionals — typical receiving-dock cycle 30–60 min for blended containers.',
      },
    ],
    notes:
      'Pure cross-dock operations and live-unload curtain-side trailers come in below 30 min; bonded customs or QC-heavy receiving comes in above 60 min.',
  },
  {
    id: 'dock_cycle_outbound_min',
    label: 'Outbound dock cycle',
    unit: 'min',
    description:
      'Blended outbound container loading time. Outbound is typically faster than inbound because product is staged before truck arrival.',
    band: { low: 25, high: 50 },
    format: (v) => `${pf(v, 0)} min`,
    valueFn: (r) => (r.step9.outbound.blendedCycleMin > 0 ? r.step9.outbound.blendedCycleMin : null),
    stepExplainerId: 'step-9-docks',
    sources: [
      {
        name: 'WERC DC Measures',
        reference: 'WERC outbound-dock cycle median 28–45 min/container.',
        url: WERC_URL,
      },
    ],
    notes:
      'Sortation-driven parcel operations (Libiao, conveyor-fed) often run sub-25 min; pallet-build outbound with manual wrap can exceed 50 min.',
  },
  {
    id: 'gfa_per_pallet_position',
    label: 'GFA per pallet position',
    unit: 'm²',
    description:
      'Total building GFA divided by pallet positions (PFP + CLS lanes). Includes storage, dock strip, support areas, soft-space — the all-in cost of housing one pallet.',
    band: { low: 1.5, high: 3.0 },
    format: (v) => `${pf(v, 2)} m² / pos`,
    valueFn: (r) =>
      safeDiv(
        r.step11.rollup.buildingFootprintGfaM2,
        r.step3.totals.pfpPositions + r.step3.totals.clsLanes
      ),
    stepExplainerId: 'step-11-rollup',
    sources: [
      {
        name: 'Prologis / GLP industrial-park benchmarks',
        reference:
          'Industrial-park developer rule-of-thumb: 2.0–2.5 m² GFA per pallet position for VNA / wide-aisle ASEAN logistics.',
      },
      {
        name: 'WERC DC Measures',
        reference: 'WERC building-utilisation benchmarks; modern HBW DCs sit closer to 1.6 m²/pos.',
        url: WERC_URL,
      },
    ],
    notes:
      'Shelving-heavy DCs (high SKU count, low pallet count) sit well above the band — the pallet-position denominator is too small. AutoStore / shuttle systems push below 1.5.',
  },
  {
    id: 'storage_zone_density_m2_per_pallet',
    label: 'Storage zone density',
    unit: 'm²',
    description:
      'Aligned storage-zone area per pallet position (PFP + CLS only). Excludes docks, support, soft-space — pure rack footprint efficiency.',
    band: { low: 0.7, high: 1.3 },
    format: (v) => `${pf(v, 2)} m² / pos`,
    valueFn: (r) =>
      safeDiv(
        r.step5.totalAlignedAreaM2,
        r.step3.totals.pfpPositions + r.step3.totals.clsLanes
      ),
    stepExplainerId: 'step-5-footprint',
    sources: [
      {
        name: 'FEM 9.831 / Interlake racking guidance',
        reference:
          'Wide-aisle selective racking: ~1.0–1.2 m²/pallet position. VNA: 0.7–0.9 m²/pos. Drive-in: 0.5–0.7 m²/pos.',
      },
      {
        name: 'MWPVL rack-density benchmarks',
        reference: 'MWPVL public benchmarking notes on selective vs deep-lane rack density.',
      },
    ],
    notes:
      'Heavily shelving-led DCs read low here too — the engine-aligned-area denominator counts every storage role, but the pallet-position denominator does not. Cross-check the per-zone breakdown on the Layout tab.',
  },
  {
    id: 'site_coverage_pct',
    label: 'Site coverage',
    unit: '%',
    description:
      'Building footprint as a percentage of total site area. Driven by local zoning maximum (typically 50–60% in ASEAN industrial parks).',
    band: { low: 30, high: 60 },
    format: (v) => `${pf(v, 0)} %`,
    valueFn: (r) => {
      const ratio = safeDiv(r.step11.rollup.siteCoverageM2, r.step11.rollup.siteAreaM2);
      return ratio === null ? null : ratio * 100;
    },
    stepExplainerId: 'step-11-rollup',
    sources: [
      {
        name: 'JTC Singapore industrial guidelines',
        reference: 'JTC max plot ratio rules for B2 zoning — typical 40–60% site coverage.',
        url: 'https://www.jtc.gov.sg/',
      },
      {
        name: 'MIDA Malaysia industrial-park guidance',
        reference: 'Malaysian Investment Development Authority typical 50% site-coverage cap for logistics-park lots.',
      },
    ],
    notes:
      'Greenfield deals on oversize lots come in well below 30% — that is a land-acquisition concern, not an engine error. Above 60% trips local zoning in most ASEAN markets.',
  },
  {
    id: 'charging_area_per_mhe',
    label: 'MHE charging / unit',
    unit: 'm²',
    description:
      'Charging-area allowance per MHE unit. Lithium opportunity charging takes the bottom of the band; lead-acid swap stations + spare batteries take the top.',
    band: { low: 8, high: 18 },
    format: (v) => `${pf(v, 1)} m² / unit`,
    valueFn: (r) => safeDiv(r.step8.totalChargingFootprintM2, r.step8.totalUnits),
    stepExplainerId: 'step-8-mhe',
    sources: [
      {
        name: 'OSHA forklift battery handling guidance',
        reference:
          'OSHA 1910.178(g) — typical lead-acid charging-bay footprint 12–18 m² per unit including swap and spare battery.',
      },
      {
        name: 'Crown / Toyota / Jungheinrich technical bulletins',
        reference:
          'Lithium opportunity-charging deployments at 6–10 m²/unit (no battery swap); FCEV stations 15–25 m²/unit incl. H2 cabinet.',
      },
    ],
    notes:
      'Mixed-fleet DCs read mid-band; pure-lithium AMR fleets read at or below 8 m². Above 18 m²/unit usually means the fleet is undersized — chips show what the engine sized, not what you should buy.',
  },
];
