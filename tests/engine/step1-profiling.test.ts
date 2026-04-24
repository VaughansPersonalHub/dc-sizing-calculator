import { describe, it, expect } from 'vitest';
import { runStep01Profiling } from '../../src/engine/steps/Step01Profiling';
import type { EngineSku, EngineOpsProfile } from '../../src/engine/models';

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

function mkSku(id: string, weeklyMean: number, channelMix?: Partial<EngineSku['channelMix']>): EngineSku {
  const w = new Float32Array(52).fill(weeklyMean);
  return {
    id,
    category: 'FMCG',
    weeklyUnits: w,
    weeksOnFile: 52,
    unitCubeCm3: 1000,
    unitWeightKg: 1,
    caseQty: 24,
    inboundPalletId: 'T11',
    outboundPalletId: 'T11',
    palletTi: 8,
    palletHi: 6,
    stackable: true,
    tempClass: 'ambient',
    halalStatus: 'halal',
    channelMix: {
      retailB2bPct: channelMix?.retailB2bPct ?? 0.6,
      ecomDtcPct: channelMix?.ecomDtcPct ?? 0.3,
      marketplacePct: channelMix?.marketplacePct ?? 0.1,
    },
  };
}

describe('Step 1 — SKU profiling', () => {
  it('produces one profile per unsuppressed SKU', () => {
    const r = runStep01Profiling({
      skus: [mkSku('A', 100), mkSku('B', 50), mkSku('C', 10)],
      opsProfile: OPS,
      suppressed: new Set(),
    });
    expect(r.profiles).toHaveLength(3);
  });

  it('skips suppressed SKUs', () => {
    const r = runStep01Profiling({
      skus: [mkSku('A', 100), mkSku('B', 50)],
      opsProfile: OPS,
      suppressed: new Set(['B']),
    });
    expect(r.profiles.map((p) => p.skuId)).toEqual(['A']);
  });

  it('computes mu, sigma (zero for flat demand)', () => {
    const r = runStep01Profiling({
      skus: [mkSku('A', 100)],
      opsProfile: OPS,
      suppressed: new Set(),
    });
    expect(r.profiles[0].mu).toBeCloseTo(100);
    expect(r.profiles[0].sigma).toBeCloseTo(0);
    expect(r.profiles[0].cv).toBeCloseTo(0);
  });

  it('gives peakWeek95 > peakWeek84 when demand has a broad tail', () => {
    // 40w@50, 5w@200, 5w@400, 2w@600 — produces distinct p84 (~200) and
    // p95 (~400) quantiles over 52 sorted values.
    const w = new Float32Array(52);
    for (let i = 0; i < 40; i++) w[i] = 50;
    for (let i = 40; i < 45; i++) w[i] = 200;
    for (let i = 45; i < 50; i++) w[i] = 400;
    w[50] = 600;
    w[51] = 600;
    const sku = mkSku('A', 0);
    sku.weeklyUnits = w;
    const r = runStep01Profiling({ skus: [sku], opsProfile: OPS, suppressed: new Set() });
    expect(r.profiles[0].peakWeek95).toBeGreaterThan(r.profiles[0].peakWeek84);
  });

  it('assigns velocity buckets by Pareto on linesPerDay', () => {
    // A dominates volume; D should be at the tail
    const skus = [
      mkSku('A', 10000),
      mkSku('B', 100),
      mkSku('C', 50),
      mkSku('D', 10),
      mkSku('E', 5),
    ];
    const r = runStep01Profiling({ skus, opsProfile: OPS, suppressed: new Set() });
    const byId = new Map(r.profiles.map((p) => [p.skuId, p]));
    expect(byId.get('A')!.velocityBucket).toBe('A');
    // E is the smallest; should not be A
    expect(byId.get('E')!.velocityBucket).not.toBe('A');
  });

  it('pickProfile defaults to pallet for retail-B2B dominant SKUs', () => {
    const r = runStep01Profiling({
      skus: [mkSku('R', 100, { retailB2bPct: 0.8, ecomDtcPct: 0.1, marketplacePct: 0.1 })],
      opsProfile: OPS,
      suppressed: new Set(),
    });
    expect(r.profiles[0].pickProfile.unitType).toBe('pallet');
  });

  it('pickProfile flips to each-pick for ecom-DTC dominant SKUs', () => {
    const r = runStep01Profiling({
      skus: [mkSku('E', 100, { retailB2bPct: 0.1, ecomDtcPct: 0.8, marketplacePct: 0.1 })],
      opsProfile: OPS,
      suppressed: new Set(),
    });
    expect(r.profiles[0].pickProfile.unitType).toBe('each');
  });

  it('flags partial_history for SKUs with <26 weeksOnFile', () => {
    const sku = mkSku('X', 100);
    sku.weeksOnFile = 10;
    const r = runStep01Profiling({ skus: [sku], opsProfile: OPS, suppressed: new Set() });
    expect(r.profiles[0].confidenceFlag).toBe('partial_history');
  });
});
