import { describe, it, expect } from 'vitest';
import {
  runStep04Bays,
  runStep4_5ClearHeight,
  runStep4_6SeismicMass,
} from '../../src/engine/steps/Step04Bays';
import { runStep05Footprint } from '../../src/engine/steps/Step05Footprint';
import { runStep06Throughput } from '../../src/engine/steps/Step06Throughput';
import { runStep01Profiling } from '../../src/engine/steps/Step01Profiling';
import { runStep02ForwardGrowth } from '../../src/engine/steps/Step02ForwardGrowth';
import { runStep03SlotSizing } from '../../src/engine/steps/Step03SlotSizing';
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

const ENVELOPE_TALL: EngineBuildingEnvelope = {
  clearHeights: { usableRackM: 11, sprinklerClearanceM: 1 },
  floor: { slabLoadingTPerM2: 5, totalFloorAreaM2: 10000 },
  seismic: { designCategory: 'C', allowableRatio: 0.8 },
  columnGrid: { spacingXM: 12, spacingYM: 24 },
};

function pipeline(skus: EngineSku[]) {
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
  return { step1, step2, step3 };
}

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

describe('Step 4 — Aggregate to bays', () => {
  it('aligns rawBays up to the rack structuralBayBlock', () => {
    const { step3 } = pipeline([mkSku('A', 1000)]);
    const step4 = runStep04Bays({ totals: step3.totals, rack: RACK, ops: OPS });
    const aligned = step4.pfp.alignedBays;
    if (aligned > 0) expect(aligned % RACK.structuralBayBlock).toBe(0);
  });
});

describe('Step 4.5 — Clear height gate', () => {
  it('passes when usable rack height comfortably accommodates levels', () => {
    const { step3 } = pipeline([mkSku('A', 100)]);
    const step4 = runStep04Bays({ totals: step3.totals, rack: RACK, ops: OPS });
    const result = runStep4_5ClearHeight({
      bays: step4,
      rack: RACK,
      inboundPallet: PALLETS[0],
      envelope: ENVELOPE_TALL,
      ops: OPS,
    });
    expect(result.ok).toBe(true);
    expect(result.shortfallLevels).toBe(0);
  });

  it('fails with shortfallLevels when usableRackM is too low', () => {
    const { step3 } = pipeline([mkSku('A', 1_000_000)]);
    const step4 = runStep04Bays({ totals: step3.totals, rack: RACK, ops: OPS });
    const shortEnv: EngineBuildingEnvelope = {
      ...ENVELOPE_TALL,
      clearHeights: { usableRackM: 4, sprinklerClearanceM: 1 },
    };
    const result = runStep4_5ClearHeight({
      bays: step4,
      rack: RACK,
      inboundPallet: PALLETS[0],
      envelope: shortEnv,
      ops: OPS,
    });
    expect(result.ok).toBe(false);
    expect(result.shortfallLevels).toBeGreaterThan(0);
    expect(result.remediation.footprintExpansionFactor).toBeGreaterThan(1);
  });
});

describe('Step 4.6 — Seismic mass gate', () => {
  it('passes for a small rack on a strong slab', () => {
    const { step3 } = pipeline([mkSku('A', 100)]);
    const step4 = runStep04Bays({ totals: step3.totals, rack: RACK, ops: OPS });
    const result = runStep4_6SeismicMass({
      bays: step4,
      rack: RACK,
      envelope: ENVELOPE_TALL,
      avgPalletWeightKg: 800,
      seismicCoefficient: 0.2,
    });
    expect(result.ok).toBe(true);
  });

  it('fails when bays × pallet mass × Cs exceeds slab × ratio × area', () => {
    const skus: EngineSku[] = [];
    for (let i = 0; i < 100; i++) skus.push(mkSku(`S${i}`, 5000));
    const { step3 } = pipeline(skus);
    const step4 = runStep04Bays({ totals: step3.totals, rack: RACK, ops: OPS });
    const weakEnv: EngineBuildingEnvelope = {
      ...ENVELOPE_TALL,
      floor: { slabLoadingTPerM2: 1, totalFloorAreaM2: 1000 },
      seismic: { designCategory: 'D', allowableRatio: 0.5 },
    };
    const result = runStep4_6SeismicMass({
      bays: step4,
      rack: RACK,
      envelope: weakEnv,
      avgPalletWeightKg: 1500,
      seismicCoefficient: 0.4,
    });
    expect(result.ok).toBe(false);
    expect(result.remediation).not.toBe('none');
  });
});

describe('Step 5 — Footprint per zone', () => {
  it('produces a non-zero footprint for the PFP zone', () => {
    const { step3 } = pipeline([mkSku('A', 1000)]);
    const step4 = runStep04Bays({ totals: step3.totals, rack: RACK, ops: OPS });
    const step5 = runStep05Footprint({
      bays: step4,
      rack: RACK,
      envelope: ENVELOPE_TALL,
      ops: OPS,
    });
    expect(step5.zones.length).toBeGreaterThan(0);
    expect(step5.totalAlignedAreaM2).toBeGreaterThan(0);
    expect(step5.averageGridEfficiency).toBeLessThanOrEqual(1);
    expect(step5.averageGridEfficiency).toBeGreaterThan(0);
  });

  it('auto_optimize picks the orientation with smaller aligned area', () => {
    const { step3 } = pipeline([mkSku('A', 5000)]);
    const step4 = runStep04Bays({ totals: step3.totals, rack: RACK, ops: OPS });
    const step5 = runStep05Footprint({
      bays: step4,
      rack: RACK,
      envelope: ENVELOPE_TALL,
      ops: OPS,
      orientation: 'auto_optimize',
    });
    const matches = runStep05Footprint({
      bays: step4,
      rack: RACK,
      envelope: ENVELOPE_TALL,
      ops: OPS,
      orientation: 'matches_flow',
    });
    expect(step5.totalAlignedAreaM2).toBeLessThanOrEqual(matches.totalAlignedAreaM2);
  });
});

describe('Step 6 — Throughput', () => {
  it('peak throughput exceeds daily by peakUplift × (1 − 0.5×corr)', () => {
    const skus = [mkSku('A', 1000), mkSku('B', 500)];
    const { step1, step2, step3 } = pipeline(skus);
    const step6 = runStep06Throughput({
      skus,
      profiles: step1.profiles,
      slotRows: step3.rows,
      projection: step2.peakProjection,
      opsProfile: OPS,
      pallets: PALLETS,
    });
    const expectedPeakFactor = OPS.peakUplift * (1 - OPS.skuPeakCorrelationCoefficient * 0.5);
    expect(step6.peak.outboundPallets).toBeCloseTo(
      step6.daily.outboundPallets * expectedPeakFactor,
      4
    );
  });

  it('attributes pick lines across velocity buckets', () => {
    const skus = [mkSku('A', 5000), mkSku('B', 50), mkSku('C', 10)];
    const { step1, step2, step3 } = pipeline(skus);
    const step6 = runStep06Throughput({
      skus,
      profiles: step1.profiles,
      slotRows: step3.rows,
      projection: step2.peakProjection,
      opsProfile: OPS,
      pallets: PALLETS,
    });
    const total =
      step6.pickLinesByVelocity.A +
      step6.pickLinesByVelocity.B +
      step6.pickLinesByVelocity.C +
      step6.pickLinesByVelocity.D;
    expect(total).toBeCloseTo(step6.daily.pickLinesPerDay, 4);
  });
});
