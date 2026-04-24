import { z } from 'zod';
import { SlotTypeSchema } from './sku';
import { RegionIdSchema } from './regional';

/* ================================================================== */
/*  Rack library                                                        */
/* ================================================================== */
export const RackSystemSchema = z.object({
  system_id: z.string(),
  name: z.string(),
  category: z.string(),
  supplier_refs: z.array(z.string()).default([]),
  bay: z.object({
    widthMm: z.number(),
    depthMm: z.number(),
    heightMmDefault: z.number(),
    heightMmRange: z.tuple([z.number(), z.number()]),
  }),
  slotsPerBay: z.number().int().positive(),
  levelsDefault: z.number().int().positive(),
  load: z.object({
    perLevelKg: z.number(),
    maxLoadPerBeamPairKg: z.number(),
    maxSinglePalletKg: z.number(),
  }),
  aisle: z.object({
    widthMmMin: z.number(),
    widthMmDefault: z.number(),
    crossAisleMm: z.number(),
  }),
  flueSpace: z.object({
    transverseMm: z.number(),
    longitudinalMm: z.number(),
  }),
  bottomBeamClearanceMm: z.number(),
  beamThicknessMm: z.number(),
  minPresentationPallets: z.number().int().nonnegative(),
  honeycombing: z.object({
    verticalFactor: z.number(),
    horizontalDefault: z.number(),
  }),
  fillFactor: z.number(),
  slotVolumeM3: z.number(),
  slotTypeCompat: z.array(SlotTypeSchema),
  storageType: z.string(),
  densityRating: z.enum(['low', 'medium', 'high', 'very_high']),
  seismic: z.object({
    designCategory: z.string(),
    soilClassRating: z.string(),
    importanceLevel: z.number(),
    anchorageRequired: z.boolean(),
    bracingPattern: z.string(),
  }),
  structuralBayBlock: z.number().int().positive().default(1),
  rackMassKgPerPosition: z.number(),
  costPerPalletPositionUsd: z.number().optional(),
  variants: z
    .array(
      z.object({
        id: z.string(),
        depthMm: z.number(),
        casesPerLane: z.number(),
      })
    )
    .optional(),
  notes: z.string().optional(),
});
export type RackSystem = z.infer<typeof RackSystemSchema>;

/* ================================================================== */
/*  MHE library                                                         */
/* ================================================================== */
export const MheClassSchema = z.object({
  mhe_id: z.string(),
  name: z.string(),
  category: z.string(),
  aisleWidthMmMin: z.number(),
  aisleWidthMmDefault: z.number(),
  aisleTransferWidthMm: z.number().default(0),
  endOfAisleTurnaroundMm: z.number().default(0),
  liftHeightMmMax: z.number(),
  travelSpeedKph: z.number(),
  liftSpeedMpm: z.number(),
  ratePerTaskPerHour: z.record(z.string(), z.number()).optional(),
  battery: z.object({
    type: z.enum(['lead_acid_swap', 'lithium_opportunity', 'fuel_cell', 'none']),
    chargingFootprintM2PerUnit: z.number().default(0),
    swapStationM2: z.number().default(0),
    chargingKva: z.number().default(0),
  }),
  utilisationTargetDefault: z.number(),
  usefulLifeYears: z.number().optional(),
  operatorCertification: z.string().optional(),
  notes: z.string().optional(),
});
export type MheClass = z.infer<typeof MheClassSchema>;

/* ================================================================== */
/*  Productivity library                                                */
/* ================================================================== */
export const TravelModelTypeSchema = z.enum([
  'sqrt_area',
  'sequential_hv',
  'shuttle_cycle',
  'crane_cycle',
  'g2p_port',
  'amr_fleet',
  'zero',
]);
export type TravelModelType = z.infer<typeof TravelModelTypeSchema>;

export const ProductivityCellSchema = z.object({
  id: z.number().int().optional(),
  method: z.string(),
  unitType: z.string(),
  slotType: z.string(),
  staticTimeSecPerUnit: z.number(),
  travelModelType: TravelModelTypeSchema,
  travelCoefficient: z.number(),
  baselineZoneAreaM2: z.number(),
  derivedRateAtBaseline: z.number(),
  rateRange: z
    .object({
      low_p25: z.number(),
      median: z.number(),
      high_p75: z.number(),
    })
    .optional(),
  densityAssumption: z.string().optional(),
  source: z.string(),
  wercPercentileReference: z.string().optional(),
  confidence: z.enum(['heuristic', 'validated', 'engagement_calibrated']),
  vnaLiftSpeedMpm: z.number().optional(),
  shuttleTransferSec: z.number().optional(),
  craneHorizontalSpeedMps: z.number().optional(),
  craneLiftSpeedMps: z.number().optional(),
  pickDepositSec: z.number().optional(),
  g2pPortWalkDistanceM: z.number().optional(),
  engagementOverrides: z
    .record(z.string(), z.object({ rate: z.number(), notes: z.string().optional() }))
    .default({}),
});
export type ProductivityCell = z.infer<typeof ProductivityCellSchema>;

