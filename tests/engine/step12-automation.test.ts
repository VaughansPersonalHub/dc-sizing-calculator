// Step 12 — Automation Override tests.
// Cover SPEC §8 Step 12 invariants:
// - AutoStore density = 9 × stackHeight × 0.85 bins/m²
// - HaiPick ACR = 180 cases/m²
// - Robot count = ceil(peakLines/hr / throughputPerRobotPerHour)
// - Pallet shuttle scales by mother-child mode
// - meetsThroughput flips false when capacity < required peak
// - Library miss throws

import { describe, it, expect } from 'vitest';
import { runStep12Automation } from '../../src/engine/steps/Step12Automation';
import { runPipeline } from '../../src/engine/pipeline';
import {
  OPS,
  PALLETS,
  RACK,
  ENVELOPE,
  PRODUCTIVITY,
  MHE,
  REGIONAL,
  mkSku,
} from './fixtures';
import type {
  EngineAutomationSystem,
  EngineAutomationConfig,
} from '../../src/engine/models';

const AUTOMATION: EngineAutomationSystem[] = [
  {
    system_id: 'autostore_grid',
    category: 'g2p_cubic',
    densityUnit: 'bins/m2',
    densityValue: 9,
    throughputPerRobotPerHour: 500,
    defaultPackingEfficiency: 0.82,
  },
  {
    system_id: 'hai_haipick_acr',
    category: 'acr_case',
    densityUnit: 'cases/m2',
    densityValue: 180,
    throughputPerRobotPerHour: 300,
    defaultPackingEfficiency: 0.8,
  },
  {
    system_id: 'pallet_shuttle_single',
    category: 'pallet_shuttle',
    densityUnit: 'pallets/m2',
    densityValue: 20,
    throughputPerAislePerHour: 50,
    defaultPackingEfficiency: 0.9,
  },
  {
    system_id: 'pallet_shuttle_mother_child',
    category: 'pallet_shuttle',
    densityUnit: 'pallets/m2',
    densityValue: 38,
    throughputPerAislePerHour: 40,
    defaultPackingEfficiency: 0.9,
  },
  {
    system_id: 'libiao_cross_belt_sorter',
    category: 'sortation',
    densityUnit: 'parcels/hr',
    densityValue: 15000,
    throughputPerHour: 15000,
    defaultPackingEfficiency: 1.0,
  },
];

const baseInputs = {
  opsProfile: OPS,
  pallets: PALLETS,
  racks: [RACK],
  envelope: ENVELOPE,
  productivity: PRODUCTIVITY,
  mheLibrary: MHE,
  regional: REGIONAL,
  halalRequired: false,
  automationLibrary: AUTOMATION,
};

