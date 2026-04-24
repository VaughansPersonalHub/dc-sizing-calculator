import { z } from 'zod';

export const TempClassSchema = z.enum(['ambient', 'chilled', 'frozen', 'controlled']);
export type TempClass = z.infer<typeof TempClassSchema>;

export const HalalStatusSchema = z.enum([
  'halal',
  'non-halal',
  'pork',
  'alcohol',
  'unclassified',
]);
export type HalalStatus = z.infer<typeof HalalStatusSchema>;

export const SlotTypeSchema = z.enum(['PFP', 'CLS', 'Shelf', 'Auto']);
export type SlotType = z.infer<typeof SlotTypeSchema>;

export const VelocityBucketSchema = z.enum(['A', 'B', 'C', 'D']);
export type VelocityBucket = z.infer<typeof VelocityBucketSchema>;

export const SeasonalEventTagSchema = z.enum([
  'lunar_new_year',
  'ramadan',
  'diwali',
  'tet',
  'chuseok',
  'christmas',
  'other',
]);
export type SeasonalEventTag = z.infer<typeof SeasonalEventTagSchema>;

export const ChannelMixSchema = z
  .object({
    retailB2bPct: z.number().min(0).max(1),
    ecomDtcPct: z.number().min(0).max(1),
    marketplacePct: z.number().min(0).max(1),
  })
  .refine(
    (c) => Math.abs(c.retailB2bPct + c.ecomDtcPct + c.marketplacePct - 1) < 0.001,
    { message: 'channelMix must sum to 1.0' }
  );
export type ChannelMix = z.infer<typeof ChannelMixSchema>;

export const ValidationCodeSchema = z.enum([
  'ZERO_DEMAND',
  'NEGATIVE_DEMAND',
  'ZERO_CASE_QTY',
  'IMPOSSIBLE_PALLET_CONFIG',
  'PALLET_WEIGHT_EXCEEDS_RACK',
  'INBOUND_OUTBOUND_MISMATCH',
  'MISSING_CHANNEL_MIX',
  'CV_OUTLIER',
  'UNIT_CUBE_IMPOSSIBLE',
  'MISSING_HALAL_STATUS',
  'PARTIAL_HISTORY',
  'SEASONAL_TAG_MISSING',
]);
export type ValidationCode = z.infer<typeof ValidationCodeSchema>;

export interface ValidationError {
  skuId: string;
  field: string;
  value: unknown;
  code: ValidationCode;
  message: string;
  suggestedFix?: string;
  autoFixable: boolean;
}

export interface SkuProfile {
  mu: number;
  sigma: number;
  cv: number;
  seasonalityIndex: number;
  peakWeek84: number;
  peakWeek95: number;
  peakWeek99: number;
  cubeVelocityCm3PerDay: number;
  linesPerDay: number;
  velocityBucket: VelocityBucket | null;
  channelVolumes: { retailB2b: number; ecomDtc: number; marketplace: number };
  pickProfile: { method: string; unitType: string };
  confidenceFlag: 'clean' | 'partial_history';
}

// SkuRecord uses a plain interface because Float32Array doesn't round-trip
// cleanly through Zod's parse output. Validate at the boundary (CSV import)
// with a separate row-level schema.
export interface SkuRecord {
  id: string;
  engagementId: string;
  name: string;
  category: string;
  subCategory?: string;

  weeklyUnits: Float32Array;
  weeksOnFile: number;

  unitCubeCm3: number;
  unitWeightKg: number;
  caseQty: number;

  inboundPalletId: string;
  outboundPalletId: string;
  palletTi: number;
  palletHi: number;
  stackable: boolean;

  tempClass: TempClass;
  dgClass: string;
  halalStatus: HalalStatus;

  channelMix: ChannelMix;

  isEventDrivenSeasonal: boolean;
  seasonalEventTag?: SeasonalEventTag;

  slotTypeOverride?: SlotType;
  velocityOverride?: VelocityBucket;

  validationStatus: 'clean' | 'warning' | 'fatal';
  validationIssues: ValidationError[];

  profile?: SkuProfile;
}

// Boundary schema for CSV row validation (no Float32Array here — that's
// constructed after parsing the 52 weekly columns).
export const SkuCsvRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  subCategory: z.string().optional(),
  unitCubeCm3: z.number().positive(),
  unitWeightKg: z.number().nonnegative(),
  caseQty: z.number().int().positive(),
  inboundPalletId: z.string().min(1),
  outboundPalletId: z.string().min(1),
  palletTi: z.number().int().positive(),
  palletHi: z.number().int().positive(),
  stackable: z.boolean(),
  tempClass: TempClassSchema,
  dgClass: z.string().default('none'),
  halalStatus: HalalStatusSchema.default('unclassified'),
  channelMix: ChannelMixSchema,
  isEventDrivenSeasonal: z.boolean().default(false),
  seasonalEventTag: SeasonalEventTagSchema.optional(),
  slotTypeOverride: SlotTypeSchema.optional(),
  velocityOverride: VelocityBucketSchema.optional(),
});
export type SkuCsvRow = z.infer<typeof SkuCsvRowSchema>;
