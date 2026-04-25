// Step 4 — Aggregate to Bays. Plus the mandatory gates 4.5 (clear height)
// and 4.6 (seismic mass).
// SPEC §8 Steps 4, 4.5, 4.6.

import type { EngineOpsProfile, EngineRackSystem, EnginePallet, EngineBuildingEnvelope } from '../models';
import type { SlotSizingTotals } from './Step03SlotSizing';

export interface Step04Inputs {
  totals: SlotSizingTotals;
  rack: EngineRackSystem;
  ops: EngineOpsProfile;
}

export interface Step04Outputs {
  pfp: ZoneAggregation;
  cls: ZoneAggregation;
  shelfSmall: ZoneAggregation;
  shelfMedium: ZoneAggregation;
  shelfLarge: ZoneAggregation;
}

export interface ZoneAggregation {
  zone: string;
  rawSlots: number;
  slotsPerBay: number;
  rawBays: number;
  alignedBays: number;
  structuralBayBlock: number;
}

export function runStep04Bays(inputs: Step04Inputs): Step04Outputs {
  const { totals, rack } = inputs;
  return {
    pfp: aggregate('PFP', totals.pfpPositions, rack.slotsPerBay, rack.structuralBayBlock),
    // CLS bays: one bay = ~6 lanes wide * levelsDefault. Approx 6.
    cls: aggregate('CLS', totals.clsLanes, 6, rack.structuralBayBlock),
    // Shelf bays approximate one bay per 30 small / 12 medium / 4 large positions.
    shelfSmall: aggregate('Shelf-S', totals.shelfPositionsSmall, 30, rack.structuralBayBlock),
    shelfMedium: aggregate('Shelf-M', totals.shelfPositionsMedium, 12, rack.structuralBayBlock),
    shelfLarge: aggregate('Shelf-L', totals.shelfPositionsLarge, 4, rack.structuralBayBlock),
  };
}

function aggregate(
  zone: string,
  rawSlots: number,
  slotsPerBay: number,
  blockSize: number
): ZoneAggregation {
  const rawBays = rawSlots > 0 ? Math.ceil(rawSlots / Math.max(1, slotsPerBay)) : 0;
  const alignedBays = roundUpToBlock(rawBays, blockSize);
  return { zone, rawSlots, slotsPerBay, rawBays, alignedBays, structuralBayBlock: blockSize };
}

function roundUpToBlock(n: number, block: number): number {
  if (n <= 0 || block <= 1) return n;
  return Math.ceil(n / block) * block;
}

// ---------------------------------------------------------------------------
// Step 4.5 — Clear Height Violation (MANDATORY GATE)
// ---------------------------------------------------------------------------

export interface ClearHeightInputs {
  bays: Step04Outputs;
  rack: EngineRackSystem;
  inboundPallet: EnginePallet;
  envelope: EngineBuildingEnvelope;
  ops: EngineOpsProfile;
  /** Average load height on a pallet (mm). When omitted, pallet-height proxy. */
  assignedLoadHeightMm?: number;
  /** Bays per row in a typical aisle layout. */
  baysPerRow?: number;
}

export interface ClearHeightResult {
  palletHeightMm: number;
  levelsRequired: number;
  requiredRackHeightMm: number;
  usableRackHeightMm: number;
  shortfallLevels: number;
  ok: boolean;
  /** Both options the user can take when ok=false. */
  remediation: {
    footprintExpansionFactor: number;
    mezzanineRequiredM2?: number;
    slabLoadingTPerM2: number;
  };
}

