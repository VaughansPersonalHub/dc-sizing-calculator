// Phase 6 — Step 14 Tornado generator.
// SPEC §8 Step 14: 17 curated params × {low, high} variants of the
// baseline. Each variant is a ScenarioOverride. Results are ranked by
// weighted delta:
//   weightedDelta = wFootprint × |ΔFootprint| + wFte × |ΔFte|
// with defaults 0.5 / 0.5 (per SPEC).
//
// Design notes:
// - All 17 params are opsProfile patches in v1; envelope/library tweaks
//   (max rack height, channel mix delta, driver-curve LFL) come later
//   when the supporting overrides land in PipelineInputs.
// - Ranking is computed against the supplied baseline result, not against
//   each variant's own pair — pivots are the standard tornado convention.
// - We expose generateTornadoVariants() separately from runTornado() so
//   the UI can preview the variant list without spawning workers.

import type { ScenarioOverride, ScenarioRunSummary } from './scenarioRunner';
import { runScenarios } from './scenarioRunner';
import type { PipelineInputs, PipelineOutputs } from './pipeline';

export interface TornadoWeights {
  footprint: number;
  fte: number;
}

const DEFAULT_WEIGHTS: TornadoWeights = { footprint: 0.5, fte: 0.5 };

export interface TornadoParam {
  /** Stable identifier (peak_uplift, dsoh, productivity, ...). */
  id: string;
  /** Human-readable label. */
  label: string;
  /** Build the patch for the low / high variant from the baseline. */
  buildLow: (baseline: PipelineInputs) => ScenarioOverride['patch'];
  buildHigh: (baseline: PipelineInputs) => ScenarioOverride['patch'];
  /** Friendly delta annotation for the UI ("±20%", "±5pp"). */
  deltaLabel: string;
}

/**
 * The 17 SPEC tornado params, in the order they're listed in §8 Step 14.
 * Each param produces a {low, high} pair → 34 variants.
 */
