// Step 11 — Footprint Roll-up & Structural Checks tests.
// Cover SPEC §8 Step 11 invariants:
// - operational ×= (1 + halalUpliftFactor)
// - canopy in coverage when columned OR cantilever > exemptMaxM
// - siteArea = siteCoverage / maxSiteCoverage
// - Soft-space split kept separate (horizontal vs vertical)
// - Structural failures flip feasibility
// - infeasible = ANY of {slab, seismic, envelope, clearHeight} FAIL

import { describe, it, expect } from 'vitest';
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
import type { EngineSku, EngineBuildingEnvelope } from '../../src/engine/models';

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

describe('Step 11 — Footprint roll-up', () => {
  it('produces non-zero rollup areas for a basic engagement', () => {
    const out = runPipeline({ skus: [mkSku('A', 1000), mkSku('B', 500)], ...baseInputs });
    expect(out.step11.rollup.operationalM2).toBeGreaterThan(0);
    expect(out.step11.rollup.officeAndAmenitiesM2).toBeGreaterThan(0);
    expect(out.step11.rollup.buildingFootprintGfaM2).toBeGreaterThan(0);
    expect(out.step11.rollup.siteAreaM2).toBeGreaterThan(out.step11.rollup.siteCoverageM2);
  });

  it('halal uplift inflates operational area by 15%', () => {
    const skus = [mkSku('A', 1000)];
    const a = runPipeline({ skus, ...baseInputs, halalRequired: false });
    const b = runPipeline({ skus, ...baseInputs, halalRequired: true });
    // With halal=true, operational should be ~1.15× the non-halal version.
    // Same step5 and step10 inputs, only the multiplier differs (because
    // halalUpliftFactor only fires inside Step 11's rollup).
    const ratio = b.step11.rollup.operationalM2 / a.step11.rollup.operationalM2;
    expect(ratio).toBeCloseTo(1.15, 2);
  });

  it('cantilever canopy with overhang ≤ exempt is excluded from coverage', () => {
    const out = runPipeline({ skus: [mkSku('A', 1000)], ...baseInputs });
    // Default canopyType cantilever, overhang 1.2 m, exempt 1.2 m → not greater
    expect(out.step11.rollup.canopyCountedInCoverage).toBe(false);
  });

  it('cantilever canopy with overhang > exempt counts toward coverage', () => {
    const wideCanopyOps = { ...OPS, canopyOverhangM: 3 };
    const out = runPipeline({ skus: [mkSku('A', 1000)], ...baseInputs, opsProfile: wideCanopyOps });
    expect(out.step11.rollup.canopyCountedInCoverage).toBe(true);
    expect(out.step11.rollup.siteCoverageM2).toBeGreaterThan(out.step11.rollup.buildingFootprintGfaM2);
  });

  it('columned canopy is always counted in coverage', () => {
    const columnedOps = { ...OPS, canopyType: 'columned' as const };
    const out = runPipeline({ skus: [mkSku('A', 1000)], ...baseInputs, opsProfile: columnedOps });
    expect(out.step11.rollup.canopyCountedInCoverage).toBe(true);
  });

  it('siteArea = siteCoverage / maxSiteCoverage', () => {
    const out = runPipeline({ skus: [mkSku('A', 1000)], ...baseInputs });
    expect(out.step11.rollup.siteAreaM2).toBeCloseTo(
      out.step11.rollup.siteCoverageM2 / OPS.maxSiteCoverage,
      4
    );
  });

  it('phase2 horizontal and vertical reserved space sum to softSpace.totalM2', () => {
    const out = runPipeline({ skus: [mkSku('A', 1000)], ...baseInputs });
    expect(out.step11.rollup.softSpace.totalM2).toBeCloseTo(
      out.step11.rollup.softSpace.phase2HorizontalM2 +
        out.step11.rollup.softSpace.phase2VerticalM2,
      4
    );
  });

  it('flags slabFailure when staticSlabUdl exceeds slabLoading', () => {
    // Build SKUs with very heavy unit weight to push UDL past 5 t/m².
    const heavySku = mkSku('HEAVY', 50, { unitWeightKg: 50, caseQty: 24 });
    const lightEnv: EngineBuildingEnvelope = {
      ...ENVELOPE,
      floor: { slabLoadingTPerM2: 0.5, totalFloorAreaM2: 100000 }, // weak slab
    };
    const out = runPipeline({ skus: [heavySku], ...baseInputs, envelope: lightEnv });
    expect(out.step11.structural.slabFailure).toBe(true);
    expect(out.feasibility.slabOk).toBe(false);
    expect(out.feasibility.overall).toBe(false);
  });

  it('flags overEnvelope when buildingFootprintGfa exceeds envelope floor area', () => {
    const skus: EngineSku[] = [];
    for (let i = 0; i < 200; i++) skus.push(mkSku(`S${i}`, 5000));
    const tinyEnv: EngineBuildingEnvelope = {
      ...ENVELOPE,
      floor: { slabLoadingTPerM2: 5, totalFloorAreaM2: 1000 }, // too small
    };
    const out = runPipeline({ skus, ...baseInputs, envelope: tinyEnv });
    expect(out.step11.structural.overEnvelope).toBe(true);
    expect(out.step11.structural.envelopeShortfallM2).toBeGreaterThan(0);
    expect(out.feasibility.envelopeOk).toBe(false);
    expect(out.feasibility.overall).toBe(false);
  });

  it('infeasible = ANY of {clearHeight, seismic, slab, envelope} FAIL', () => {
    const skus = [mkSku('A', 1000)];
    // Force a clear-height failure with a very short usable rack
    const shortEnv: EngineBuildingEnvelope = {
      ...ENVELOPE,
      clearHeights: { usableRackM: 3, sprinklerClearanceM: 1 },
    };
    const out = runPipeline({ skus, ...baseInputs, envelope: shortEnv });
    expect(out.step4_5.ok).toBe(false);
    expect(out.step11.feasibilityFlags.clearHeight).toBe(false);
    expect(out.step11.infeasible).toBe(true);
  });

  it('all feasibility flags pass on a benign engagement', () => {
    const out = runPipeline({ skus: [mkSku('A', 100), mkSku('B', 50)], ...baseInputs });
    expect(out.step11.feasibilityFlags.slab).toBe(true);
    expect(out.step11.feasibilityFlags.seismic).toBe(true);
    expect(out.step11.feasibilityFlags.envelope).toBe(true);
    expect(out.step11.feasibilityFlags.clearHeight).toBe(true);
    expect(out.step11.infeasible).toBe(false);
  });
});
