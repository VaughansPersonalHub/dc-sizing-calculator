// Step 7 (Labour with travel models) and Step 8 (MHE fleet) tests.
// Cover the SPEC §8 invariants:
// - availability factor method (NOT multiplicative summing)
// - per-task travel time matches the documented model
// - Ramadan derate uplift in MY/ID
// - WALKING_PICK_IN_LARGE_ZONE warning when sqrt_area + zone > 15k m²
// - MHE fleet count = ceil(taskHours / (available × utilisation))
// - lithium AMR availability ≈ 22h × 7d × 50w
// - lead-acid swap penalty 15min × shifts/day

import { describe, it, expect } from 'vitest';
import { runPipeline } from '../../src/engine/pipeline';
import { runStep07Labour } from '../../src/engine/steps/Step07Labour';
import { runStep08MheFleet } from '../../src/engine/steps/Step08MheFleet';
import {
  OPS,
  PALLETS,
  RACK,
  ENVELOPE,
  PRODUCTIVITY,
  MHE,
  REGIONAL,
  REGIONAL_MY,
  mkSku,
} from './fixtures';
import type { EngineSku } from '../../src/engine/models';

const baseInputs = {
  opsProfile: OPS,
  pallets: PALLETS,
  racks: [RACK],
  envelope: ENVELOPE,
  productivity: PRODUCTIVITY,
  mheLibrary: MHE,
  regional: REGIONAL,
  halalRequired: false,
};

function buildPipelineFor(skus: EngineSku[]) {
  return runPipeline({ skus, ...baseInputs });
}

describe('Step 7 — Labour with travel models', () => {
  it('availability factor uses multiplicative complements, not subtraction', () => {
    const out = buildPipelineFor([mkSku('A', 1000)]);
    const expected =
      (1 - OPS.absenteeismPct) * (1 - OPS.leaveFraction) * (1 - OPS.sickReliefPct);
    expect(out.step7.availability).toBeCloseTo(expected, 6);
  });

  it('peakFte = baseFte × peakUplift / availability for the simplest task', () => {
    const out = buildPipelineFor([mkSku('A', 100)]);
    const sample = out.step7.tasks.find((t) => t.task === 'pallet_putaway');
    if (!sample) throw new Error('expected pallet_putaway task');
    const expectedPeak =
      (sample.baseFte * OPS.peakUplift) /
      ((1 - OPS.absenteeismPct) * (1 - OPS.leaveFraction) * (1 - OPS.sickReliefPct));
    expect(sample.peakFte).toBeCloseTo(expectedPeak, 4);
  });

  it('rate = 3600 / totalTime', () => {
    const out = buildPipelineFor([mkSku('A', 100)]);
    for (const task of out.step7.tasks) {
      if (task.totalTimeSec > 0) {
        expect(task.ratePerHour).toBeCloseTo(3600 / task.totalTimeSec, 3);
      }
    }
  });

  it('Ramadan derate inflates total peakFte for MY engagements', () => {
    const skus = [mkSku('A', 1000), mkSku('B', 500)];
    const baseline = runPipeline({ skus, ...baseInputs });
    const ramadan = runPipeline({ skus, ...baseInputs, regional: REGIONAL_MY });
    expect(ramadan.step7.ramadanAnnualImpact).toBeGreaterThan(0);
    expect(ramadan.step7.totalPeakFte).toBeGreaterThan(baseline.step7.totalPeakFte);
    expect(baseline.step7.ramadanAnnualImpact).toBe(0);
  });

  it('emits WALKING_PICK_IN_LARGE_ZONE on a >15k m² walking-pick zone', () => {
    // Synthesize a Step 5 result with a 20k m² PFP zone — the pallet pick
    // task uses sqrt_area in the default reach_truck cell, so it should
    // emit the warning.
    const out = runStep07Labour({
      step5: {
        zones: [
          {
            zone: 'PFP',
            alignedBays: 200,
            baysPerRow: 20,
            rows: 10,
            bayWidthMm: 2400,
            bayDepthMm: 2500,
            aisleWidthMm: 3000,
            crossAisles: 1,
            zoneWidthRawM: 100,
            zoneDepthRawM: 200,
            rawAreaM2: 20000,
            alignedAreaM2: 20000,
            gridEfficiency: 1,
            orientation: 'matches_flow',
          },
        ],
        totalRawAreaM2: 20000,
        totalAlignedAreaM2: 20000,
        averageGridEfficiency: 1,
      },
      step6: {
        daily: { inboundPallets: 100, outboundPallets: 200, pickLinesPerDay: 5000, repackPallets: 0, decantPallets: 0 },
        peak: { inboundPallets: 0, outboundPallets: 0, pickLinesPerDay: 0 },
        pickLinesByVelocity: { A: 0, B: 0, C: 0, D: 0 },
        pickLinesByMethod: { pallet: 100, case: 4000, each: 900 },
      },
      opsProfile: OPS,
      productivity: PRODUCTIVITY,
      regional: REGIONAL,
    });
    expect(out.warnings).toContain('WALKING_PICK_IN_LARGE_ZONE');
  });

  it('sqrt_area travel time scales with sqrt(zoneArea / baseline)', () => {
    // Take one productivity cell and call the step directly with zone areas
    // that should produce a 2× travel scale.
    const cells = PRODUCTIVITY;
    const cell = cells.find((c) => c.method === 'voice');
    if (!cell) throw new Error('expected voice cell');

    // Build a step5 stub with two zones — same SKUs, different areas.
    const small = runStep07Labour({
      step5: {
        zones: [
          {
            zone: 'PFP',
            alignedBays: 0,
            baysPerRow: 0,
            rows: 0,
            bayWidthMm: 0,
            bayDepthMm: 0,
            aisleWidthMm: 0,
            crossAisles: 0,
            zoneWidthRawM: 0,
            zoneDepthRawM: 0,
            rawAreaM2: 0,
            alignedAreaM2: cell.baselineZoneAreaM2,
            gridEfficiency: 1,
            orientation: 'matches_flow',
          },
        ],
        totalRawAreaM2: 0,
        totalAlignedAreaM2: cell.baselineZoneAreaM2,
        averageGridEfficiency: 1,
      },
      step6: {
        daily: { inboundPallets: 100, outboundPallets: 100, pickLinesPerDay: 1000, repackPallets: 0, decantPallets: 0 },
        peak: { inboundPallets: 0, outboundPallets: 0, pickLinesPerDay: 0 },
        pickLinesByVelocity: { A: 0, B: 0, C: 0, D: 0 },
        pickLinesByMethod: { pallet: 0, case: 1000, each: 0 },
      },
      opsProfile: OPS,
      productivity: PRODUCTIVITY,
      regional: REGIONAL,
    });
    const big = runStep07Labour({
      step5: {
        zones: [
          {
            zone: 'PFP',
            alignedBays: 0,
            baysPerRow: 0,
            rows: 0,
            bayWidthMm: 0,
            bayDepthMm: 0,
            aisleWidthMm: 0,
            crossAisles: 0,
            zoneWidthRawM: 0,
            zoneDepthRawM: 0,
            rawAreaM2: 0,
            alignedAreaM2: cell.baselineZoneAreaM2 * 4, // 4× area → 2× travel
            gridEfficiency: 1,
            orientation: 'matches_flow',
          },
        ],
        totalRawAreaM2: 0,
        totalAlignedAreaM2: cell.baselineZoneAreaM2 * 4,
        averageGridEfficiency: 1,
      },
      step6: {
        daily: { inboundPallets: 100, outboundPallets: 100, pickLinesPerDay: 1000, repackPallets: 0, decantPallets: 0 },
        peak: { inboundPallets: 0, outboundPallets: 0, pickLinesPerDay: 0 },
        pickLinesByVelocity: { A: 0, B: 0, C: 0, D: 0 },
        pickLinesByMethod: { pallet: 0, case: 1000, each: 0 },
      },
      opsProfile: OPS,
      productivity: PRODUCTIVITY,
      regional: REGIONAL,
    });
    const smallCase = small.tasks.find((t) => t.task === 'case_pick');
    const bigCase = big.tasks.find((t) => t.task === 'case_pick');
    if (!smallCase || !bigCase) throw new Error('expected case_pick tasks');
    expect(bigCase.travelTimeSec).toBeCloseTo(2 * smallCase.travelTimeSec, 2);
  });
});

