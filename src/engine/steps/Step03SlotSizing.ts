// Step 3 — Slot Sizing (Mixed Pallet, Forward/Reserve Split, Weight Check)
// SPEC §8 Step 3.
//
// Per SKU we branch by slot type (PFP / CLS / Shelf), size the slot, and
// derive total positions including honeycombing. Output: per-SKU slot
// requirement that Step 4 aggregates to bays.
//
// Three flavours:
//
// PFP — pick from pallet
//   slot dims          = inbound pallet footprint
//   unitsPerOutboundPal = palletTi × palletHi × caseQty × outboundFactor
//   peakInventoryPallets = ceil(peakWeek × dsohDays / 7 / unitsPerOutboundPal)
//   forwardPositions   = forwardFaceDsoh[velocity] × peakInventoryPallets
//   reservePositions   = peakInventoryPallets − forwardPositions
//   total positions    = (forward + reserve) ÷ (vhc × hhc)
//   weight check       = slotsPerBay × palletWeight vs maxLoadPerBeamPairKg
//
// CLS — carton live storage
//   laneDepthMm        = casesNeededInLane × caseDepthMm / fillFactor
//   casesNeededInLane  = peakWeeklyCases × replenCycle / 7
//
// Shelf — small-item bin
//   pickFaceCubeCm3    = peakWeek × unitCube × dsohDays / 7
//   shelf slot picked  = small/medium/large by cube
//
// Repack adder fires when inboundPallet ≠ outboundPallet (handled by
// Step 6 throughput calc; flagged here only).

import type { EngineSku, EngineOpsProfile, EnginePallet, EngineRackSystem, SlotType } from '../models';
import type { SkuProfile } from './Step01Profiling';
import type { ForwardYearProjection } from './Step02ForwardGrowth';

export interface Step03Inputs {
  skus: EngineSku[];
  profiles: SkuProfile[];
  projection: ForwardYearProjection; // peak-year output of Step 2
  opsProfile: EngineOpsProfile;
  pallets: EnginePallet[];
  racks: EngineRackSystem[];
  /** Optional override: which rack system to use for PFP pallets. */
  preferredPfpRackId?: string;
}

export interface SlotSizingRow {
  skuId: string;
  slotType: SlotType;
  velocityBucket: 'A' | 'B' | 'C' | 'D';

  // PFP fields
  unitsPerOutboundPallet: number;
  peakInventoryPallets: number;
  forwardPositions: number;
  reservePositions: number;
  totalPositionsBeforeHoneycomb: number;
  totalPositionsWithHoneycomb: number;

  // CLS fields
  clsLaneDepthMm?: number;
  clsLanes?: number;

  // Shelf fields
  pickFaceCubeCm3?: number;
  shelfSize?: 'small' | 'medium' | 'large';

  // Pallet weight check (PFP)
  palletWeightKg: number;
  weightExceedsBeamPair: boolean;
  weightExceedsSinglePallet: boolean;

  // Repack flag — read by Step 6
  needsRepack: boolean;
}

export interface SlotSizingTotals {
  pfpPositions: number;
  clsLanes: number;
  shelfPositionsSmall: number;
  shelfPositionsMedium: number;
  shelfPositionsLarge: number;
  weightWarnings: number;
  repackSkus: number;
}

export interface Step03Outputs {
  rows: SlotSizingRow[];
  totals: SlotSizingTotals;
  rack: EngineRackSystem; // The PFP rack the engine selected (or override)
}

const SHELF_SMALL_CM3 = 5_000;
const SHELF_MEDIUM_CM3 = 30_000;

