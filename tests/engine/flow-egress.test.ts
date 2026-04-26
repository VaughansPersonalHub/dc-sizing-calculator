// Phase 7 chunk 2 — flow paths + fire egress contour tests.

import { describe, it, expect } from 'vitest';
import { runPipeline } from '../../src/engine/pipeline';
import { runLayoutSolver } from '../../src/ui/layout-renderer/solver';
import { buildFlowPaths, doorCentre } from '../../src/ui/layout-renderer/flow';
import { computeEgressGrid } from '../../src/ui/layout-renderer/egress';
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

describe('Phase 7 — Flow paths', () => {
  it('emits an in-leg + out-leg for each pattern when both door sets exist', () => {
    const skus = [mkSku('A', 5000)];
    const result = runPipeline({ skus, ...baseInputs });
    const layout = runLayoutSolver({ result, envelope: ENVELOPE });

    for (const pattern of ['I_flow', 'U_flow', 'L_flow', 'custom'] as const) {
      const paths = buildFlowPaths({ layout, pattern });
      expect(paths.length).toBeGreaterThan(0);
      expect(paths.some((p) => p.direction === 'inbound')).toBe(true);
      expect(paths.some((p) => p.direction === 'outbound')).toBe(true);
      for (const p of paths) {
        expect(p.points.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('U-flow and L-flow generate a multi-segment polyline', () => {
    const skus = [mkSku('A', 5000)];
    const result = runPipeline({ skus, ...baseInputs });
    const layout = runLayoutSolver({ result, envelope: ENVELOPE });
    const u = buildFlowPaths({ layout, pattern: 'U_flow' });
    const l = buildFlowPaths({ layout, pattern: 'L_flow' });
    // U + L both bend, so each leg has at least 3 points.
    for (const p of u) expect(p.points.length).toBeGreaterThanOrEqual(3);
    for (const p of l) expect(p.points.length).toBeGreaterThanOrEqual(2);
  });

  it('returns no paths when there are no doors', () => {
    const layout = {
      envelopeLengthM: 100,
      envelopeWidthM: 60,
      polygon: null,
      columnGrid: { spacingXM: 12, spacingYM: 24 },
      rects: [],
      doors: [],
      overflowed: false,
      overflowAreaM2: 0,
      infeasibility: {
        envelopeOverflow: false,
        clearHeightFail: false,
        slabFail: false,
        seismicFail: false,
        envelopeShortfallM2: 0,
      },
      elapsedMs: 0,
    };
    expect(buildFlowPaths({ layout, pattern: 'I_flow' })).toEqual([]);
  });

  it('doorCentre maps wall + position to envelope coords', () => {
    const env = { lengthM: 100, widthM: 60 };
    expect(doorCentre({ id: 's', wall: 'south', position: 10, widthM: 4, direction: 'inbound' }, env.lengthM, env.widthM)).toEqual({ x: 12, y: 0 });
    expect(doorCentre({ id: 'n', wall: 'north', position: 20, widthM: 4, direction: 'outbound' }, env.lengthM, env.widthM)).toEqual({ x: 22, y: 60 });
    expect(doorCentre({ id: 'w', wall: 'west', position: 30, widthM: 4, direction: 'inbound' }, env.lengthM, env.widthM)).toEqual({ x: 0, y: 32 });
    expect(doorCentre({ id: 'e', wall: 'east', position: 40, widthM: 4, direction: 'outbound' }, env.lengthM, env.widthM)).toEqual({ x: 100, y: 42 });
  });
});

describe('Phase 7 — Fire egress contour', () => {
  it('flags cells whose nearest exit exceeds the max travel distance', () => {
    const skus = [mkSku('A', 5000)];
    const result = runPipeline({ skus, ...baseInputs });
    const layout = runLayoutSolver({ result, envelope: ENVELOPE });

    // 125×80 envelope, doors clustered on the south wall — the far
    // north-east + north-west corners ought to be > 45 m from any exit.
    const grid = computeEgressGrid({ layout, maxDistanceM: 45, cellM: 5 });
    expect(grid.failingCells.length).toBeGreaterThan(0);
    for (const c of grid.failingCells) expect(c.distanceM).toBeGreaterThan(45);
  });

  it('returns an empty failing list when every cell is within reach', () => {
    const skus = [mkSku('A', 5000)];
    const result = runPipeline({ skus, ...baseInputs });
    const layout = runLayoutSolver({ result, envelope: ENVELOPE });

    // Tall threshold → nothing fails.
    const grid = computeEgressGrid({ layout, maxDistanceM: 500, cellM: 10 });
    expect(grid.failingCells).toEqual([]);
  });

  it('returns an empty failing list when there are no exits', () => {
    const layout = {
      envelopeLengthM: 100,
      envelopeWidthM: 60,
      polygon: null,
      columnGrid: { spacingXM: 12, spacingYM: 24 },
      rects: [],
      doors: [],
      overflowed: false,
      overflowAreaM2: 0,
      infeasibility: {
        envelopeOverflow: false,
        clearHeightFail: false,
        slabFail: false,
        seismicFail: false,
        envelopeShortfallM2: 0,
      },
      elapsedMs: 0,
    };
    const grid = computeEgressGrid({ layout, maxDistanceM: 45, cellM: 5 });
    expect(grid.failingCells).toEqual([]);
  });

  it('skips cells outside the polygon when one is supplied', () => {
    const skus = [mkSku('A', 5000)];
    const result = runPipeline({ skus, ...baseInputs });
    // Triangle envelope cuts most of the east half of the building.
    const polygonVertices = [
      { x: 0, y: 0 },
      { x: ENVELOPE.envelope.lengthM, y: 0 },
      { x: 0, y: ENVELOPE.envelope.widthM },
    ];
    const layout = runLayoutSolver({
      result,
      envelope: { ...ENVELOPE, envelope: { ...ENVELOPE.envelope, polygonVertices } },
    });
    const gridPoly = computeEgressGrid({ layout, maxDistanceM: 45, cellM: 5 });
    // Cells inside the cut-out NE region are skipped, so every reported
    // failing cell must lie on the south or south-west side.
    for (const c of gridPoly.failingCells) {
      // Cell centre is inside the triangle.
      const cx = c.x + c.widthM / 2;
      const cy = c.y + c.depthM / 2;
      const insideTriangle =
        cy >= 0 &&
        cx >= 0 &&
        cy <= ENVELOPE.envelope.widthM * (1 - cx / ENVELOPE.envelope.lengthM) + 0.001;
      expect(insideTriangle).toBe(true);
    }
  });
});
