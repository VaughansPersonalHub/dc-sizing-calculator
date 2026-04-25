// Step 5 — Footprint per zone.
// SPEC §8 Step 5.
//
// Per zone:
//   bayWidth   = bay.widthMm + flueSpace.transverseMm
//   aisleWidth = max(mhe.aisleWidthMmMin, sys.aisle.widthMmDefault)
//   baysPerRow = ops preference || sqrt(alignedBays)
//   crossAisles = floor(zoneWidthRaw / crossAisleSpacingMm)
//
// Aisle orientation modes — matches_flow / perpendicular_to_flow / auto_optimize.
// auto_optimize tries both and picks lower total travel.
//
// Column grid alignment:
//   zoneAligned = ceil(raw/grid) × grid
//   gridEfficiency = rawArea / alignedArea

import type { EngineOpsProfile, EngineRackSystem, EngineBuildingEnvelope } from '../models';
import type { Step04Outputs, ZoneAggregation } from './Step04Bays';

export type AisleOrientation = 'matches_flow' | 'perpendicular_to_flow' | 'auto_optimize';

export interface Step05Inputs {
  bays: Step04Outputs;
  rack: EngineRackSystem;
  envelope: EngineBuildingEnvelope;
  ops: EngineOpsProfile;
  mheAisleMmMin?: number;
  orientation?: AisleOrientation;
  baysPerRowOverride?: number;
}

export interface ZoneFootprint {
  zone: string;
  alignedBays: number;
  baysPerRow: number;
  rows: number;
  bayWidthMm: number;
  bayDepthMm: number;
  aisleWidthMm: number;
  crossAisles: number;
  zoneWidthRawM: number;
  zoneDepthRawM: number;
  rawAreaM2: number;
  alignedAreaM2: number;
  gridEfficiency: number;
  orientation: 'matches_flow' | 'perpendicular_to_flow';
}

export interface Step05Outputs {
  zones: ZoneFootprint[];
  totalRawAreaM2: number;
  totalAlignedAreaM2: number;
  averageGridEfficiency: number;
}

export function runStep05Footprint(inputs: Step05Inputs): Step05Outputs {
  const orientation = inputs.orientation ?? 'auto_optimize';
  const candidateZones: ZoneAggregation[] = [
    inputs.bays.pfp,
    inputs.bays.cls,
    inputs.bays.shelfSmall,
    inputs.bays.shelfMedium,
    inputs.bays.shelfLarge,
  ];

  const zones: ZoneFootprint[] = [];
  for (const z of candidateZones) {
    if (z.alignedBays === 0) continue;
    if (orientation === 'auto_optimize') {
      const a = sizeZone(z, inputs, 'matches_flow');
      const b = sizeZone(z, inputs, 'perpendicular_to_flow');
      // Prefer lower aligned area as a proxy for total travel + footprint.
      zones.push(a.alignedAreaM2 <= b.alignedAreaM2 ? a : b);
    } else {
      zones.push(sizeZone(z, inputs, orientation));
    }
  }

  let totalRaw = 0;
  let totalAligned = 0;
  for (const z of zones) {
    totalRaw += z.rawAreaM2;
    totalAligned += z.alignedAreaM2;
  }
  const averageGridEfficiency = totalAligned > 0 ? totalRaw / totalAligned : 1;

  return {
    zones,
    totalRawAreaM2: totalRaw,
    totalAlignedAreaM2: totalAligned,
    averageGridEfficiency,
  };
}

function sizeZone(
  z: ZoneAggregation,
  inputs: Step05Inputs,
  orientation: 'matches_flow' | 'perpendicular_to_flow'
): ZoneFootprint {
  const rack = inputs.rack;
  const ops = inputs.ops;
  const env = inputs.envelope;

  const bayWidthMm = rack.bay.widthMm + rack.flueSpace.transverseMm;
  const bayDepthMm = rack.bay.depthMm * 2 + rack.flueSpace.longitudinalMm; // back-to-back row
  const aisleWidthMm = Math.max(
    inputs.mheAisleMmMin ?? rack.aisle.widthMmMin,
    rack.aisle.widthMmDefault
  );

  const baysPerRow =
    inputs.baysPerRowOverride ?? Math.max(1, Math.round(Math.sqrt(z.alignedBays * (ops.preferredAspectRatio ?? 1.6))));
  const rows = Math.ceil(z.alignedBays / baysPerRow);

  // Pick orientation: matches_flow puts long dimension parallel to dock face;
  // perpendicular_to_flow rotates 90°. We just swap width/depth.
  const widthFactor = orientation === 'matches_flow' ? baysPerRow : rows;
  const depthFactor = orientation === 'matches_flow' ? rows : baysPerRow;

  const zoneWidthRawMm = widthFactor * bayWidthMm;
  const zoneDepthRawMm = depthFactor * (bayDepthMm + aisleWidthMm); // each row pair has its aisle

  const crossAisleSpacingMm = ops.crossAisleSpacingM * 1000;
  const crossAisleWidthMm = ops.crossAisleWidthM * 1000;
  const crossAisles = Math.max(0, Math.floor(zoneWidthRawMm / crossAisleSpacingMm));
  const zoneWidthWithCrossesMm = zoneWidthRawMm + crossAisles * crossAisleWidthMm;

  const zoneWidthRawM = zoneWidthWithCrossesMm / 1000;
  const zoneDepthRawM = zoneDepthRawMm / 1000;
  const rawAreaM2 = zoneWidthRawM * zoneDepthRawM;

  const gridX = env.columnGrid.spacingXM;
  const gridY = env.columnGrid.spacingYM;
  const alignedWidthM = Math.ceil(zoneWidthRawM / gridX) * gridX;
  const alignedDepthM = Math.ceil(zoneDepthRawM / gridY) * gridY;
  const alignedAreaM2 = alignedWidthM * alignedDepthM;
  const gridEfficiency = alignedAreaM2 > 0 ? rawAreaM2 / alignedAreaM2 : 1;

  return {
    zone: z.zone,
    alignedBays: z.alignedBays,
    baysPerRow,
    rows,
    bayWidthMm,
    bayDepthMm,
    aisleWidthMm,
    crossAisles,
    zoneWidthRawM,
    zoneDepthRawM,
    rawAreaM2,
    alignedAreaM2,
    gridEfficiency,
    orientation,
  };
}