export function runStep4_5ClearHeight(inputs: ClearHeightInputs): ClearHeightResult {
  const baysPerRow = inputs.baysPerRow ?? 30;
  const totalAlignedBays =
    inputs.bays.pfp.alignedBays +
    inputs.bays.cls.alignedBays +
    inputs.bays.shelfSmall.alignedBays +
    inputs.bays.shelfMedium.alignedBays +
    inputs.bays.shelfLarge.alignedBays;

  const palletHeightMm =
    inputs.inboundPallet.dimensionsMm.height + (inputs.assignedLoadHeightMm ?? 1500);

  // Levels needed for the racked positions, given the rack's default per-row.
  const levelsRequired = Math.max(
    inputs.rack.levelsDefault,
    Math.ceil(totalAlignedBays / baysPerRow / inputs.rack.levelsDefault)
  );

  const requiredRackHeightMm =
    inputs.rack.bottomBeamClearanceMm +
    levelsRequired * (palletHeightMm + inputs.rack.beamThicknessMm) +
    inputs.envelope.clearHeights.sprinklerClearanceM * 1000;

  const usableRackHeightMm = inputs.envelope.clearHeights.usableRackM * 1000;
  const ok = requiredRackHeightMm <= usableRackHeightMm;
  const shortfallLevels = ok
    ? 0
    : Math.ceil((requiredRackHeightMm - usableRackHeightMm) / (palletHeightMm + inputs.rack.beamThicknessMm));

  // If we need to drop levels, we need more bays to compensate. Footprint
  // expansion factor approximates the extra floor area required.
  const footprintExpansionFactor = ok ? 1 : levelsRequired / Math.max(1, levelsRequired - shortfallLevels);

  return {
    palletHeightMm,
    levelsRequired,
    requiredRackHeightMm,
    usableRackHeightMm,
    shortfallLevels,
    ok,
    remediation: {
      footprintExpansionFactor,
      slabLoadingTPerM2: inputs.envelope.floor.slabLoadingTPerM2,
    },
  };
}

// ---------------------------------------------------------------------------
// Step 4.6 — Seismic Mass Check
// ---------------------------------------------------------------------------

export interface SeismicMassInputs {
  bays: Step04Outputs;
  rack: EngineRackSystem;
  envelope: EngineBuildingEnvelope;
  /** Average pallet weight (kg) for the engagement; pallets and load stacked. */
  avgPalletWeightKg: number;
  /** Seismic coefficient (Cs) per the rack's design category. */
  seismicCoefficient: number;
}

export interface SeismicMassResult {
  totalRackMassKg: number;
  totalPalletMassKg: number;
  totalLoadedMassKg: number;
  seismicMassT: number;
  allowableMassT: number;
  ok: boolean;
  maxSafeLevels: number;
  remediation: 'reduce_levels' | 'upgrade_slab' | 'upgrade_anchorage' | 'none';
}

export function runStep4_6SeismicMass(inputs: SeismicMassInputs): SeismicMassResult {
  const totalAlignedBays =
    inputs.bays.pfp.alignedBays +
    inputs.bays.cls.alignedBays +
    inputs.bays.shelfSmall.alignedBays +
    inputs.bays.shelfMedium.alignedBays +
    inputs.bays.shelfLarge.alignedBays;
  const positions = totalAlignedBays * inputs.rack.slotsPerBay * inputs.rack.levelsDefault;
  const totalRackMassKg = positions * inputs.rack.rackMassKgPerPosition;
  const totalPalletMassKg = positions * inputs.avgPalletWeightKg;
  const totalLoadedMassKg = totalRackMassKg + totalPalletMassKg;
  const seismicMassT = (totalLoadedMassKg * inputs.seismicCoefficient) / 1000;

  // Allowable seismic load per slab: slabLoading is t/m² static; we permit
  // `allowableRatio` of that for seismic actions per SPEC §8 Step 4.6.
  const allowableMassT =
    inputs.envelope.floor.slabLoadingTPerM2 *
    inputs.envelope.floor.totalFloorAreaM2 *
    inputs.envelope.seismic.allowableRatio;

  const ok = seismicMassT <= allowableMassT;

  // If exceeded, work backwards: how many levels could we run safely?
  const safeLevels = ok
    ? inputs.rack.levelsDefault
    : Math.max(
        1,
        Math.floor(
          (allowableMassT * 1000) /
            (inputs.seismicCoefficient *
              totalAlignedBays *
              inputs.rack.slotsPerBay *
              (inputs.rack.rackMassKgPerPosition + inputs.avgPalletWeightKg))
        )
      );

  let remediation: SeismicMassResult['remediation'] = 'none';
  if (!ok) {
    if (safeLevels < inputs.rack.levelsDefault) remediation = 'reduce_levels';
    else if (inputs.envelope.seismic.designCategory.startsWith('D')) remediation = 'upgrade_anchorage';
    else remediation = 'upgrade_slab';
  }

  return {
    totalRackMassKg,
    totalPalletMassKg,
    totalLoadedMassKg,
    seismicMassT,
    allowableMassT,
    ok,
    maxSafeLevels: safeLevels,
    remediation,
  };
}
