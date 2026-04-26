// Phase 5 + 7 — Layout solver tests.
// Cover the SPEC §13 invariants:
// - Phase 5: rectangle packing, overflow flagging, dock placement, support strip
// - Phase 7: polygon envelopes, per-zone aisle hints, infeasibility roll-up

import { describe, it, expect } from 'vitest';
import { runPipeline } from '../../src/engine/pipeline';
import { runLayoutSolver, pointInPolygon } from '../../src/ui/layout-renderer/solver';
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

describe('Phase 7 — Polygon envelope + aisle hints', () => {
  it('returns polygon vertices on the result when supplied', () => {
    const skus = [mkSku('A', 500)];
    const result = runPipeline({ skus, ...baseInputs });
    const polygonVertices = [
      { x: 0, y: 0 },
      { x: ENVELOPE.envelope.lengthM, y: 0 },
      { x: ENVELOPE.envelope.lengthM, y: ENVELOPE.envelope.widthM },
      { x: 0, y: ENVELOPE.envelope.widthM },
    ];
    const layout = runLayoutSolver({
      result,
      envelope: { ...ENVELOPE, envelope: { ...ENVELOPE.envelope, polygonVertices } },
    });
    expect(layout.polygon).toEqual(polygonVertices);
    expect(layout.columnGrid).toEqual(ENVELOPE.columnGrid);
  });

  it('falls back to a rectangle envelope when polygonVertices is null', () => {
    const skus = [mkSku('A', 500)];
    const result = runPipeline({ skus, ...baseInputs });
    const layout = runLayoutSolver({ result, envelope: ENVELOPE });
    expect(layout.polygon).toBeNull();
  });

  it('flags rects that fall outside an L-shaped polygon as overflow', () => {
    // L-shape: cuts the NE quadrant out of a 125×80 envelope. Storage normally
    // packs across the whole north strip — at least one rect must straddle
    // the cut-out, so we expect retro-overflow flagging.
    const skus = [mkSku('A', 4000)];
    const result = runPipeline({ skus, ...baseInputs });
    const Lx = ENVELOPE.envelope.lengthM;
    const Ly = ENVELOPE.envelope.widthM;
    // L-shape: missing NE corner (x ≥ 70, y ≥ 50).
    const polygonVertices = [
      { x: 0, y: 0 },
      { x: Lx, y: 0 },
      { x: Lx, y: 50 },
      { x: 70, y: 50 },
      { x: 70, y: Ly },
      { x: 0, y: Ly },
    ];
    const layout = runLayoutSolver({
      result,
      envelope: { ...ENVELOPE, envelope: { ...ENVELOPE.envelope, polygonVertices } },
    });
    expect(layout.polygon).toEqual(polygonVertices);
    // At least one rect must touch the cut-out region; the solver should
    // mark it as overflow.
    const overflowing = layout.rects.filter((r) => r.overflow);
    expect(overflowing.length).toBeGreaterThan(0);
    expect(layout.overflowed).toBe(true);
  });

  it('attaches an aisle hint with orientation + count to every storage rect', () => {
    const skus = [mkSku('A', 1000)];
    const result = runPipeline({ skus, ...baseInputs });
    const layout = runLayoutSolver({ result, envelope: ENVELOPE });
    const storageRects = layout.rects.filter((r) => r.role.startsWith('storage_'));
    expect(storageRects.length).toBeGreaterThan(0);
    for (const r of storageRects) {
      expect(r.aisles).toBeDefined();
      expect(r.aisles!.count).toBeGreaterThanOrEqual(0);
      expect(['matches_flow', 'perpendicular_to_flow']).toContain(r.aisles!.orientation);
    }
  });

  it('rolls up Step 11 feasibility flags into the infeasibility overlay', () => {
    const skus = [mkSku('A', 500)];
    const result = runPipeline({ skus, ...baseInputs });
    const layout = runLayoutSolver({ result, envelope: ENVELOPE });
    expect(layout.infeasibility).toBeDefined();
    // Happy-path inputs leave all four flags clean.
    expect(layout.infeasibility.envelopeOverflow).toBe(false);
    expect(layout.infeasibility.clearHeightFail).toBe(false);
    expect(layout.infeasibility.slabFail).toBe(false);
    expect(layout.infeasibility.seismicFail).toBe(false);
  });

  it('point-in-polygon helper is sane on a square', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 11, y: 5 }, square)).toBe(false);
    expect(pointInPolygon({ x: -1, y: 5 }, square)).toBe(false);
    expect(pointInPolygon({ x: 5, y: 11 }, square)).toBe(false);
  });
});
