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
import type { EngineSku, EngineBuildingEnvelope } from '../../src/engine/models';
import { OPS, PALLETS, RACK, ENVELOPE, mkSku } from './fixtures';

const ENVELOPE_TALL = ENVELOPE;

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