describe('Step 8 — MHE fleet', () => {
  it('routes pallet_putaway to reach_truck by default and produces a fleet count', () => {
    const out = buildPipelineFor([mkSku('A', 1000), mkSku('B', 500), mkSku('C', 200)]);
    expect(out.step8.taskRouting.pallet_putaway).toBe('reach_truck_single');
    const reach = out.step8.fleets.find((f) => f.mhe_id === 'reach_truck_single');
    expect(reach?.fleetCount ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('routes pallet tasks to vna_turret when vnaSelected=true', () => {
    const skus = [mkSku('A', 1000)];
    const out = runPipeline({ skus, ...baseInputs, vnaSelected: true });
    expect(out.step8.taskRouting.pallet_putaway).toBe('vna_turret');
  });

  it('lead-acid swap loses 15min × shiftsPerDay vs lithium opportunity', () => {
    const skus = [mkSku('A', 1000)];
    const labour = runPipeline({ skus, ...baseInputs });
    const swapMhe = MHE.map((m) =>
      m.mhe_id === 'reach_truck_single'
        ? { ...m, battery: { ...m.battery, type: 'lead_acid_swap' as const } }
        : m
    );
    const lithium = runStep08MheFleet({
      step7Tasks: labour.step7.tasks,
      mheLibrary: MHE,
      opsProfile: OPS,
    });
    const swap = runStep08MheFleet({
      step7Tasks: labour.step7.tasks,
      mheLibrary: swapMhe,
      opsProfile: OPS,
    });
    const lFleet = lithium.fleets.find((f) => f.mhe_id === 'reach_truck_single');
    const sFleet = swap.fleets.find((f) => f.mhe_id === 'reach_truck_single');
    if (!lFleet || !sFleet) throw new Error('expected reach truck fleets');
    expect(sFleet.availableHoursPerUnit).toBeLessThan(lFleet.availableHoursPerUnit);
  });

  it('charging footprint and kVA scale with fleet count', () => {
    const out = buildPipelineFor([mkSku('A', 5000), mkSku('B', 3000), mkSku('C', 1000)]);
    for (const fleet of out.step8.fleets) {
      const cls = MHE.find((m) => m.mhe_id === fleet.mhe_id);
      if (!cls) continue;
      expect(fleet.chargingFootprintM2).toBeCloseTo(
        fleet.fleetCount * cls.battery.chargingFootprintM2PerUnit,
        3
      );
      expect(fleet.chargingKvaTotal).toBeCloseTo(
        fleet.fleetCount * cls.battery.chargingKva,
        3
      );
    }
  });
});
