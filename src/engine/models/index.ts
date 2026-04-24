/**
 * Shared enums / types used by both the main thread and workers.
 * Keep this module dependency-free so workers can import it cheaply.
 */
export type SlotType = 'PFP' | 'CLS' | 'Shelf' | 'Auto';
export type VelocityBucket = 'A' | 'B' | 'C' | 'D';
export type TravelModelType =
  | 'sqrt_area'
  | 'sequential_hv'
  | 'shuttle_cycle'
  | 'crane_cycle'
  | 'g2p_port'
  | 'amr_fleet'
  | 'zero';

// Engine-side SKU shape. Demand stays as Float32Array — this is the core
// value of the engine (52-week demand vector, transferable across the
// worker boundary). Fields are a projection of the larger schemas/sku
// SkuRecord, stripped of validation baggage for hot-loop work.
export interface EngineSku {
  id: string;
  category: string;
  subCategory?: string;
  weeklyUnits: Float32Array; // length 52
  weeksOnFile: number;

  unitCubeCm3: number;
  unitWeightKg: number;
  caseQty: number;

  inboundPalletId: string;
  outboundPalletId: string;
  palletTi: number;
  palletHi: number;
  stackable: boolean;

  tempClass: 'ambient' | 'chilled' | 'frozen' | 'controlled';
  halalStatus: 'halal' | 'non-halal' | 'pork' | 'alcohol' | 'unclassified';

  channelMix: {
    retailB2bPct: number;
    ecomDtcPct: number;
    marketplacePct: number;
  };

  slotTypeOverride?: SlotType;
  velocityOverride?: VelocityBucket;
}

// Narrowed OpsProfile view the engine actually reads. This is pulled from
// the full OpsProfile by pipeline.ts before sending to the worker, so the
// worker doesn't need every single knob when it only reads a handful.
export interface EngineOpsProfile {
  operatingDaysPerYear: number;
  productivityFactor: number;
  productiveHoursPerDay: number;

  peakUplift: number;
  sigmaStorage: number;

  horizontalHoneycombingFactor: number;
  gridEfficiencyThreshold: number;
  preferredAspectRatio: number;

  skuPeakCorrelationCoefficient: number;
  floorloadPalletisationYield: number;

  dsohDays: number;
  forwardFaceDsohDays: { A: number; B: number; C: number; D: number };
  dsohChangeByVelocity: { A: number; B: number; C: number; D: number };

  paretoBreakpoints: { A: number; B: number; C: number; D: number };
  replenTriggerDays: number;
  clsLaneFillFactor: number;

  crossAisleSpacingM: number;
  crossAisleWidthM: number;

  canopyAllowancePct: number;
  maxSiteCoverage: number;
  phase2HorizontalPct: number;
  phase2VerticalPct: number;
  softSpacePct: number;
  clearHeightMm: number;

  ordersPerBatch: number;
  repackSecPerPallet: number;

  palletFootprintM2: number;
}

export interface EnginePallet {
  pallet_id: string;
  dimensionsMm: { length: number; width: number; height: number };
  maxLoadKg: number;
}

export interface EngineRackSystem {
  system_id: string;
  bay: { widthMm: number; depthMm: number; heightMmDefault: number };
  slotsPerBay: number;
  levelsDefault: number;
  load: { perLevelKg: number; maxLoadPerBeamPairKg: number; maxSinglePalletKg: number };
  aisle: { widthMmMin: number; widthMmDefault: number; crossAisleMm: number };
  flueSpace: { transverseMm: number; longitudinalMm: number };
  bottomBeamClearanceMm: number;
  beamThicknessMm: number;
  honeycombing: { verticalFactor: number; horizontalDefault: number };
  fillFactor: number;
  slotTypeCompat: SlotType[];
  densityRating: 'low' | 'medium' | 'high' | 'very_high';
  structuralBayBlock: number;
  rackMassKgPerPosition: number;
}

export interface EngineBuildingEnvelope {
  clearHeights: { usableRackM: number; sprinklerClearanceM: number };
  floor: { slabLoadingTPerM2: number; totalFloorAreaM2: number };
  seismic: { designCategory: string; allowableRatio: number };
  columnGrid: { spacingXM: number; spacingYM: number };
}