export function runStep03SlotSizing(inputs: Step03Inputs): Step03Outputs {
  const palletById = new Map(inputs.pallets.map((p) => [p.pallet_id, p]));
  const profileById = new Map(inputs.profiles.map((p) => [p.skuId, p]));
  const rack = pickRack(inputs.racks, inputs.preferredPfpRackId);

  const rows: SlotSizingRow[] = [];
  const totals: SlotSizingTotals = {
    pfpPositions: 0,
    clsLanes: 0,
    shelfPositionsSmall: 0,
    shelfPositionsMedium: 0,
    shelfPositionsLarge: 0,
    weightWarnings: 0,
    repackSkus: 0,
  };

  for (let i = 0; i < inputs.skus.length; i++) {
    const sku = inputs.skus[i];
    const profile = profileById.get(sku.id);
    if (!profile) continue;

    // Use the projected peak for slot sizing — we're sizing for the
    // peak-year design year, not today.
    const projectedPeakWeek = inputs.projection.projectedPeakWeek[i] ?? profile.peakWeek84;
    const slotType: SlotType = sku.slotTypeOverride ?? deriveSlotType(sku, profile, projectedPeakWeek);

    const inboundPal = palletById.get(sku.inboundPalletId);
    const outboundPal = palletById.get(sku.outboundPalletId);
    const needsRepack = inboundPal && outboundPal
      ? inboundPal.pallet_id !== outboundPal.pallet_id
      : false;
    if (needsRepack) totals.repackSkus += 1;

    if (slotType === 'PFP') {
      const row = sizePfp({ sku, profile, projectedPeakWeek, ops: inputs.opsProfile, rack, inboundPal, outboundPal, needsRepack });
      rows.push(row);
      totals.pfpPositions += row.totalPositionsWithHoneycomb;
      if (row.weightExceedsBeamPair || row.weightExceedsSinglePallet) totals.weightWarnings += 1;
    } else if (slotType === 'CLS') {
      const row = sizeCls({ sku, profile, projectedPeakWeek, ops: inputs.opsProfile, needsRepack });
      rows.push(row);
      totals.clsLanes += row.clsLanes ?? 0;
    } else {
      // Shelf
      const row = sizeShelf({ sku, projectedPeakWeek, ops: inputs.opsProfile, needsRepack });
      rows.push(row);
      if (row.shelfSize === 'small') totals.shelfPositionsSmall += 1;
      else if (row.shelfSize === 'medium') totals.shelfPositionsMedium += 1;
      else totals.shelfPositionsLarge += 1;
    }
  }

  return { rows, totals, rack };
}

interface PfpInputs {
  sku: EngineSku;
  profile: SkuProfile;
  projectedPeakWeek: number;
  ops: EngineOpsProfile;
  rack: EngineRackSystem;
  inboundPal?: EnginePallet;
  outboundPal?: EnginePallet;
  needsRepack: boolean;
}

function sizePfp(p: PfpInputs): SlotSizingRow {
  const sku = p.sku;
  const casesPerPallet = Math.max(1, sku.palletTi * sku.palletHi);
  const unitsPerOutboundPallet = casesPerPallet * sku.caseQty;

  const dsohDays = p.ops.dsohDays;
  const peakInventoryUnits = (p.projectedPeakWeek * dsohDays) / 7;
  const peakInventoryPallets = Math.ceil(peakInventoryUnits / Math.max(1, unitsPerOutboundPallet));

  const forwardFace = p.ops.forwardFaceDsohDays[p.profile.velocityBucket];
  const forwardPositions = Math.max(
    forwardFace > 0 ? Math.ceil((p.projectedPeakWeek * forwardFace) / 7 / unitsPerOutboundPallet) : 0,
    0
  );
  const reservePositions = Math.max(0, peakInventoryPallets - forwardPositions);
  const totalBeforeHoneycomb = forwardPositions + reservePositions;
  const totalWithHoneycomb = Math.ceil(
    totalBeforeHoneycomb / (p.rack.honeycombing.verticalFactor * p.rack.honeycombing.horizontalDefault)
  );

  // Per-pallet weight + beam-pair check
  const palletWeightKg = unitsPerOutboundPallet * sku.unitWeightKg;
  const totalOnBeamPair = p.rack.slotsPerBay * palletWeightKg;
  const weightExceedsBeamPair = totalOnBeamPair > p.rack.load.maxLoadPerBeamPairKg * 1.0;
  const weightExceedsSinglePallet = palletWeightKg > p.rack.load.maxSinglePalletKg * 1.0;

  return {
    skuId: sku.id,
    slotType: 'PFP',
    velocityBucket: p.profile.velocityBucket,
    unitsPerOutboundPallet,
    peakInventoryPallets,
    forwardPositions,
    reservePositions,
    totalPositionsBeforeHoneycomb: totalBeforeHoneycomb,
    totalPositionsWithHoneycomb: totalWithHoneycomb,
    palletWeightKg,
    weightExceedsBeamPair,
    weightExceedsSinglePallet,
    needsRepack: p.needsRepack,
  };
}

