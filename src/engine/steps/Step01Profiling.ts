// Step 1 — SKU Profiling & Omnichannel Decomposition.
// SPEC §8 Step 1.
//
// Per SKU, compute:
//   mu, sigma, cv                          (weekly mean / stdev / coefficient of variation)
//   seasonalityIndex                       (peak-week / mean ratio)
//   peakWeek84, peakWeek95, peakWeek99     (percentile peak weekly units)
//   cubeVelocityCm3PerDay                  (throughput cube per day)
//   linesPerDay                            (pick lines per day by channel)
//   channelVolumes                         (retailB2b, ecomDtc, marketplace)
//   pickProfile                            (method + unitType from channel mix + opsProfile)
//   velocityBucket                         (A/B/C/D via Pareto on lines/day)
//   confidenceFlag                         ('clean' | 'partial_history')
//
// The function is a pure array->array transform. Velocity bucket is
// assigned in a second pass (it needs the full distribution to compute
// Pareto cumulative share).

import type { EngineSku, EngineOpsProfile, VelocityBucket } from '../models';

export interface SkuProfile {
  skuId: string;
  mu: number;
  sigma: number;
  cv: number;
  seasonalityIndex: number;
  peakWeek84: number;
  peakWeek95: number;
  peakWeek99: number;
  cubeVelocityCm3PerDay: number;
  linesPerDay: number;
  channelVolumes: { retailB2b: number; ecomDtc: number; marketplace: number };
  pickProfile: { method: PickMethod; unitType: PickUnitType };
  velocityBucket: VelocityBucket;
  confidenceFlag: 'clean' | 'partial_history';
}

export type PickMethod =
  | 'pallet_vna'
  | 'pallet_reach'
  | 'case_rf'
  | 'case_voice'
  | 'each_pick'
  | 'g2p_port';

export type PickUnitType = 'pallet' | 'case' | 'each';

export interface Step01Inputs {
  skus: EngineSku[];
  opsProfile: EngineOpsProfile;
  suppressed: Set<string>;
}

export interface Step01Outputs {
  profiles: SkuProfile[];
  // Pareto summary exposed so Step 3 slot sizing can read category stats
  // without walking the array again.
  totals: {
    totalLinesPerDay: number;
    totalCubeVelocityCm3PerDay: number;
    countByVelocity: Record<VelocityBucket, number>;
  };
}

const PARTIAL_HISTORY_WEEKS = 26;

export function runStep01Profiling(inputs: Step01Inputs): Step01Outputs {
  const ops = inputs.opsProfile;
  const workingSkus = inputs.skus.filter((s) => !inputs.suppressed.has(s.id));

  // Pass 1 — per-SKU profile, missing only the velocity bucket.
  const partials: (Omit<SkuProfile, 'velocityBucket'> & { _linesPerDay: number })[] = [];
  for (const sku of workingSkus) {
    partials.push(profileOne(sku, ops));
  }

  // Pass 2 — assign velocity buckets by Pareto on linesPerDay.
  const sorted = partials
    .map((p, idx) => ({ idx, linesPerDay: p._linesPerDay }))
    .sort((a, b) => b.linesPerDay - a.linesPerDay);

  const totalLines = sorted.reduce((s, p) => s + p.linesPerDay, 0);
  const breakA = ops.paretoBreakpoints.A;
  const breakB = ops.paretoBreakpoints.B;
  const breakC = ops.paretoBreakpoints.C;

  const buckets: VelocityBucket[] = Array(partials.length).fill('D');
  if (totalLines > 0) {
    // Pareto bucketing: A contains the SKUs whose cumulative volume
    // accounts for the top `breakA` share. The SKU that crosses the A/B
    // boundary stays in A — measure `shareBefore`, not `shareAfter`, so
    // the top SKU is never stranded in D just because it alone exceeds
    // the A threshold.
    let cum = 0;
    for (const row of sorted) {
      const shareBefore = cum / totalLines;
      cum += row.linesPerDay;
      if (shareBefore < breakA) buckets[row.idx] = 'A';
      else if (shareBefore < breakB) buckets[row.idx] = 'B';
      else if (shareBefore < breakC) buckets[row.idx] = 'C';
      else buckets[row.idx] = 'D';
    }
  }

  const profiles: SkuProfile[] = partials.map((p, idx) => {
    const override = workingSkus[idx].velocityOverride;
    const velocityBucket: VelocityBucket = override ?? buckets[idx];
    const { _linesPerDay: _lpd, ...profile } = p;
    void _lpd;
    return { ...profile, velocityBucket };
  });

  const countByVelocity: Record<VelocityBucket, number> = { A: 0, B: 0, C: 0, D: 0 };
  let totalCube = 0;
  for (const p of profiles) {
    countByVelocity[p.velocityBucket] += 1;
    totalCube += p.cubeVelocityCm3PerDay;
  }

  return {
    profiles,
    totals: {
      totalLinesPerDay: totalLines,
      totalCubeVelocityCm3PerDay: totalCube,
      countByVelocity,
    },
  };
}

