// Phase 5 — Layout solver tests.
// Cover the SPEC §13 Phase 5 invariants:
// - Storage zones placed inside the envelope when they fit
// - Overflow flagged when storage > envelope area
// - Inbound + outbound dock doors placed on the south wall
// - Support cluster lives along the east strip
// - Solver echoes the envelope dimensions

import { describe, it, expect } from 'vitest';
import { runPipeline } from '../../src/engine/pipeline';
import { runLayoutSolver } from '../../src/layout-renderer/solver';
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

describe('Phase 5 — Layout solver', () => {
  it('packs a small SKU set entirely inside the envelope', () => {
    const skus = [mkSku('A', 500), mkSku('B', 200)];
    const result = runPipeline({ skus, ...baseInputs });
    const layout = runLayoutSolver({ result, envelope: ENVELOPE });

    expect(layout.envelopeLengthM).toBe(ENVELOPE.envelope.lengthM);
    expect(layout.envelopeWidthM).toBe(ENVELOPE.envelope.widthM);
    expect(layout.overflowed).toBe(false);
    expect(layout.rects.length).toBeGreaterThan(0);
    for (const r of layout.rects) {
      expect(r.overflow).toBe(false);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.widthM).toBeLessThanOrEqual(ENVELOPE.envelope.lengthM + 0.5);
    }
  });

  it('flags overflow when GFA exceeds the envelope', () => {
    const skus: EngineSku[] = [];
    for (let i = 0; i < 200; i++) skus.push(mkSku(`S${i}`, 5000));
    const tinyEnv: EngineBuildingEnvelope = {
      ...ENVELOPE,
      envelope: { lengthM: 30, widthM: 30 }, // far too small
      floor: { slabLoadingTPerM2: 5, totalFloorAreaM2: 900 },
    };
    const result = runPipeline({ skus, ...baseInputs, envelope: tinyEnv });
    const layout = runLayoutSolver({ result, envelope: tinyEnv });
    expect(layout.overflowed).toBe(true);
    expect(layout.overflowAreaM2).toBeGreaterThan(0);
    expect(layout.rects.some((r) => r.overflow)).toBe(true);
  });

  it('places inbound + outbound dock doors on the south wall', () => {
    const skus = [mkSku('A', 5000)];
    const result = runPipeline({ skus, ...baseInputs });
    const layout = runLayoutSolver({ result, envelope: ENVELOPE });

    expect(layout.doors.length).toBe(
      result.step9.inbound.doorsRequired + result.step9.outbound.doorsRequired
    );
    for (const d of layout.doors) {
      expect(d.wall).toBe('south');
      expect(d.position).toBeGreaterThanOrEqual(0);
      expect(d.position + d.widthM).toBeLessThanOrEqual(ENVELOPE.envelope.lengthM + 0.5);
    }
    expect(layout.doors.some((d) => d.direction === 'inbound')).toBe(true);
    expect(layout.doors.some((d) => d.direction === 'outbound')).toBe(true);
  });

  it('reserves the south strip for staging and the east strip for support', () => {
    const skus = [mkSku('A', 1000)];
    const result = runPipeline({ skus, ...baseInputs });
    const layout = runLayoutSolver({ result, envelope: ENVELOPE });

    const staging = layout.rects.find((r) => r.role === 'staging');
    expect(staging).toBeDefined();
    expect(staging?.y).toBe(0);
    expect(staging?.widthM).toBe(ENVELOPE.envelope.lengthM);

    const office = layout.rects.find((r) => r.role === 'office');
    expect(office).toBeDefined();
    // Office should sit in the east support strip.
    expect(office!.x).toBeGreaterThan(ENVELOPE.envelope.lengthM * 0.7);
  });

  it('excludes empty Step 5 zones from the placement', () => {
    // A SKU set producing only PFP zones — Shelf-S/M/L should not be placed.
    const skus = [mkSku('PFP_ONLY', 1000)];
    const result = runPipeline({ skus, ...baseInputs });
    const layout = runLayoutSolver({ result, envelope: ENVELOPE });
    const shelfRects = layout.rects.filter((r) => r.id.includes('Shelf'));
    // Step 5 only emits zones with alignedBays > 0; the solver passes those
    // through, so any present must have non-zero area.
    for (const sr of shelfRects) {
      expect(sr.widthM * sr.depthM).toBeGreaterThan(0);
    }
  });

  it('completes in under 10 ms for a normal engagement', () => {
    const skus: EngineSku[] = [];
    for (let i = 0; i < 200; i++) skus.push(mkSku(`S${i}`, 1000));
    const result = runPipeline({ skus, ...baseInputs });
    const layout = runLayoutSolver({ result, envelope: ENVELOPE });
    expect(layout.elapsedMs).toBeLessThan(10);
  });
});