interface ClsInputs {
  sku: EngineSku;
  profile: SkuProfile;
  projectedPeakWeek: number;
  ops: EngineOpsProfile;
  needsRepack: boolean;
}

function sizeCls(p: ClsInputs): SlotSizingRow {
  const sku = p.sku;
  const peakWeeklyCases = p.projectedPeakWeek / Math.max(1, sku.caseQty);
  const replenCycleDays = Math.max(1, p.ops.replenTriggerDays * 14);
  const casesNeededInLane = (peakWeeklyCases * replenCycleDays) / 7;
  // Approximate case footprint: a 24-pack with 1000 cm³ unit cube ≈ 24 L
  // → ~30×40×20 cm. We treat caseDepth as cube^(1/3) when not provided.
  const caseDepthMm = Math.cbrt(sku.unitCubeCm3 * sku.caseQty) * 10;
  const laneDepthMm = (casesNeededInLane * caseDepthMm) / Math.max(0.5, p.ops.clsLaneFillFactor);
  const lanes = Math.max(1, Math.ceil(laneDepthMm / 3000)); // cap any single lane at 3 m

  return {
    skuId: sku.id,
    slotType: 'CLS',
    velocityBucket: p.profile.velocityBucket,
    unitsPerOutboundPallet: 0,
    peakInventoryPallets: 0,
    forwardPositions: 0,
    reservePositions: 0,
    totalPositionsBeforeHoneycomb: 0,
    totalPositionsWithHoneycomb: 0,
    clsLaneDepthMm: laneDepthMm,
    clsLanes: lanes,
    palletWeightKg: 0,
    weightExceedsBeamPair: false,
    weightExceedsSinglePallet: false,
    needsRepack: p.needsRepack,
  };
}

interface ShelfInputs {
  sku: EngineSku;
  projectedPeakWeek: number;
  ops: EngineOpsProfile;
  needsRepack: boolean;
}

function sizeShelf(p: ShelfInputs): SlotSizingRow {
  const sku = p.sku;
  const pickFaceCube = (p.projectedPeakWeek * sku.unitCubeCm3 * p.ops.dsohDays) / 7;
  const size: 'small' | 'medium' | 'large' =
    pickFaceCube < SHELF_SMALL_CM3 ? 'small' : pickFaceCube < SHELF_MEDIUM_CM3 ? 'medium' : 'large';

  return {
    skuId: sku.id,
    slotType: 'Shelf',
    // velocity isn't used for shelf, but we still pass a value to align rows
    velocityBucket: 'D',
    unitsPerOutboundPallet: 0,
    peakInventoryPallets: 0,
    forwardPositions: 0,
    reservePositions: 0,
    totalPositionsBeforeHoneycomb: 1,
    totalPositionsWithHoneycomb: 1,
    pickFaceCubeCm3: pickFaceCube,
    shelfSize: size,
    palletWeightKg: 0,
    weightExceedsBeamPair: false,
    weightExceedsSinglePallet: false,
    needsRepack: p.needsRepack,
  };
}

function deriveSlotType(
  sku: EngineSku,
  profile: SkuProfile,
  projectedPeakWeek: number
): SlotType {
  // Unit-cube heuristic + velocity. Tiny items go to shelf, big-pallet
  // movers stay on PFP, medium-velocity case-pick goes to CLS.
  if (sku.unitCubeCm3 < 1500 && profile.pickProfile.unitType === 'each') return 'Shelf';
  if (profile.pickProfile.unitType === 'case' && projectedPeakWeek > 0) return 'CLS';
  return 'PFP';
}

function pickRack(racks: EngineRackSystem[], preferredId?: string): EngineRackSystem {
  if (preferredId) {
    const found = racks.find((r) => r.system_id === preferredId);
    if (found) return found;
  }
  // Default: first selective rack that supports PFP, else first rack at all.
  const selective = racks.find(
    (r) => r.slotTypeCompat.includes('PFP') && r.densityRating === 'low'
  );
  return selective ?? racks[0];
}
