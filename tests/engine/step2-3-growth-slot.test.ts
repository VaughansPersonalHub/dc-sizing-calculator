import { describe, it, expect } from 'vitest';
import { runStep01Profiling } from '../../src/engine/steps/Step01Profiling';
import { runStep02ForwardGrowth } from '../../src/engine/steps/Step02ForwardGrowth';
import { runStep03SlotSizing } from '../../src/engine/steps/Step03SlotSizing';
import type {
  EngineSku,
  EngineOpsProfile,
  EnginePallet,
  EngineRackSystem,
} from '../../src/engine/models';

const OPS: EngineOpsProfile = {
  operatingDaysPerYear: 300,
  productivityFactor: 0.82,
  productiveHoursPerDay: 18.67,
  peakUplift: 1.35,
  sigmaStorage: 1.0,
  horizontalHoneycombingFactor: 0.88,
  gridEfficiencyThreshold: 0.88,
  preferredAspectRatio: 1.6,
  skuPeakCorrelationCoefficient: 0.3,
  floorloadPalletisationYield: 0.88,
  dsohDays: 14,
  forwardFaceDsohDays: { A: 1.0, B: 2.5, C: 0, D: 0 },
  dsohChangeByVelocity: { A: 0, B: 0, C: 0, D: 0 },
  paretoBreakpoints: { A: 0.2, B: 0.5, C: 0.8, D: 1.0 },
  replenTriggerDays: 0.5,
  clsLaneFillFactor: 0.9,
  crossAisleSpacingM: 22,
  crossAisleWidthM: 2.4,
  canopyAllowancePct: 0.11,
  maxSiteCoverage: 0.55,
  phase2HorizontalPct: 0.2,
  phase2VerticalPct: 0.1,
  softSpacePct: 0.2,
  clearHeightMm: 12500,
  ordersPerBatch: 5,
  repackSecPerPallet: 90,
  palletFootprintM2: 1.21,
};

const PALLETS: EnginePallet[] = [
  { pallet_id: 'T11', dimensionsMm: { length: 1100, width: 1100, height: 150 }, maxLoadKg: 1000 },
  { pallet_id: 'PAL_1200x1000', dimensionsMm: { length: 1200, width: 1000, height: 150 }, maxLoadKg: 1500 },
];

const RACK: EngineRackSystem = {
  system_id: 'selective_t11',
  bay: { widthMm: 2400, depthMm: 1100, heightMmDefault: 9000 },
  slotsPerBay: 2,
  levelsDefault: 5,
  load: { perLevelKg: 2000, maxLoadPerBeamPairKg: 3000, maxSinglePalletKg: 1500 },
  aisle: { widthMmMin: 2800, widthMmDefault: 3000, crossAisleMm: 3500 },
  flueSpace: { transverseMm: 150, longitudinalMm: 300 },
  bottomBeamClearanceMm: 150,
  beamThicknessMm: 100,
  honeycombing: { verticalFactor: 0.92, horizontalDefault: 0.88 },
  fillFactor: 0.95,
  slotTypeCompat: ['PFP'],
  densityRating: 'low',
  structuralBayBlock: 3,
  rackMassKgPerPosition: 45,
};

function mkSku(id: string, weeklyMean: number, overrides: Partial<EngineSku> = {}): EngineSku {
  const w = new Float32Array(52).fill(weeklyMean);
  return {
    id,
    category: 'FMCG',
    weeklyUnits: w,
    weeksOnFile: 52,
    unitCubeCm3: 5000,
    unitWeightKg: 0.5,
    caseQty: 24,
    inboundPalletId: 'T11',
    outboundPalletId: 'T11',
    palletTi: 4,
    palletHi: 5,
    stackable: true,
    tempClass: 'ambient',
    halalStatus: 'halal',
    channelMix: { retailB2bPct: 0.7, ecomDtcPct: 0.2, marketplacePct: 0.1 },
    ...overrides,
  };
}