export const TORNADO_PARAMS: TornadoParam[] = [
  {
    id: 'peak_factor',
    label: 'Peak factor',
    deltaLabel: '±20%',
    buildLow: (b) => ({ opsProfile: { peakUplift: round3(b.opsProfile.peakUplift * 0.8) } }),
    buildHigh: (b) => ({ opsProfile: { peakUplift: round3(b.opsProfile.peakUplift * 1.2) } }),
  },
  {
    id: 'dsoh',
    label: 'DSOH days (global)',
    deltaLabel: '±20%',
    buildLow: (b) => ({ opsProfile: { dsohDays: round1(b.opsProfile.dsohDays * 0.8) } }),
    buildHigh: (b) => ({ opsProfile: { dsohDays: round1(b.opsProfile.dsohDays * 1.2) } }),
  },
  {
    id: 'productivity',
    label: 'Productivity factor',
    deltaLabel: '±15%',
    buildLow: (b) => ({ opsProfile: { productivityFactor: round3(b.opsProfile.productivityFactor * 0.85) } }),
    buildHigh: (b) => ({ opsProfile: { productivityFactor: round3(b.opsProfile.productivityFactor * 1.15) } }),
  },
  {
    id: 'absenteeism',
    label: 'Absenteeism',
    deltaLabel: '±25%',
    buildLow: (b) => ({ opsProfile: { absenteeismPct: round3(b.opsProfile.absenteeismPct * 0.75) } }),
    buildHigh: (b) => ({ opsProfile: { absenteeismPct: round3(b.opsProfile.absenteeismPct * 1.25) } }),
  },
  {
    id: 'leave',
    label: 'Leave fraction',
    deltaLabel: '±25%',
    buildLow: (b) => ({ opsProfile: { leaveFraction: round3(b.opsProfile.leaveFraction * 0.75) } }),
    buildHigh: (b) => ({ opsProfile: { leaveFraction: round3(b.opsProfile.leaveFraction * 1.25) } }),
  },
  {
    id: 'soft_space',
    label: 'Soft space',
    deltaLabel: '10% ↔ 30%',
    buildLow: () => ({ opsProfile: { softSpacePct: 0.1 } }),
    buildHigh: () => ({ opsProfile: { softSpacePct: 0.3 } }),
  },
  {
    id: 'floor_load_yield',
    label: 'Floor-load palletisation yield',
    deltaLabel: '±10pp',
    buildLow: (b) => ({
      opsProfile: { floorloadPalletisationYield: clamp(b.opsProfile.floorloadPalletisationYield - 0.1, 0.5, 1) },
    }),
    buildHigh: (b) => ({
      opsProfile: { floorloadPalletisationYield: clamp(b.opsProfile.floorloadPalletisationYield + 0.1, 0.5, 1) },
    }),
  },
  {
    id: 'forward_dsoh_a',
    label: 'Forward DSOH (A bucket)',
    deltaLabel: '±0.5 day',
    buildLow: (b) => ({
      opsProfile: {
        forwardFaceDsohDays: { ...b.opsProfile.forwardFaceDsohDays, A: Math.max(0, b.opsProfile.forwardFaceDsohDays.A - 0.5) },
      },
    }),
    buildHigh: (b) => ({
      opsProfile: {
        forwardFaceDsohDays: { ...b.opsProfile.forwardFaceDsohDays, A: b.opsProfile.forwardFaceDsohDays.A + 0.5 },
      },
    }),
  },
  {
    id: 'forward_dsoh_b',
    label: 'Forward DSOH (B bucket)',
    deltaLabel: '±0.5 day',
    buildLow: (b) => ({
      opsProfile: {
        forwardFaceDsohDays: { ...b.opsProfile.forwardFaceDsohDays, B: Math.max(0, b.opsProfile.forwardFaceDsohDays.B - 0.5) },
      },
    }),
    buildHigh: (b) => ({
      opsProfile: {
        forwardFaceDsohDays: { ...b.opsProfile.forwardFaceDsohDays, B: b.opsProfile.forwardFaceDsohDays.B + 0.5 },
      },
    }),
  },
  {
    id: 'hhc',
    label: 'Horizontal honeycombing',
    deltaLabel: '±5pp',
    buildLow: (b) => ({
      opsProfile: { horizontalHoneycombingFactor: clamp(b.opsProfile.horizontalHoneycombingFactor - 0.05, 0.5, 1) },
    }),
    buildHigh: (b) => ({
      opsProfile: { horizontalHoneycombingFactor: clamp(b.opsProfile.horizontalHoneycombingFactor + 0.05, 0.5, 1) },
    }),
  },
  {
    id: 'pick_method',
    label: 'Pick method (voice ↔ RF)',
    deltaLabel: 'voice ↔ RF',
    // ordersPerBatch ≥ 5 routes Step 7 to voice; < 5 routes to rf_scan.
    buildLow: () => ({ opsProfile: { ordersPerBatch: 1 } }),
    buildHigh: () => ({ opsProfile: { ordersPerBatch: 10 } }),
  },
  {
    id: 'grid_efficiency',
    label: 'Grid efficiency threshold',
    deltaLabel: '±5pp',
    buildLow: (b) => ({
      opsProfile: { gridEfficiencyThreshold: clamp(b.opsProfile.gridEfficiencyThreshold - 0.05, 0.5, 1) },
    }),
    buildHigh: (b) => ({
      opsProfile: { gridEfficiencyThreshold: clamp(b.opsProfile.gridEfficiencyThreshold + 0.05, 0.5, 1) },
    }),
  },
  {
    id: 'clear_height',
    label: 'Clear height (target)',
    deltaLabel: '±20%',
    buildLow: (b) => ({ opsProfile: { clearHeightMm: round1(b.opsProfile.clearHeightMm * 0.8) } }),
    buildHigh: (b) => ({ opsProfile: { clearHeightMm: round1(b.opsProfile.clearHeightMm * 1.2) } }),
  },
  {
    id: 'peak_correlation',
    label: 'Peak correlation coefficient',
    deltaLabel: '0.1 ↔ 0.6',
    buildLow: () => ({ opsProfile: { skuPeakCorrelationCoefficient: 0.1 } }),
    buildHigh: () => ({ opsProfile: { skuPeakCorrelationCoefficient: 0.6 } }),
  },
  {
    id: 'aspect_ratio',
    label: 'Preferred aspect ratio',
    deltaLabel: '1.2 ↔ 2.0',
    buildLow: () => ({ opsProfile: { preferredAspectRatio: 1.2 } }),
    buildHigh: () => ({ opsProfile: { preferredAspectRatio: 2.0 } }),
  },
  {
    id: 'cross_aisle',
    label: 'Cross-aisle spacing',
    deltaLabel: '18 m ↔ 28 m',
    buildLow: () => ({ opsProfile: { crossAisleSpacingM: 18 } }),
    buildHigh: () => ({ opsProfile: { crossAisleSpacingM: 28 } }),
  },
  {
    id: 'canopy_allowance',
    label: 'Canopy allowance',
    deltaLabel: '5% ↔ 18%',
    buildLow: () => ({ opsProfile: { canopyAllowancePct: 0.05 } }),
    buildHigh: () => ({ opsProfile: { canopyAllowancePct: 0.18 } }),
  },
];

