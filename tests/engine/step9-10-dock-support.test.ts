// Step 9 (Dock Schedule) and Step 10 (Support Areas) tests.
// Cover SPEC §8 Step 9 / 10 invariants:
// - Door cycle blends across the container mix
// - doorsRequired scales with throughput at percentileDocks
// - Office = (admin + supervisor) × regionalOfficeM2PerFte
// - Surau triggered only when MY/ID + muslim staff ≥ 40
// - Customs only when isBonded
// - Halal uplift factor 0.15 when halalRequired

import { describe, it, expect } from 'vitest';
import { runPipeline } from '../../src/engine/pipeline';
import { runStep10SupportAreas } from '../../src/engine/steps/Step10SupportAreas';
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

describe('Step 9 — Dock schedule', () => {
  it('produces non-zero doors for non-zero throughput', () => {
    const out = runPipeline({
      skus: [mkSku('A', 5000), mkSku('B', 3000)],
      ...baseInputs,
    });
    expect(out.step9.inbound.doorsRequired).toBeGreaterThan(0);
    expect(out.step9.outbound.doorsRequired).toBeGreaterThan(0);
    expect(out.step9.totalDoors).toBe(
      out.step9.inbound.doorsRequired + out.step9.outbound.doorsRequired
    );
  });

  it('inbound mix is balanced 40HC palletised dominant by default', () => {
    const out = runPipeline({ skus: [mkSku('A', 1000)], ...baseInputs });
    expect(out.step9.inboundMix.forty_hc_pal).toBeCloseTo(0.4, 2);
  });

  it('blendedCycleMin lies between fastest (cross-dock 12) and slowest (40HC floor 60)', () => {
    const out = runPipeline({ skus: [mkSku('A', 1000)], ...baseInputs });
    expect(out.step9.inbound.blendedCycleMin).toBeGreaterThan(12);
    expect(out.step9.inbound.blendedCycleMin).toBeLessThan(60);
  });

  it('staging area scales with cross-dock share', () => {
    const skus = [mkSku('A', 1000)];
    const out = runPipeline({ skus, ...baseInputs });
    // The default crossDockPct is 0; only QC + decant contributes.
    expect(out.step9.staging.fastCrossDockM2).toBe(0);
    expect(out.step9.staging.qcDecantM2).toBeGreaterThan(0);
  });

  it('warns when total doors exceed typical facility limit', () => {
    // Big throughput with low productive hours forces high door count.
    const skus = [];
    for (let i = 0; i < 200; i++) skus.push(mkSku(`S${i}`, 50000));
    const out = runPipeline({ skus, ...baseInputs });
    if (out.step9.totalDoors > 80) {
      expect(out.step9.warnings).toContain('DOORS_EXCEED_TYPICAL_FACILITY_LIMIT');
    }
  });
});