/* ================================================================== */
/*  Building library                                                    */
/* ================================================================== */
export const BuildingTemplateSchema = z.object({
  building_id: z.string(),
  name: z.string(),
  regionProfile: RegionIdSchema,
  envelope: z.object({
    lengthM: z.number(),
    widthM: z.number(),
    totalFootprintM2: z.number(),
    polygonVertices: z
      .array(z.object({ x: z.number(), y: z.number() }))
      .nullable()
      .default(null),
    obstacles: z.array(z.unknown()).default([]),
  }),
  site: z.object({
    totalSiteM2: z.number(),
    maxBuildingCoveragePct: z.number(),
    minYardM2: z.number(),
  }),
  clearHeights: z.object({
    eavesM: z.number(),
    apexM: z.number(),
    sprinklerClearanceM: z.number(),
    usableRackM: z.number(),
  }),
  columnGrid: z.object({
    spacingXM: z.number(),
    spacingYM: z.number(),
    columnWidthMm: z.number(),
    pattern: z.string(),
  }),
  floor: z.object({
    slabLoadingTPerM2: z.number(),
    flatnessClass: z.string(),
    jointPattern: z.string(),
    drainageSlopePct: z.number(),
    totalFloorAreaM2: z.number(),
  }),
  seismic: z.object({
    designCategory: z.string(),
    soilClass: z.string(),
    importanceLevel: z.number(),
    allowableRatio: z.number(),
  }),
  typhoon: z.object({
    designWindSpeedKmh: z.number(),
    claddingRating: z.string(),
    roofAnchorageEnhanced: z.boolean(),
  }),
  monsoon: z.object({
    plinthHeightM: z.number(),
    floodReturnPeriodYears: z.number(),
    drainageCapacityMmPerHr: z.number(),
  }),
  fire: z.object({
    sprinklerClass: z.string(),
    inRackSprinklers: z.boolean(),
    egressTravelDistanceMaxM: z.number(),
    compartmentMaxM2: z.number(),
  }),
  docks: z.object({
    existingDoorsInbound: z.number(),
    existingDoorsOutbound: z.number(),
    dockLevelerType: z.string(),
    canopyDepthM: z.number(),
  }),
  mezzanine: z.object({
    available: z.boolean(),
    tiers: z.number().int(),
    perTierSlabLoadKgPerM2: z.array(z.number()),
    perTierClearHeightM: z.array(z.number()),
    perTierMaxM2: z.array(z.number()),
    goodsLiftCapacityKg: z.number(),
    goodsLiftCount: z.number().int(),
  }),
  office: z.object({
    existingM2: z.number(),
    mezzanineAvailable: z.boolean(),
    mezzanineMaxM2: z.number(),
  }),
  power: z.object({
    gridReliabilityHoursPerDay: z.number(),
    backupGeneratorKva: z.number(),
    backupAutonomyHrs: z.number(),
    upsForWmsKva: z.number(),
  }),
  coldChain: z.object({
    ambientZoneM2: z.number(),
    chilledZoneM2: z.number(),
    chilledSetpointC: z.number(),
    frozenZoneM2: z.number(),
    frozenSetpointC: z.number(),
    antechamberRequired: z.boolean(),
    antechamberM2: z.number(),
    airlockRequired: z.boolean(),
    dehumidificationAllowancePct: z.number(),
    insulationPanelMm: z.number(),
  }),
  customsBonded: z.object({
    required: z.boolean(),
    holdAreaPct: z.number(),
    fencedCageM2: z.number(),
    dedicatedDockLane: z.boolean(),
  }),
  notes: z.string().optional(),
});
export type BuildingTemplate = z.infer<typeof BuildingTemplateSchema>;

/* ================================================================== */
/*  Pallet library                                                      */
/* ================================================================== */
export const PalletStandardSchema = z.object({
  pallet_id: z.string(),
  name: z.string(),
  region: z.array(z.string()),
  dimensionsMm: z.object({
    length: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  maxLoadKg: z.number(),
  emptyWeightKg: z.number(),
  typicalCubeM3: z.number(),
  fitsContainer40ftHc: z.number().int(),
  fitsContainer20ft: z.number().int(),
  isoReference: z.string().optional(),
});
export type PalletStandard = z.infer<typeof PalletStandardSchema>;

/* ================================================================== */
/*  Automation library                                                  */
/* ================================================================== */
export const AutomationSystemSchema = z.object({
  system_id: z.string(),
  name: z.string(),
  category: z.enum([
    'g2p_cubic',
    'g2p_shelf',
    'acr_case',
    'case_picking',
    'pallet_shuttle',
    'mini_load_asrs',
    'pallet_agv',
    'sortation',
  ]),
  supplier_refs: z.array(z.string()).default([]),
  typicalDensity: z.object({
    unit: z.string(), // bins/m², cases/m², pallets/m²
    value: z.number(),
  }),
  throughputPerRobotPerHour: z.number().optional(),
  throughputPerAislePerHour: z.number().optional(),
  throughputPerHour: z.number().optional(),
  defaultPackingEfficiency: z.number().default(0.82),
  notes: z.string().optional(),
});
export type AutomationSystem = z.infer<typeof AutomationSystemSchema>;
