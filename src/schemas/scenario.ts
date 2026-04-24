import { z } from 'zod';

export const OpsProfileSchema = z.object({
  engagementId: z.string(),
  regionProfile: z.string(),

  operatingDaysPerYear: z.number().int().positive().default(300),
  shiftsPerDay: z.number().int().positive().default(2),
  hoursPerShift: z.number().positive().default(10),
  breakAllowanceMinutesPerDay: z.number().nonnegative().default(40),
  productivityFactor: z.number().positive().default(0.82),
  absenteeismPct: z.number().nonnegative().default(0.08),
  leaveFraction: z.number().nonnegative().default(0.12),
  sickReliefPct: z.number().nonnegative().default(0.05),
  productiveHoursPerDay: z.number().positive().default(18),

  peakUplift: z.number().positive().default(1.35),
  sigmaStorage: z.number().positive().default(1.0),
  percentileDocks: z.number().default(0.95),
  percentileStaging: z.number().default(0.95),

  horizontalHoneycombingFactor: z.number().default(0.88),
  gridEfficiencyThreshold: z.number().default(0.88),
  preferredAspectRatio: z.number().default(1.6),

  skuPeakCorrelationCoefficient: z.number().default(0.3),
  floorloadPalletisationYield: z.number().default(0.88),

  dsohDays: z.number().positive().default(14),
  forwardFaceDsohDays: z.object({
    A: z.number().default(1.0),
    B: z.number().default(2.5),
    C: z.number().default(0),
    D: z.number().default(0),
  }),
  discontinuationLagMonths: z.number().default(3),
  dsohChangeByVelocity: z.object({
    A: z.number().default(0),
    B: z.number().default(0),
    C: z.number().default(0),
    D: z.number().default(0),
  }),

  paretoBreakpoints: z.object({
    A: z.number().default(0.20),
    B: z.number().default(0.50),
    C: z.number().default(0.80),
    D: z.number().default(1.00),
  }),
  replenTriggerDays: z.number().default(0.5),
  clsLaneFillFactor: z.number().default(0.90),

  crossAisleSpacingM: z.number().default(22),
  crossAisleWidthM: z.number().default(2.4),

  canopyAllowancePct: z.number().default(0.11),
  canopyType: z.enum(['columned', 'cantilever']).default('cantilever'),
  canopyOverhangM: z.number().default(1.2),
  canopyCoverageExemptMaxM: z.number().default(1.2),

  maxSiteCoverage: z.number().default(0.55),
  phase2HorizontalPct: z.number().default(0.20),
  phase2VerticalPct: z.number().default(0.10),

  softSpacePct: z.number().default(0.20),
  clearHeightMm: z.number().default(12500),

  ordersPerBatch: z.number().default(5),
  repackSecPerPallet: z.number().default(90),
  repackSecPerUnit: z.number().default(2),

  adminFte: z.number().default(5),
  supervisorFte: z.number().default(4),
  totalStaff: z.number().default(85),

  vasBenches: z.number().default(4),
  returnsRatePct: z.number().default(2),
  returnsHandleTimeHours: z.number().default(0.3),
  qcSampleRate: z.number().default(0.10),
  qcDwellHours: z.number().default(8),
  avgDgSkuFootprintM2: z.number().default(0.5),
  dgMultiplier: z.number().default(2.5),
  palletFootprintM2: z.number().default(1.44),
  packerThroughput: z.number().default(60),

  amenitiesArea: z.number().default(80),
  trainingAreaM2: z.number().default(40),
  firstAidAreaM2: z.number().default(15),

  tornadoWeights: z.object({
    footprint: z.number().default(0.5),
    fte: z.number().default(0.5),
  }),
});
export type OpsProfile = z.infer<typeof OpsProfileSchema>;

export const ForwardDriverCurveSchema = z.object({
  fyStart: z.number().int(),
  fyDesign: z.number().int(),
  storeCount: z.record(z.string(), z.number()),
  lflByCategory: z.record(z.string(), z.record(z.string(), z.number())),
  grossNewSkuCount: z.record(z.string(), z.record(z.string(), z.number().int())),
  discontinuedSkus: z
    .array(
      z.object({
        skuId: z.string(),
        discontinuedFy: z.number().int(),
        monthsSinceDiscontinuation: z.record(z.string(), z.number()),
      })
    )
    .default([]),
  dsohChangeByVelocity: z
    .record(z.string(), z.object({ A: z.number(), B: z.number(), C: z.number(), D: z.number() }))
    .default({}),
});
export type ForwardDriverCurve = z.infer<typeof ForwardDriverCurveSchema>;

export const AutomationConfigSchema = z.object({
  system: z.string(),
  stackHeight: z.number().optional(),
  cellsPerM2: z.number().optional(),
  shuttlesPerAisle: z.number().optional(),
  channelDepth: z.number().optional(),
  portsManual: z.number().optional(),
  robotsManual: z.number().optional(),
  sizeToThroughputTarget: z.boolean().default(true),
  packingEfficiency: z.number().default(0.82),
  motherChildMode: z.boolean().default(false),
  frontEndDepthM: z.number().optional(),
});
export type AutomationConfig = z.infer<typeof AutomationConfigSchema>;

export const ScenarioSchema = z.object({
  id: z.string(),
  engagementId: z.string(),
  name: z.string(),
  isBaseline: z.boolean().default(false),
  overrides: z.record(z.string(), z.unknown()).default({}),
  automationConfig: AutomationConfigSchema.nullable().default(null),
  createdAt: z.coerce.date(),
  notes: z.string().optional(),
});
export type Scenario = z.infer<typeof ScenarioSchema>;

export const TornadoParamSchema = z.object({
  id: z.string(),
  label: z.string(),
  path: z.string(),
  lowValue: z.unknown(),
  highValue: z.unknown(),
  enabled: z.boolean().default(true),
});
export type TornadoParam = z.infer<typeof TornadoParamSchema>;
