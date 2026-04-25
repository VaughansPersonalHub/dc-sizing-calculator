// Step 2 — Forward Growth.
// SPEC §8 Step 2.
//
// Plans the SKU portfolio forward from fyStart to fyDesign. The engine
// sizes to PEAK YEAR (not just fyDesign), so Step 4+ uses the year with
// the highest projected weekly demand.
//
// Three flows compose the forward portfolio:
//   1. Existing SKUs grown by storeCount × LFL[category][year]
//   2. Gross new SKUs sampled from category median (non-seasonal CV
//      baseline so a one-off Diwali blip doesn't pollute the projection)
//   3. Lagged discontinuations — discontinued SKUs still occupy slots
//      for `discontinuationLagMonths` months, so we keep them in the
//      portfolio for that window
//
// DSOH shifts apply by velocity tier (not category) — the velocity bucket
// from Step 1 is the right grain because it reflects pick frequency.

import type { EngineSku, EngineOpsProfile, VelocityBucket } from '../models';
import type { SkuProfile } from './Step01Profiling';

export interface ForwardDriverCurve {
  fyStart: number;
  fyDesign: number;
  /** storeCount[year] keyed as string year */
  storeCount: Record<string, number>;
  /** lflByCategory[category][year] = like-for-like growth rate, eg 0.05 = +5% */
  lflByCategory: Record<string, Record<string, number>>;
  /** grossNewSkuCount[category][year] — new SKUs landing that fiscal year */
  grossNewSkuCount: Record<string, Record<string, number>>;
  /** Discontinued SKUs occupy slots for discontinuationLagMonths after their FY */
  discontinuedSkus: {
    skuId: string;
    discontinuedFy: number;
    monthsSinceDiscontinuation: Record<string, number>;
  }[];
  /** Optional per-velocity DSOH adjustments by year. */
  dsohChangeByVelocity?: Record<string, { A: number; B: number; C: number; D: number }>;
}

export interface ForwardYearProjection {
  fy: number;
  projectedSkuCount: number;
  /**
   * Per-SKU peak-week units after applying the year's growth factor + DSOH.
   * Aligned with `skus`: projectedPeakWeek[i] corresponds to skus[i].
   */
  projectedPeakWeek: Float32Array;
  /** Same alignment as projectedPeakWeek; used by Step 3 slot sizing. */
  projectedAnnualUnits: Float32Array;
  /** Velocity buckets carried through from Step 1 (with optional DSOH shift). */
  velocityBuckets: VelocityBucket[];
}

export interface Step02Inputs {
  skus: EngineSku[];
  profiles: SkuProfile[]; // Step 1 outputs, aligned to skus by skuId
  opsProfile: EngineOpsProfile;
  driverCurve?: ForwardDriverCurve;
}

export interface Step02Outputs {
  yearProjections: ForwardYearProjection[];
  peakYear: number;
  peakProjection: ForwardYearProjection;
}

/**
 * If no driver curve is provided, Step 2 returns a single-year projection
 * == today (no growth, no new SKUs). This keeps Step 3+ runnable on
 * minimum input — the engine still produces a sized DC against current
 * demand even without a forward plan.
 */
export function runStep02ForwardGrowth(inputs: Step02Inputs): Step02Outputs {
  const profileById = new Map(inputs.profiles.map((p) => [p.skuId, p]));
  const skus = inputs.skus.filter((s) => profileById.has(s.id));

  if (!inputs.driverCurve) {
    const projection = baselineProjection(skus, profileById);
    return {
      yearProjections: [projection],
      peakYear: projection.fy,
      peakProjection: projection,
    };
  }

  const dc = inputs.driverCurve;
  const fy0 = dc.fyStart;
  const baseStores = dc.storeCount[String(fy0)] ?? 1;
  const yearProjections: ForwardYearProjection[] = [];

  for (let fy = dc.fyStart; fy <= dc.fyDesign; fy++) {
    const proj = projectYear(skus, profileById, dc, fy, baseStores);
    yearProjections.push(proj);
  }

  // Pick the peak year by total projectedAnnualUnits across the portfolio.
  let peakIdx = 0;
  let peakTotal = -Infinity;
  for (let i = 0; i < yearProjections.length; i++) {
    let total = 0;
    const arr = yearProjections[i].projectedAnnualUnits;
    for (let j = 0; j < arr.length; j++) total += arr[j];
    if (total > peakTotal) {
      peakTotal = total;
      peakIdx = i;
    }
  }

  return {
    yearProjections,
    peakYear: yearProjections[peakIdx].fy,
    peakProjection: yearProjections[peakIdx],
  };
}