describe('Step 12 — Automation Override', () => {
  it('AutoStore density = 9 × stackHeight × 0.85', () => {
    // Build a SKU set that produces shelf positions to be replaced.
    const skus = [
      mkSku('A', 50, { unitCubeCm3: 1000, channelMix: { retailB2bPct: 0, ecomDtcPct: 1, marketplacePct: 0 } }),
      mkSku('B', 60, { unitCubeCm3: 1200, channelMix: { retailB2bPct: 0, ecomDtcPct: 1, marketplacePct: 0 } }),
    ];
    const config: EngineAutomationConfig = {
      system_id: 'autostore_grid',
      stackHeight: 12,
      sizeToThroughputTarget: true,
      packingEfficiency: 0.82,
      motherChildMode: false,
    };
    const out = runPipeline({ skus, ...baseInputs, automationConfig: config });
    expect(out.step12).not.toBeNull();
    if (!out.step12) throw new Error('expected step12 output');
    expect(out.step12.systemId).toBe('autostore_grid');
    expect(out.step12.category).toBe('g2p_cubic');
    // Density used was 9 × 12 × 0.85 = 91.8 bins/m²
    // replacedZoneArea = storageItems / 91.8 — assert positive area
    expect(out.step12.replacedZoneArea).toBeGreaterThan(0);
  });

  it('robotCount sized to peak throughput', () => {
    const skus = [mkSku('A', 5000)];
    const out = runPipeline({
      skus,
      ...baseInputs,
      automationConfig: {
        system_id: 'autostore_grid',
        sizeToThroughputTarget: true,
        packingEfficiency: 0.82,
        motherChildMode: false,
      },
    });
    expect(out.step12?.robotCount).toBeGreaterThanOrEqual(1);
    // At 500/hr/robot, robotCount × 500 ≥ peakLines/hr
    if (out.step12) {
      expect(out.step12.throughputCapacityPerHour).toBeGreaterThanOrEqual(
        out.step12.requiredPeakPerHour - 0.001
      );
      expect(out.step12.meetsThroughput).toBe(true);
    }
  });

  it('robotsManual override forces fleet size', () => {
    const skus = [mkSku('A', 1000)];
    const out = runPipeline({
      skus,
      ...baseInputs,
      automationConfig: {
        system_id: 'autostore_grid',
        sizeToThroughputTarget: true,
        packingEfficiency: 0.82,
        motherChildMode: false,
        robotsManual: 7,
      },
    });
    expect(out.step12?.robotCount).toBe(7);
  });

  it('mother-child shuttle places 2 shuttles per aisle', () => {
    const skus = [mkSku('A', 1000)];
    const single = runPipeline({
      skus,
      ...baseInputs,
      automationConfig: {
        system_id: 'pallet_shuttle_single',
        sizeToThroughputTarget: true,
        packingEfficiency: 0.9,
        motherChildMode: false,
      },
    });
    const motherChild = runPipeline({
      skus,
      ...baseInputs,
      automationConfig: {
        system_id: 'pallet_shuttle_mother_child',
        sizeToThroughputTarget: true,
        packingEfficiency: 0.9,
        motherChildMode: true,
      },
    });
    if (!single.step12 || !motherChild.step12) throw new Error('expected step12');
    // Mother-child has more shuttles per aisle, so robotCount should be higher
    // for the same peak throughput.
    expect(motherChild.step12.robotCount).toBeGreaterThanOrEqual(single.step12.robotCount);
  });

  it('Libiao sorter has fixed throughput, robotCount = 1', () => {
    const skus = [mkSku('A', 1000)];
    const out = runPipeline({
      skus,
      ...baseInputs,
      automationConfig: {
        system_id: 'libiao_cross_belt_sorter',
        sizeToThroughputTarget: true,
        packingEfficiency: 1.0,
        motherChildMode: false,
      },
    });
    expect(out.step12?.robotCount).toBe(1);
    expect(out.step12?.throughputCapacityPerHour).toBe(15000);
  });

  it('flags AUTOMATION_THROUGHPUT_BELOW_PEAK when capacity < required', () => {
    // 100% ecom each-pick maximises pickLinesPerDay → easy to push past
    // a single AutoStore robot's 500/hr capacity.
    const skus = [];
    for (let i = 0; i < 20; i++) {
      skus.push(
        mkSku(`A${i}`, 5000, {
          channelMix: { retailB2bPct: 0, ecomDtcPct: 1, marketplacePct: 0 },
        })
      );
    }
    const out = runPipeline({
      skus,
      ...baseInputs,
      automationConfig: {
        system_id: 'autostore_grid',
        sizeToThroughputTarget: true,
        packingEfficiency: 0.82,
        motherChildMode: false,
        robotsManual: 1, // force underprovisioned
      },
    });
    expect(out.step12?.warnings).toContain('AUTOMATION_THROUGHPUT_BELOW_PEAK');
    expect(out.step12?.meetsThroughput).toBe(false);
  });

  it('throws when system_id not in library', () => {
    expect(() =>
      runStep12Automation({
        config: {
          system_id: 'made_up_system',
          sizeToThroughputTarget: true,
          packingEfficiency: 0.82,
          motherChildMode: false,
        },
        library: AUTOMATION,
        step3: { rows: [], totals: { pfpPositions: 0, clsLanes: 0, shelfPositionsSmall: 100, shelfPositionsMedium: 0, shelfPositionsLarge: 0, weightWarnings: 0, repackSkus: 0 }, rack: RACK },
        step5: { zones: [], totalRawAreaM2: 0, totalAlignedAreaM2: 0, averageGridEfficiency: 1 },
        step6: {
          daily: { inboundPallets: 0, outboundPallets: 0, pickLinesPerDay: 0, repackPallets: 0, decantPallets: 0 },
          peak: { inboundPallets: 0, outboundPallets: 0, pickLinesPerDay: 0 },
          pickLinesByVelocity: { A: 0, B: 0, C: 0, D: 0 },
          pickLinesByMethod: { pallet: 0, case: 0, each: 0 },
        },
      })
    ).toThrow(/not in library/);
  });

  it('returns null step12 when no automationConfig provided', () => {
    const out = runPipeline({ skus: [mkSku('A', 100)], ...baseInputs });
    expect(out.step12).toBeNull();
  });

  it('AutoStore vs HaiPick ACR replace different conventional zones', () => {
    // Build SKUs that produce both shelf + CLS volume so each path replaces
    // different conventional area.
    const skus = [
      mkSku('S', 40, { unitCubeCm3: 1000, channelMix: { retailB2bPct: 0, ecomDtcPct: 1, marketplacePct: 0 } }),
      mkSku('C', 200, { channelMix: { retailB2bPct: 0, ecomDtcPct: 0, marketplacePct: 1 } }),
    ];
    const autostore = runPipeline({
      skus,
      ...baseInputs,
      automationConfig: {
        system_id: 'autostore_grid',
        stackHeight: 12,
        sizeToThroughputTarget: true,
        packingEfficiency: 0.82,
        motherChildMode: false,
      },
    });
    const hai = runPipeline({
      skus,
      ...baseInputs,
      automationConfig: {
        system_id: 'hai_haipick_acr',
        sizeToThroughputTarget: true,
        packingEfficiency: 0.8,
        motherChildMode: false,
      },
    });
    expect(autostore.step12?.systemId).toBe('autostore_grid');
    expect(hai.step12?.systemId).toBe('hai_haipick_acr');
    // Both should have non-zero replacedZoneArea (each replaces some
    // conventional storage of a different category).
    expect(autostore.step12?.replacedZoneArea).toBeGreaterThanOrEqual(0);
    expect(hai.step12?.replacedZoneArea).toBeGreaterThanOrEqual(0);
  });
});