describe('Step 2 — Forward Growth', () => {
  it('returns a single baseline projection when no driver curve is provided', () => {
    const skus = [mkSku('A', 100), mkSku('B', 50)];
    const step1 = runStep01Profiling({ skus, opsProfile: OPS, suppressed: new Set() });
    const step2 = runStep02ForwardGrowth({ skus, profiles: step1.profiles, opsProfile: OPS });
    expect(step2.yearProjections).toHaveLength(1);
    expect(step2.peakProjection.projectedSkuCount).toBe(2);
  });

  it('grows existing SKUs by storeCount × LFL', () => {
    const skus = [mkSku('A', 100)];
    const step1 = runStep01Profiling({ skus, opsProfile: OPS, suppressed: new Set() });
    const step2 = runStep02ForwardGrowth({
      skus,
      profiles: step1.profiles,
      opsProfile: OPS,
      driverCurve: {
        fyStart: 2026,
        fyDesign: 2028,
        storeCount: { '2026': 10, '2027': 12, '2028': 15 },
        lflByCategory: { FMCG: { '2026': 0, '2027': 0.05, '2028': 0.05 } },
        grossNewSkuCount: {},
        discontinuedSkus: [],
      },
    });
    // Year 2028: stores = 15 → factor 1.5; LFL 1.05 → growth 1.575×
    const fy2028 = step2.yearProjections.find((y) => y.fy === 2028)!;
    const fy2026 = step2.yearProjections.find((y) => y.fy === 2026)!;
    expect(fy2028.projectedPeakWeek[0]).toBeCloseTo(fy2026.projectedPeakWeek[0] * 1.575, 1);
  });

  it('includes gross new SKUs in projection count', () => {
    const skus = [mkSku('A', 100), mkSku('B', 100)];
    const step1 = runStep01Profiling({ skus, opsProfile: OPS, suppressed: new Set() });
    const step2 = runStep02ForwardGrowth({
      skus,
      profiles: step1.profiles,
      opsProfile: OPS,
      driverCurve: {
        fyStart: 2026,
        fyDesign: 2026,
        storeCount: { '2026': 1 },
        lflByCategory: {},
        grossNewSkuCount: { FMCG: { '2026': 5 } },
        discontinuedSkus: [],
      },
    });
    expect(step2.peakProjection.projectedSkuCount).toBe(2 + 5);
  });

  it('picks peak year by total projected annual units', () => {
    const skus = [mkSku('A', 100)];
    const step1 = runStep01Profiling({ skus, opsProfile: OPS, suppressed: new Set() });
    const step2 = runStep02ForwardGrowth({
      skus,
      profiles: step1.profiles,
      opsProfile: OPS,
      driverCurve: {
        fyStart: 2026,
        fyDesign: 2030,
        storeCount: { '2026': 1, '2027': 2, '2028': 5, '2029': 4, '2030': 3 },
        lflByCategory: {},
        grossNewSkuCount: {},
        discontinuedSkus: [],
      },
    });
    expect(step2.peakYear).toBe(2028);
  });
});

describe('Step 3 — Slot sizing', () => {
  it('PFP path produces forward + reserve + honeycombed totals', () => {
    const skus = [mkSku('A', 1000)]; // high volume → bucket A → forward face = 1.0 dsoh
    const step1 = runStep01Profiling({ skus, opsProfile: OPS, suppressed: new Set() });
    const step2 = runStep02ForwardGrowth({ skus, profiles: step1.profiles, opsProfile: OPS });
    const step3 = runStep03SlotSizing({
      skus,
      profiles: step1.profiles,
      projection: step2.peakProjection,
      opsProfile: OPS,
      pallets: PALLETS,
      racks: [RACK],
    });
    const row = step3.rows[0];
    expect(row.slotType).toBe('PFP');
    expect(row.peakInventoryPallets).toBeGreaterThan(0);
    expect(row.totalPositionsWithHoneycomb).toBeGreaterThanOrEqual(row.totalPositionsBeforeHoneycomb);
  });

  it('flags repack when inbound and outbound pallets differ', () => {
    const skus = [mkSku('A', 100, { inboundPalletId: 'PAL_1200x1000', outboundPalletId: 'T11' })];
    const step1 = runStep01Profiling({ skus, opsProfile: OPS, suppressed: new Set() });
    const step2 = runStep02ForwardGrowth({ skus, profiles: step1.profiles, opsProfile: OPS });
    const step3 = runStep03SlotSizing({
      skus,
      profiles: step1.profiles,
      projection: step2.peakProjection,
      opsProfile: OPS,
      pallets: PALLETS,
      racks: [RACK],
    });
    expect(step3.rows[0].needsRepack).toBe(true);
    expect(step3.totals.repackSkus).toBe(1);
  });

  it('beam-pair weight check fires when slots × pallet weight > rack max', () => {
    // Heavy SKU: 4×5×24×5 kg = 2400 kg per pallet × 2 slots = 4800 > 3000
    const skus = [mkSku('H', 100, { unitWeightKg: 5 })];
    const step1 = runStep01Profiling({ skus, opsProfile: OPS, suppressed: new Set() });
    const step2 = runStep02ForwardGrowth({ skus, profiles: step1.profiles, opsProfile: OPS });
    const step3 = runStep03SlotSizing({
      skus,
      profiles: step1.profiles,
      projection: step2.peakProjection,
      opsProfile: OPS,
      pallets: PALLETS,
      racks: [RACK],
    });
    const row = step3.rows[0];
    expect(row.weightExceedsBeamPair).toBe(true);
    expect(step3.totals.weightWarnings).toBe(1);
  });

  it('Shelf path catches small unit-cube each-pick SKUs', () => {
    const skus = [
      mkSku('S', 100, {
        unitCubeCm3: 200,
        channelMix: { retailB2bPct: 0.05, ecomDtcPct: 0.9, marketplacePct: 0.05 },
      }),
    ];
    const step1 = runStep01Profiling({ skus, opsProfile: OPS, suppressed: new Set() });
    const step2 = runStep02ForwardGrowth({ skus, profiles: step1.profiles, opsProfile: OPS });
    const step3 = runStep03SlotSizing({
      skus,
      profiles: step1.profiles,
      projection: step2.peakProjection,
      opsProfile: OPS,
      pallets: PALLETS,
      racks: [RACK],
    });
    expect(step3.rows[0].slotType).toBe('Shelf');
    expect(step3.rows[0].shelfSize).toBeDefined();
  });
});