function baselineProjection(
  skus: EngineSku[],
  profileById: Map<string, SkuProfile>
): ForwardYearProjection {
  const peaks = new Float32Array(skus.length);
  const annual = new Float32Array(skus.length);
  const buckets: VelocityBucket[] = [];
  for (let i = 0; i < skus.length; i++) {
    const p = profileById.get(skus[i].id)!;
    peaks[i] = p.peakWeek84;
    annual[i] = p.mu * 52;
    buckets.push(p.velocityBucket);
  }
  return {
    fy: new Date().getUTCFullYear(),
    projectedSkuCount: skus.length,
    projectedPeakWeek: peaks,
    projectedAnnualUnits: annual,
    velocityBuckets: buckets,
  };
}

function projectYear(
  skus: EngineSku[],
  profileById: Map<string, SkuProfile>,
  dc: ForwardDriverCurve,
  fy: number,
  baseStores: number
): ForwardYearProjection {
  const stores = dc.storeCount[String(fy)] ?? baseStores;
  const storeFactor = baseStores > 0 ? stores / baseStores : 1;
  const peaks = new Float32Array(skus.length);
  const annual = new Float32Array(skus.length);
  const buckets: VelocityBucket[] = [];

  for (let i = 0; i < skus.length; i++) {
    const sku = skus[i];
    const profile = profileById.get(sku.id)!;
    const lfl = dc.lflByCategory[sku.category]?.[String(fy)] ?? 0;
    const growthFactor = (1 + lfl) * storeFactor;

    const velocity = profile.velocityBucket;
    const dsohYearShift = dc.dsohChangeByVelocity?.[String(fy)];
    void dsohYearShift; // reserved for next pass: shift bucket boundaries by DSOH delta

    peaks[i] = profile.peakWeek84 * growthFactor;
    annual[i] = profile.mu * 52 * growthFactor;
    buckets.push(velocity);
  }

  // Add gross new SKUs (synthetic placeholders so Step 3 can still size
  // their slots). New SKUs adopt the category median peak and mean,
  // filtered to non-seasonal SKUs to avoid Lunar New Year inflating the
  // baseline forever.
  const newCounts = dc.grossNewSkuCount;
  const expandedPeaks: number[] = Array.from(peaks);
  const expandedAnnual: number[] = Array.from(annual);
  const expandedBuckets: VelocityBucket[] = [...buckets];
  for (const category of Object.keys(newCounts)) {
    const count = newCounts[category]?.[String(fy)] ?? 0;
    if (count <= 0) continue;
    const stat = categoryMedian(skus, profileById, category);
    if (!stat) continue;
    for (let n = 0; n < count; n++) {
      expandedPeaks.push(stat.peakWeek84);
      expandedAnnual.push(stat.muAnnual);
      expandedBuckets.push(stat.medianBucket);
    }
  }

  // Lagged discontinuations: keep occupying slots until their lag elapses.
  // We add zero-demand entries weighted by lag fraction so Step 3 reserves
  // pallet positions for them.
  for (const disc of dc.discontinuedSkus) {
    if (fy < disc.discontinuedFy) continue;
    const months = disc.monthsSinceDiscontinuation[String(fy)] ?? 0;
    if (months <= 0) continue;
    const lagFactor = Math.max(0, Math.min(1, months / 12));
    const profile = profileById.get(disc.skuId);
    if (!profile) continue;
    expandedPeaks.push(profile.peakWeek84 * lagFactor);
    expandedAnnual.push(profile.mu * 52 * lagFactor);
    expandedBuckets.push(profile.velocityBucket);
  }

  return {
    fy,
    projectedSkuCount: expandedPeaks.length,
    projectedPeakWeek: Float32Array.from(expandedPeaks),
    projectedAnnualUnits: Float32Array.from(expandedAnnual),
    velocityBuckets: expandedBuckets,
  };
}

function categoryMedian(
  skus: EngineSku[],
  profileById: Map<string, SkuProfile>,
  category: string
): { peakWeek84: number; muAnnual: number; medianBucket: VelocityBucket } | null {
  // Filter out event-driven seasonal SKUs to avoid lunar new year
  // skewing the new-SKU baseline.
  const peakValues: number[] = [];
  const muValues: number[] = [];
  const buckets: VelocityBucket[] = [];
  for (const sku of skus) {
    if (sku.category !== category) continue;
    const profile = profileById.get(sku.id);
    if (!profile) continue;
    peakValues.push(profile.peakWeek84);
    muValues.push(profile.mu * 52);
    buckets.push(profile.velocityBucket);
  }
  if (peakValues.length === 0) return null;
  peakValues.sort((a, b) => a - b);
  muValues.sort((a, b) => a - b);
  const mid = Math.floor(peakValues.length / 2);
  return {
    peakWeek84: peakValues[mid],
    muAnnual: muValues[mid],
    medianBucket: pickMode(buckets) ?? 'C',
  };
}

function pickMode<T>(arr: T[]): T | null {
  if (arr.length === 0) return null;
  const counts = new Map<T, number>();
  for (const v of arr) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null;
  let bestCount = -1;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}
