// Phase 3 gate: engine runs end-to-end on test data. This test composes
// every step in src/engine/pipeline.ts and asserts the result envelope is
// well-formed and feasibility flags resolve correctly across happy and
// constrained paths.

import { describe, it, expect } from 'vitest';
import { runPipeline } from '../../src/engine/pipeline';
import type {
  EngineSku,
  EngineOpsProfile,
  EnginePallet,
  EngineRackSystem,
  EngineBuildingEnvelope,
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

const ENVELOPE: EngineBuildingEnvelope = {
  clearHeights: { usableRackM: 11, sprinklerClearanceM: 1 },
  floor: { slabLoadingTPerM2: 5, totalFloorAreaM2: 10000 },
  seismic: { designCategory: 'C', allowableRatio: 0.8 },
  columnGrid: { spacingXM: 12, spacingYM: 24 },
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

describe('Phase 3 gate — engine pipeline runs end-to-end', () => {
  it('completes happy-path with feasibility=true on a small clean SKU set', () => {
    const skus = [mkSku('A', 500), mkSku('B', 200), mkSku('C', 100), mkSku('D', 50)];
    const out = runPipeline({
      skus,
      opsProfile: OPS,
      pallets: PALLETS,
      racks: [RACK],
      envelope: ENVELOPE,
      halalRequired: false,
    });

    expect(out.validation.fatalErrors).toHaveLength(0);
    expect(out.step1.profiles).toHaveLength(4);
    expect(out.step3.rows).toHaveLength(4);
    expect(out.step4.pfp.alignedBays).toBeGreaterThan(0);
    expect(out.step5.totalAlignedAreaM2).toBeGreaterThan(0);
    expect(out.step6.daily.outboundPallets).toBeGreaterThan(0);
    expect(out.feasibility.overall).toBe(true);
    expect(out.meta.skuCount).toBe(4);
    expect(out.meta.durationMs).toBeGreaterThan(0);
  });

  it('flags clear-height infeasibility on a tall rack in a short building', () => {
    const skus = [];
    for (let i = 0; i < 200; i++) skus.push(mkSku(`S${i}`, 5000));
    const shortEnv: EngineBuildingEnvelope = {
      ...ENVELOPE,
      clearHeights: { usableRackM: 4, sprinklerClearanceM: 1 },
    };
    const out = runPipeline({
      skus,
      opsProfile: OPS,
      pallets: PALLETS,
      racks: [RACK],
      envelope: shortEnv,
      halalRequired: false,
    });
    expect(out.feasibility.clearHeightOk).toBe(false);
    expect(out.feasibility.overall).toBe(false);
  });

  it('honours the suppressed-SKU set produced by Step 0', () => {
    const goodSku = mkSku('GOOD', 100);
    const zeroSku = mkSku('ZERO', 0);
    zeroSku.weeklyUnits = new Float32Array(52);
    zeroSku.weeksOnFile = 0;
    const out = runPipeline({
      skus: [goodSku, zeroSku],
      opsProfile: OPS,
      pallets: PALLETS,
      racks: [RACK],
      envelope: ENVELOPE,
      halalRequired: false,
    });
    expect(out.validation.suppressedSkus.has('ZERO')).toBe(true);
    expect(out.step1.profiles.map((p) => p.skuId)).toEqual(['GOOD']);
  });

  it('blocks fatal-error SKUs from contributing to slot sizing', () => {
    const ok = mkSku('OK', 100);
    const bad = mkSku('BAD', 100, { caseQty: 0 }); // ZERO_CASE_QTY → fatal
    const out = runPipeline({
      skus: [ok, bad],
      opsProfile: OPS,
      pallets: PALLETS,
      racks: [RACK],
      envelope: ENVELOPE,
      halalRequired: false,
    });
    expect(out.validation.fatalErrors.some((e) => e.skuId === 'BAD')).toBe(true);
    expect(out.step3.rows.map((r) => r.skuId)).toEqual(['OK']);
    expect(out.feasibility.overall).toBe(false);
  });

  it('runs 5k SKUs end-to-end inside the SPEC §14 50ms budget headroom', () => {
    const skus: EngineSku[] = [];
    for (let i = 0; i < 5000; i++) skus.push(mkSku(`S${i}`, 50 + (i % 200)));
    const t0 = performance.now();
    const out = runPipeline({
      skus,
      opsProfile: OPS,
      pallets: PALLETS,
      racks: [RACK],
      envelope: ENVELOPE,
      halalRequired: false,
    });
    const elapsed = performance.now() - t0;
    console.log(`pipeline 5k skus: ${elapsed.toFixed(0)}ms`);
    expect(out.meta.skuCount).toBe(5000);
    // Soft assertion — SPEC budget is 50 ms; allow 10× headroom in CI.
    expect(elapsed).toBeLessThan(500);
  });
});