describe('Step 10 — Support areas', () => {
  it('office = (admin + supervisor) × regionalOfficeM2PerFte', () => {
    const out = runPipeline({ skus: [mkSku('A', 1000)], ...baseInputs });
    const expected = (OPS.adminFte + OPS.supervisorFte) * REGIONAL.officeM2PerFte;
    expect(out.step10.areas.office).toBeCloseTo(expected, 2);
  });

  it('Surau is zero in KR (non-Muslim region)', () => {
    const out = runPipeline({ skus: [mkSku('A', 1000)], ...baseInputs });
    expect(out.step10.areas.surau).toBe(0);
    expect(out.step10.areas.ablution).toBe(0);
  });

  it('Surau is sized in MY when muslim staff ≥ 40', () => {
    // OPS.totalStaff = 85, MY muslimWorkforcePct = 0.7 → 60 muslim → above threshold
    const out = runPipeline({ skus: [mkSku('A', 1000)], ...baseInputs, regional: REGIONAL_MY });
    expect(out.step10.areas.surau).toBeGreaterThan(0);
    expect(out.step10.areas.ablution).toBeGreaterThan(0);
    // Per SPEC: 15 m² per 50 muslim staff. 60 muslim → ceil(60/50) = 2 → 30 m².
    expect(out.step10.areas.surau).toBe(30);
    expect(out.step10.areas.ablution).toBe(6);
  });

  it('warns when region requires Surau but headcount is below threshold', () => {
    const lowStaffOps = { ...OPS, totalStaff: 50 }; // 50 × 0.7 = 35 < 40
    const out = runPipeline({
      skus: [mkSku('A', 1000)],
      ...baseInputs,
      opsProfile: lowStaffOps,
      regional: REGIONAL_MY,
    });
    expect(out.step10.warnings).toContain('SURAU_REQUIRED_BUT_HEADCOUNT_BELOW_THRESHOLD');
  });

  it('halal uplift factor is 0.15 when halalRequired and 0 otherwise', () => {
    const a = runPipeline({ skus: [mkSku('A', 1000)], ...baseInputs, halalRequired: false });
    const b = runPipeline({ skus: [mkSku('A', 1000)], ...baseInputs, halalRequired: true });
    expect(a.step10.halalUpliftFactor).toBe(0);
    expect(b.step10.halalUpliftFactor).toBeCloseTo(0.15, 4);
  });

  it('customs zone is non-zero only when isBonded', () => {
    const a = runPipeline({ skus: [mkSku('A', 1000)], ...baseInputs, isBonded: false });
    const b = runPipeline({ skus: [mkSku('A', 1000)], ...baseInputs, isBonded: true });
    expect(a.step10.areas.customs).toBe(0);
    expect(b.step10.areas.customs).toBeGreaterThan(0);
  });

  it('VAS area = benches × 12 + 20 m² staging', () => {
    const out = runPipeline({ skus: [mkSku('A', 1000)], ...baseInputs });
    expect(out.step10.areas.vas).toBeCloseTo(OPS.vasBenches * 12 + 20, 2);
  });

  it('total support = operational + officeAndAmenities', () => {
    const out = runPipeline({ skus: [mkSku('A', 1000)], ...baseInputs });
    expect(out.step10.totalSupportM2).toBeCloseTo(
      out.step10.operationalSupportM2 + out.step10.officeAndAmenitiesM2,
      2
    );
  });

  it('lithium kVA buffer scales with total fleet kVA', () => {
    const out = runPipeline({ skus: [mkSku('A', 5000), mkSku('B', 3000)], ...baseInputs });
    const kvaTotal = out.step8.totalChargingKva;
    expect(out.step10.areas.lithiumKvaBufferM2).toBeCloseTo(kvaTotal * 0.5, 4);
  });

  it('antechamber is non-zero only when envelope flags it required', () => {
    const out1 = runPipeline({ skus: [mkSku('A', 1000)], ...baseInputs });
    const tropicalEnv = {
      ...ENVELOPE,
      coldChain: {
        ...ENVELOPE.coldChain,
        antechamberRequired: true,
        antechamberM2: 30,
      },
    };
    const out2 = runPipeline({ skus: [mkSku('A', 1000)], ...baseInputs, envelope: tropicalEnv });
    expect(out1.step10.areas.tempAntechamber).toBe(0);
    expect(out2.step10.areas.tempAntechamber).toBe(30);
  });

  it('responds to halalRequired flag in standalone Step 10 call', () => {
    const halal = runStep10SupportAreas({
      step5: { zones: [], totalRawAreaM2: 0, totalAlignedAreaM2: 0, averageGridEfficiency: 1 },
      step6: {
        daily: { inboundPallets: 0, outboundPallets: 0, pickLinesPerDay: 0, repackPallets: 0, decantPallets: 0 },
        peak: { inboundPallets: 0, outboundPallets: 0, pickLinesPerDay: 0 },
        pickLinesByVelocity: { A: 0, B: 0, C: 0, D: 0 },
        pickLinesByMethod: { pallet: 0, case: 0, each: 0 },
      },
      step7: {
        tasks: [],
        totalBaseFte: 0,
        totalPeakFte: 0,
        ftePerCategory: {
          pallet_putaway: 0,
          pallet_replenishment: 0,
          pallet_pick: 0,
          case_pick: 0,
          each_pick: 0,
          repack: 0,
          decant: 0,
          vas: 0,
          returns: 0,
          qc: 0,
        },
        availability: 1,
        ramadanAnnualImpact: 0,
        warnings: [],
      },
      step8: { fleets: [], totalUnits: 0, totalChargingFootprintM2: 0, totalChargingKva: 0, taskRouting: {
        pallet_putaway: null,
        pallet_pick: null,
        pallet_replenishment: null,
        case_pick: null,
        each_pick: null,
        decant: null,
        repack: null,
        vas: null,
        returns: null,
        qc: null,
      } },
      opsProfile: OPS,
      envelope: ENVELOPE,
      regional: REGIONAL,
      halalRequired: true,
      isBonded: false,
    });
    expect(halal.halalUpliftFactor).toBeCloseTo(0.15, 4);
  });
});
