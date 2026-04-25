// Phase 3 gate: engine runs end-to-end on test data. This test composes
// every step in src/engine/pipeline.ts and asserts the result envelope is
// well-formed and feasibility flags resolve correctly across happy and
// constrained paths.

import { describe, it, expect } from 'vitest';
import { runPipeline } from '../../src/engine/pipeline';
import type { EngineSku, EngineBuildingEnvelope } from '../../src/engine/models';
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

describe('Phase 3 gate — engine pipeline runs end-to-end', () => {
  it('completes happy-path with feasibility=true on a small clean SKU set', () => {
    const skus = [mkSku('A', 500), mkSku('B', 200), mkSku('C', 100), mkSku('D', 50)];
    const out = runPipeline({ skus, ...baseInputs });

    expect(out.validation.fatalErrors).toHaveLength(0);
    expect(out.step1.profiles).toHaveLength(4);
    expect(out.step3.rows).toHaveLength(4);
    expect(out.step4.pfp.alignedBays).toBeGreaterThan(0);
    expect(out.step5.totalAlignedAreaM2).toBeGreaterThan(0);
    expect(out.step6.daily.outboundPallets).toBeGreaterThan(0);
    expect(out.step7.totalPeakFte).toBeGreaterThan(0);
    expect(out.step8.totalUnits).toBeGreaterThanOrEqual(0);
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
    const out = runPipeline({ skus, ...baseInputs, envelope: shortEnv });
    expect(out.feasibility.clearHeightOk).toBe(false);
    expect(out.feasibility.overall).toBe(false);
  });

  it('honours the suppressed-SKU set produced by Step 0', () => {
    const goodSku = mkSku('GOOD', 100);
    const zeroSku = mkSku('ZERO', 0);
    zeroSku.weeklyUnits = new Float32Array(52);
    zeroSku.weeksOnFile = 0;
    const out = runPipeline({ skus: [goodSku, zeroSku], ...baseInputs });
    expect(out.validation.suppressedSkus.has('ZERO')).toBe(true);
    expect(out.step1.profiles.map((p) => p.skuId)).toEqual(['GOOD']);
  });

  it('blocks fatal-error SKUs from contributing to slot sizing', () => {
    const ok = mkSku('OK', 100);
    const bad = mkSku('BAD', 100, { caseQty: 0 }); // ZERO_CASE_QTY → fatal
    const out = runPipeline({ skus: [ok, bad], ...baseInputs });
    expect(out.validation.fatalErrors.some((e) => e.skuId === 'BAD')).toBe(true);
    expect(out.step3.rows.map((r) => r.skuId)).toEqual(['OK']);
    expect(out.feasibility.overall).toBe(false);
  });

  it('runs 5k SKUs end-to-end inside the SPEC §14 50ms budget headroom', () => {
    const skus: EngineSku[] = [];
    for (let i = 0; i < 5000; i++) skus.push(mkSku(`S${i}`, 50 + (i % 200)));
    const t0 = performance.now();
    const out = runPipeline({ skus, ...baseInputs });
    const elapsed = performance.now() - t0;
    console.log(`pipeline 5k skus: ${elapsed.toFixed(0)}ms`);
    expect(out.meta.skuCount).toBe(5000);
    // Soft assertion — SPEC budget is 50 ms; allow 10× headroom in CI.
    expect(elapsed).toBeLessThan(500);
  });
});
