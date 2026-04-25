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
  shiftsPerDay: number;
  hoursPerShift: number;

  peakUplift: number;
  sigmaStorage: number;
  percentileDocks: number;
  percentileStaging: number;

  // Step 7 — availability factor method (NOT multiplicative stacking)
  absenteeismPct: number;
  leaveFraction: number;
  sickReliefPct: number;

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
  canopyType: 'columned' | 'cantilever';
  canopyOverhangM: number;
  canopyCoverageExemptMaxM: number;

  maxSiteCoverage: number;
  phase2HorizontalPct: number;
  phase2VerticalPct: number;
  softSpacePct: number;
  clearHeightMm: number;

  ordersPerBatch: number;
  repackSecPerPallet: number;
  repackSecPerUnit: number;

  // Step 10 — support areas
  adminFte: number;
  supervisorFte: number;
  totalStaff: number;
  vasBenches: number;
  returnsRatePct: number;
  returnsHandleTimeHours: number;
  qcSampleRate: number;
  qcDwellHours: number;
  avgDgSkuFootprintM2: number;
  dgMultiplier: number;
  packerThroughput: number;
  amenitiesArea: number;
  trainingAreaM2: number;
  firstAidAreaM2: number;

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
  /** Per-temperature zone areas (m²) for Step 10 support areas. */
  coldChain: {
    ambientZoneM2: number;
    chilledZoneM2: number;
    frozenZoneM2: number;
    antechamberRequired: boolean;
    antechamberM2: number;
  };
  /** Customs / bonded zone params for Step 10. */
  customsBonded: { required: boolean; holdAreaPct: number; fencedCageM2: number };
  /** Mezzanine availability for Step 4.5 remediation suggestion. */
  mezzanine: { available: boolean; tiers: number; perTierMaxM2: number[] };
  /** Backup-power info for Step 10 (lithium kVA buffer + Indonesia mandate). */
  power: { backupGeneratorKva: number; gridReliabilityHoursPerDay: number };
}

// MHE class — Step 8 fleet sizing.
export interface EngineMheClass {
  mhe_id: string;
  category: string;
  travelSpeedKph: number;
  liftSpeedMpm: number;
  liftHeightMmMax: number;
  battery: {
    type: 'lead_acid_swap' | 'lithium_opportunity' | 'fuel_cell' | 'none';
    chargingFootprintM2PerUnit: number;
    swapStationM2: number;
    chargingKva: number;
  };
  utilisationTargetDefault: number;
  /** Optional: ratePerTaskPerHour overrides (e.g. VNA with 28 putaway/hr). */
  ratePerTaskPerHour?: Record<string, number>;
}

// Productivity cell — Step 7 labour. Pulled from the productivity library.
export interface EngineProductivityCell {
  method: string;
  unitType: string; // 'pallet' | 'case' | 'each'
  slotType: string; // 'PFP' | 'CLS' | 'Shelf' | 'Auto'
  staticTimeSecPerUnit: number;
  travelModelType: TravelModelType;
  travelCoefficient: number;
  baselineZoneAreaM2: number;
  derivedRateAtBaseline: number;
  vnaLiftSpeedMpm?: number;
  shuttleTransferSec?: number;
  craneHorizontalSpeedMps?: number;
  craneLiftSpeedMps?: number;
  pickDepositSec?: number;
  g2pPortWalkDistanceM?: number;
}

// Region-scoped context that the engine reads but isn't part of opsProfile.
// Drives Surau sizing, Ramadan derate, halal uplift, etc.
export interface EngineRegionalContext {
  regionId: string;
  officeM2PerFte: number;
  surauRequired: boolean;
  muslimWorkforcePct: number;
  ramadanDerate: { active: boolean; factor: number; days: number };
  backupGeneratorMandatory: boolean;
}
