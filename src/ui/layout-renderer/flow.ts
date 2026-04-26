// Phase 7 — flow-pattern path generator.
//
// Translates a flow pattern (I / U / L / custom) plus the dock placements
// into a list of polyline arrows. The renderer draws each path with a
// `marker-end="url(#flow-arrow)"` arrowhead.
//
// All coordinates are in envelope-local m (SW origin, +x east, +y north).

import type { LayoutResult, PlacedDoor } from './types';
import type { FlowPattern } from '../../stores/layout-view.store';

export interface FlowPath {
  id: string;
  /** Polyline points in m. Length ≥ 2. */
  points: { x: number; y: number }[];
  /** 'inbound' = receiving lane, 'outbound' = shipping lane. */
  direction: 'inbound' | 'outbound';
}

interface BuildFlowInputs {
  layout: LayoutResult;
  pattern: FlowPattern;
}

export function buildFlowPaths(inputs: BuildFlowInputs): FlowPath[] {
  const { layout, pattern } = inputs;

  const inboundDoors = layout.doors.filter((d) => d.direction === 'inbound');
  const outboundDoors = layout.doors.filter((d) => d.direction === 'outbound');
  if (inboundDoors.length === 0 && outboundDoors.length === 0) return [];

  const inboundCentre = doorsCentroid(inboundDoors, layout.envelopeLengthM, layout.envelopeWidthM);
  const outboundCentre = doorsCentroid(outboundDoors, layout.envelopeLengthM, layout.envelopeWidthM);

  // Storage centroid: average of all non-overflow storage rects.
  const storageRects = layout.rects.filter(
    (r) => !r.overflow && r.role.startsWith('storage_')
  );
  const storageCentre = storageRects.length
    ? {
        x:
          storageRects.reduce((acc, r) => acc + r.x + r.widthM / 2, 0) /
          storageRects.length,
        y:
          storageRects.reduce((acc, r) => acc + r.y + r.depthM / 2, 0) /
          storageRects.length,
      }
    : { x: layout.envelopeLengthM / 2, y: layout.envelopeWidthM / 2 };

  switch (pattern) {
    case 'I_flow':
      // Straight north-bound through-flow: inbound → storage → outbound (off
      // the back wall). Renders one in-leg + one out-leg if both door sets
      // exist; otherwise a single leg.
      return [
        ...(inboundCentre
          ? [
              {
                id: 'flow_in',
                direction: 'inbound' as const,
                points: [inboundCentre, storageCentre],
              },
            ]
          : []),
        ...(outboundCentre
          ? [
              {
                id: 'flow_out',
                direction: 'outbound' as const,
                points: [
                  storageCentre,
                  { x: storageCentre.x, y: layout.envelopeWidthM - 4 },
                ],
              },
            ]
          : []),
      ];

    case 'U_flow':
      // Inbound enters south-west, flows north into storage, loops around
      // storage centroid, and exits south-east.
      return [
        ...(inboundCentre
          ? [
              {
                id: 'flow_in',
                direction: 'inbound' as const,
                points: [
                  inboundCentre,
                  { x: inboundCentre.x, y: storageCentre.y },
                  storageCentre,
                ],
              },
            ]
          : []),
        ...(outboundCentre
          ? [
              {
                id: 'flow_out',
                direction: 'outbound' as const,
                points: [
                  storageCentre,
                  { x: outboundCentre.x, y: storageCentre.y },
                  outboundCentre,
                ],
              },
            ]
          : []),
      ];

    case 'L_flow':
      // Inbound on south wall → north then east → outbound on east wall.
      return [
        ...(inboundCentre
          ? [
              {
                id: 'flow_in',
                direction: 'inbound' as const,
                points: [
                  inboundCentre,
                  { x: inboundCentre.x, y: storageCentre.y },
                  storageCentre,
                ],
              },
            ]
          : []),
        ...(outboundCentre
          ? [
              {
                id: 'flow_out',
                direction: 'outbound' as const,
                points: [
                  storageCentre,
                  {
                    x: layout.envelopeLengthM - 4,
                    y: storageCentre.y,
                  },
                ],
              },
            ]
          : []),
      ];

    case 'custom':
    default:
      // Direct curves from each door centroid to storage centroid.
      return [
        ...(inboundCentre
          ? [
              {
                id: 'flow_in',
                direction: 'inbound' as const,
                points: [inboundCentre, storageCentre],
              },
            ]
          : []),
        ...(outboundCentre
          ? [
              {
                id: 'flow_out',
                direction: 'outbound' as const,
                points: [storageCentre, outboundCentre],
              },
            ]
          : []),
      ];
  }
}

function doorsCentroid(
  doors: PlacedDoor[],
  envelopeLengthM: number,
  envelopeWidthM: number
): { x: number; y: number } | null {
  if (doors.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const d of doors) {
    const c = doorCentre(d, envelopeLengthM, envelopeWidthM);
    sx += c.x;
    sy += c.y;
  }
  return { x: sx / doors.length, y: sy / doors.length };
}

export function doorCentre(
  d: PlacedDoor,
  envelopeLengthM: number,
  envelopeWidthM: number
): { x: number; y: number } {
  const along = d.position + d.widthM / 2;
  switch (d.wall) {
    case 'south':
      return { x: along, y: 0 };
    case 'north':
      return { x: along, y: envelopeWidthM };
    case 'west':
      return { x: 0, y: along };
    case 'east':
      return { x: envelopeLengthM, y: along };
  }
}
