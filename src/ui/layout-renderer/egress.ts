// Phase 7 — fire egress contour.
//
// SPEC §13 Phase 7: overlay a max-travel-distance contour from any point in
// storage to the nearest exit. Hatched red where the contour fails (i.e.
// distance to nearest exit > maxDistanceM, default 45 m).
//
// Implementation: rasterise the envelope to a coarse grid; for each cell
// take the Euclidean distance to the closest door centre. We don't model
// rack obstructions — this is a planning-stage feasibility hint, not a
// code-compliant fire-engineering calc.

import { doorCentre } from './flow';
import { pointInPolygon } from './solver';
import type { LayoutResult } from './types';

export interface EgressGrid {
  /** Cell width / depth (m). Default 5. */
  cellM: number;
  /** All cells whose nearest exit is > maxDistanceM away. */
  failingCells: { x: number; y: number; widthM: number; depthM: number; distanceM: number }[];
  /** Max-travel-distance threshold this grid was computed against. */
  maxDistanceM: number;
}

interface BuildEgressInputs {
  layout: LayoutResult;
  /** SPEC default 45 m. */
  maxDistanceM?: number;
  /** Cell size (m). 5 m by default — 25×16 grid for a 125×80 envelope. */
  cellM?: number;
}

export function computeEgressGrid(inputs: BuildEgressInputs): EgressGrid {
  const { layout } = inputs;
  const maxDistanceM = inputs.maxDistanceM ?? 45;
  const cellM = inputs.cellM ?? 5;

  if (layout.doors.length === 0) {
    return { cellM, maxDistanceM, failingCells: [] };
  }

  const exits = layout.doors.map((d) =>
    doorCentre(d, layout.envelopeLengthM, layout.envelopeWidthM)
  );

  const failingCells: EgressGrid['failingCells'] = [];
  for (let x = 0; x < layout.envelopeLengthM; x += cellM) {
    for (let y = 0; y < layout.envelopeWidthM; y += cellM) {
      const cx = x + cellM / 2;
      const cy = y + cellM / 2;
      // Polygon clip: ignore cells outside the polygon (they're not
      // floor space anyway).
      if (
        layout.polygon &&
        layout.polygon.length >= 3 &&
        !pointInPolygon({ x: cx, y: cy }, layout.polygon)
      ) {
        continue;
      }
      let minDist = Infinity;
      for (const e of exits) {
        const dx = cx - e.x;
        const dy = cy - e.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < minDist) minDist = d;
      }
      if (minDist > maxDistanceM) {
        failingCells.push({
          x,
          y,
          widthM: cellM,
          depthM: cellM,
          distanceM: minDist,
        });
      }
    }
  }
  return { cellM, maxDistanceM, failingCells };
}