function profileOne(
  sku: EngineSku,
  ops: EngineOpsProfile
): Omit<SkuProfile, 'velocityBucket'> & { _linesPerDay: number } {
  const weekly = sku.weeklyUnits;
  let sum = 0;
  for (let i = 0; i < 52; i++) sum += weekly[i];
  const mu = sum / 52;

  let variance = 0;
  for (let i = 0; i < 52; i++) {
    const d = weekly[i] - mu;
    variance += d * d;
  }
  const sigma = Math.sqrt(variance / 52);
  const cv = mu > 0 ? sigma / mu : 0;

  // Peak-week percentiles. Sort a scratch array once.
  const sortedWeeks = Array.from(weekly).sort((a, b) => a - b);
  const peakWeek84 = quantile(sortedWeeks, 0.84);
  const peakWeek95 = quantile(sortedWeeks, 0.95);
  const peakWeek99 = quantile(sortedWeeks, 0.99);
  const seasonalityIndex = mu > 0 ? peakWeek84 / mu : 1;

  // Daily views.
  const annualUnits = sum * (ops.operatingDaysPerYear / 364);
  const daily = annualUnits / ops.operatingDaysPerYear;
  const cubeVelocityCm3PerDay = daily * sku.unitCubeCm3;

  // Pick lines by channel. Retail/B2B is pallet-grain (1 line per
  // ~casesPerPallet cases), ecom-DTC is each-pick, marketplace is case-pick.
  const casesPerPallet = Math.max(1, sku.palletTi * sku.palletHi);
  const retailDaily = daily * sku.channelMix.retailB2bPct;
  const ecomDaily = daily * sku.channelMix.ecomDtcPct;
  const marketplaceDaily = daily * sku.channelMix.marketplacePct;
  const retailLines = retailDaily / (casesPerPallet * sku.caseQty);
  const ecomLines = ecomDaily; // each-pick → 1 line per unit
  const marketplaceLines = marketplaceDaily / sku.caseQty;
  const linesPerDay = retailLines + ecomLines + marketplaceLines;

  // Pick profile — dominant channel picks the method, secondary picks the unit.
  const pickProfile = derivePickProfile(sku.channelMix);

  return {
    skuId: sku.id,
    mu,
    sigma,
    cv,
    seasonalityIndex,
    peakWeek84,
    peakWeek95,
    peakWeek99,
    cubeVelocityCm3PerDay,
    linesPerDay,
    channelVolumes: {
      retailB2b: retailDaily * ops.operatingDaysPerYear,
      ecomDtc: ecomDaily * ops.operatingDaysPerYear,
      marketplace: marketplaceDaily * ops.operatingDaysPerYear,
    },
    pickProfile,
    confidenceFlag:
      sku.weeksOnFile > 0 && sku.weeksOnFile < PARTIAL_HISTORY_WEEKS
        ? 'partial_history'
        : 'clean',
    _linesPerDay: linesPerDay,
  };
}

function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const pos = (sortedAsc.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sortedAsc[base + 1] ?? sortedAsc[base];
  return sortedAsc[base] + rest * (next - sortedAsc[base]);
}

function derivePickProfile(cm: EngineSku['channelMix']): {
  method: PickMethod;
  unitType: PickUnitType;
} {
  // Dominant channel decides grain. Thresholds intentionally overlapping
  // — if one channel > 60% we treat it as single-grain; otherwise mixed
  // falls back to case-pick.
  if (cm.retailB2bPct >= 0.6) return { method: 'pallet_reach', unitType: 'pallet' };
  if (cm.ecomDtcPct >= 0.6) return { method: 'each_pick', unitType: 'each' };
  if (cm.marketplacePct >= 0.6) return { method: 'case_rf', unitType: 'case' };
  // Mixed — default to case RF as the middle-ground grain.
  return { method: 'case_rf', unitType: 'case' };
}