export interface TornadoVariantSet {
  /** 34 overrides — one low + one high per param. */
  overrides: ScenarioOverride[];
  /** Pair index: paramId → { lowId, highId } so the runner can stitch
   *  results back into low/high pairs after the run. */
  pairs: { paramId: string; label: string; deltaLabel: string; lowId: string; highId: string }[];
}

/**
 * Builds the 34 ScenarioOverrides (17 params × low/high) and a stitching
 * map for the result aggregator.
 */
export function generateTornadoVariants(baseline: PipelineInputs): TornadoVariantSet {
  const overrides: ScenarioOverride[] = [];
  const pairs: TornadoVariantSet['pairs'] = [];
  for (const param of TORNADO_PARAMS) {
    const lowId = `${param.id}_low`;
    const highId = `${param.id}_high`;
    overrides.push({
      id: lowId,
      label: `${param.label} (low)`,
      group: param.id,
      patch: param.buildLow(baseline),
    });
    overrides.push({
      id: highId,
      label: `${param.label} (high)`,
      group: param.id,
      patch: param.buildHigh(baseline),
    });
    pairs.push({ paramId: param.id, label: param.label, deltaLabel: param.deltaLabel, lowId, highId });
  }
  return { overrides, pairs };
}

export interface TornadoRow {
  paramId: string;
  label: string;
  deltaLabel: string;
  /** Footprint delta (m²) for low / high vs baseline. */
  footprintDelta: { low: number; high: number };
  /** Peak FTE delta vs baseline. */
  fteDelta: { low: number; high: number };
  /** Feasibility flags for both ends. */
  feasibility: { low: boolean; high: boolean };
  /** Weighted delta = w_f×max(|ΔFootprint|) + w_fte×max(|ΔFte|) — used
   *  for ranking. The bigger the swing, the higher the rank. */
  weightedDelta: number;
}

export interface TornadoResult {
  baseline: { footprintM2: number; peakFte: number };
  rows: TornadoRow[];
  summary: ScenarioRunSummary;
  feasibleVariantCount: number;
  infeasibleVariantCount: number;
}

export interface RunTornadoOptions {
  weights?: TornadoWeights;
  poolSize?: number;
  workerFactory?: () => Worker;
  onProgress?: (current: number, total: number, id: string) => void;
}

/**
 * Drive the tornado: run the baseline + 34 variants and return ranked
 * sensitivities. The baseline result must be supplied (the engine should
 * already have run it) — that way we don't waste a worker turn.
 */
export async function runTornado(
  baseline: PipelineInputs,
  baselineResult: PipelineOutputs,
  skuIds: string[],
  baselineDemand: Float32Array,
  opts: RunTornadoOptions = {}
): Promise<TornadoResult> {
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const variantSet = generateTornadoVariants(baseline);

  const summary = await runScenarios(baseline, skuIds, baselineDemand, variantSet.overrides, {
    poolSize: opts.poolSize,
    workerFactory: opts.workerFactory,
    onProgress: opts.onProgress,
  });

  const baselineFootprint = baselineResult.step11.rollup.buildingFootprintGfaM2;
  const baselineFte = baselineResult.step7.totalPeakFte;

  const byId = new Map(summary.scenarios.map((s) => [s.id, s]));
  const rows: TornadoRow[] = variantSet.pairs.map((pair) => {
    const low = byId.get(pair.lowId);
    const high = byId.get(pair.highId);
    const lowFp = low ? low.result.step11.rollup.buildingFootprintGfaM2 - baselineFootprint : 0;
    const highFp = high ? high.result.step11.rollup.buildingFootprintGfaM2 - baselineFootprint : 0;
    const lowFte = low ? low.result.step7.totalPeakFte - baselineFte : 0;
    const highFte = high ? high.result.step7.totalPeakFte - baselineFte : 0;
    const weightedDelta =
      weights.footprint * Math.max(Math.abs(lowFp), Math.abs(highFp)) +
      weights.fte * Math.max(Math.abs(lowFte), Math.abs(highFte));
    return {
      paramId: pair.paramId,
      label: pair.label,
      deltaLabel: pair.deltaLabel,
      footprintDelta: { low: lowFp, high: highFp },
      fteDelta: { low: lowFte, high: highFte },
      feasibility: { low: low?.feasible ?? false, high: high?.feasible ?? false },
      weightedDelta,
    };
  });

  // Rank by weighted delta descending — biggest swings on top.
  rows.sort((a, b) => b.weightedDelta - a.weightedDelta);

  return {
    baseline: { footprintM2: baselineFootprint, peakFte: baselineFte },
    rows,
    summary,
    feasibleVariantCount: summary.feasibleCount,
    infeasibleVariantCount: summary.infeasibleCount,
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
