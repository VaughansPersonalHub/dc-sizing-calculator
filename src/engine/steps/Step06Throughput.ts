// Step 6 — Throughput.
// SPEC §8 Step 6.
//
// Throughput is sized separately for inbound (driven by inbound pallet
// type) and outbound (driven by outbound pallet type). Repack labour
// kicks in when the two differ. Peak σ pooling uses an SPC correlation
// coefficient (mixed FMCG = 0.3, seasonal grocery = 0.6, fashion = 0.7).

import type { EngineSku, EngineOpsProfile, EnginePallet } from '../models';
import type { SkuProfile } from './Step01Profiling';
import type { ForwardYearProjection } from './Step02ForwardGrowth';
import type { SlotSizingRow } from './Step03SlotSizing';

export interface Step06Inputs {
  skus: EngineSku[];
  profiles: SkuProfile[];
  slotRows: SlotSizingRow[];
  projection: ForwardYearProjection;
  opsProfile: EngineOpsProfile;
  pallets: EnginePallet[];
}

export interface ThroughputDaily {
  /** Inbound pallets per day. */
  inboundPallets: number;
  /** Outbound pallets per day (post-repack). */
  outboundPallets: number;
  /** Total pick lines per day. */
  pickLinesPerDay: number;
  /** Repack pallets per day (subset of outbound where in≠out pallet). */
  repackPallets: number;
  /** Container decant — pallets equivalent if floor-loaded. */
  decantPallets: number;
}

export interface ThroughputPeak {
  inboundPallets: number;
  outboundPallets: number;
  pickLinesPerDay: number;
}

export interface Step06Outputs {
  daily: ThroughputDaily;
  peak: ThroughputPeak;
  /** Pick lines per day grouped by velocity bucket — read by Step 7 labour. */
  pickLinesByVelocity: { A: number; B: number; C: number; D: number };
  /** Pick lines per day grouped by pick method (pallet/case/each). */
  pickLinesByMethod: { pallet: number; case: number; each: number };
}

export function runStep06Throughput(inputs: Step06Inputs): Step06Outputs {
  const ops = inputs.opsProfile;
  const palletById = new Map(inputs.pallets.map((p) => [p.pallet_id, p]));
  const slotById = new Map(inputs.slotRows.map((s) => [s.skuId, s]));
  const profileById = new Map(inputs.profiles.map((p) => [p.skuId, p]));

  let dailyInboundPallets = 0;
  let dailyOutboundPallets = 0;
  let dailyPickLines = 0;
  let dailyRepack = 0;
  let dailyDecant = 0;

  const byVelocity: { A: number; B: number; C: number; D: number } = { A: 0, B: 0, C: 0, D: 0 };
  const byMethod: { pallet: number; case: number; each: number } = { pallet: 0, case: 0, each: 0 };

  for (let i = 0; i < inputs.skus.length; i++) {
    const sku = inputs.skus[i];
    const profile = profileById.get(sku.id);
    const slot = slotById.get(sku.id);
    if (!profile || !slot) continue;

    const annual = inputs.projection.projectedAnnualUnits[i] ?? profile.mu * 52;
    const daily = annual / Math.max(1, ops.operatingDaysPerYear);

    const casesPerInboundPallet = sku.palletTi * sku.palletHi;
    const unitsPerInboundPallet = Math.max(1, casesPerInboundPallet * sku.caseQty);

    const outboundPal = palletById.get(sku.outboundPalletId);
    const inboundPal = palletById.get(sku.inboundPalletId);
    const outboundFactor = outboundPal && inboundPal && outboundPal.pallet_id !== inboundPal.pallet_id
      ? ops.floorloadPalletisationYield // repack rebuilds pallet at lower density
      : 1;
    const unitsPerOutboundPallet = unitsPerInboundPallet * outboundFactor;

    const inboundPallets = daily / unitsPerInboundPallet;
    const outboundPallets = daily / Math.max(1, unitsPerOutboundPallet);

    dailyInboundPallets += inboundPallets;
    dailyOutboundPallets += outboundPallets;

    if (slot.needsRepack) dailyRepack += outboundPallets;
    if (!sku.stackable) dailyDecant += inboundPallets;

    // Pick-line attribution by channel grain.
    const lines = profile.linesPerDay;
    dailyPickLines += lines;
    byVelocity[profile.velocityBucket] += lines;
    byMethod[profile.pickProfile.unitType] += lines;
  }

  const sigmaPool = ops.skuPeakCorrelationCoefficient;
  // Peak demand uplift = peakUplift × σ-pool. Treat correlation as adjustment
  // to the "effective" peak factor: less-correlated SKUs flatten the pool.
  const peakFactor = ops.peakUplift * (1 - sigmaPool * 0.5);

  return {
    daily: {
      inboundPallets: dailyInboundPallets,
      outboundPallets: dailyOutboundPallets,
      pickLinesPerDay: dailyPickLines,
      repackPallets: dailyRepack,
      decantPallets: dailyDecant,
    },
    peak: {
      inboundPallets: dailyInboundPallets * peakFactor,
      outboundPallets: dailyOutboundPallets * peakFactor,
      pickLinesPerDay: dailyPickLines * peakFactor,
    },
    pickLinesByVelocity: byVelocity,
    pickLinesByMethod: byMethod,
  };
}
