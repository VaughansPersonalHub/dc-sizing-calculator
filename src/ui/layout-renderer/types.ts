// Layout renderer types. Phase 7 layers polygon envelopes, per-zone aisle
// orientation, flexible dock placement, infeasibility overlays, and 11
// toggleable layers on top of the Phase 5 rectangle skeleton.

export type LayoutZoneRole =
  | 'storage_pfp'
  | 'storage_cls'
  | 'storage_shelf'
  | 'staging'
  | 'office'
  | 'amenities'
  | 'support'
  | 'customs'
  | 'battery'
  | 'antechamber'
  | 'overflow';

export interface PlacedRect {
  /** Stable identifier — used for D3 keying and selection. */
  id: string;
  role: LayoutZoneRole;
  label: string;
  /** Origin (m) inside the envelope coordinate system; (0,0) = SW corner. */
  x: number;
  y: number;
  widthM: number;
  depthM: number;
  /** True when the rectangle could not fit inside the envelope. */
  overflow: boolean;
  /**
   * Per-storage-zone aisle hint (Phase 7). Drives the thin-grey aisle
   * strokes inside the zone in the layer renderer. Undefined for non-storage
   * rects (staging, support, etc.) and for zero-aisle storage cells.
   */
  aisles?: ZoneAisleHint;
}

export interface ZoneAisleHint {
  /**
   * 'matches_flow' = aisles run with the dock-face flow (north-south, vertical
   * lines on the diagram). 'perpendicular_to_flow' = aisles run east-west.
   */
  orientation: 'matches_flow' | 'perpendicular_to_flow';
  /** Number of aisles to draw inside the zone. */
  count: number;
}

export interface PlacedDoor {
  id: string;
  /**
   * Wall the door is on. Phase 5 used 'south' only; Phase 7 supports any wall
   * via flexible dock placement (click any wall segment in the renderer).
   */
  wall: 'north' | 'south' | 'east' | 'west';
  /** Position along the wall (m from the SW corner of that wall). */
  position: number;
  /** Door opening width (m). */
  widthM: number;
  /** 'inbound' / 'outbound' — drives icon colour in the renderer. */
  direction: 'inbound' | 'outbound';
}

/**
 * Polygon envelope vertices in local m coords (SW origin), closed implicitly
 * (last vertex connects back to first). Optional — when null the renderer
 * uses the bounding rectangle from envelopeLengthM × envelopeWidthM.
 */
export type LayoutPolygon = { x: number; y: number }[] | null;

/**
 * Cumulative infeasibility flags from Step 11 + the solver's polygon-clip.
 * Drives the Phase 7 infeasibility overlay on the renderer.
 */
export interface LayoutInfeasibility {
  /** GFA exceeds envelope area. */
  envelopeOverflow: boolean;
  /** Step 4.5 — usableRackM below required clearHeightMm. */
  clearHeightFail: boolean;
  /** Step 11 — slab UDL below required loading. */
  slabFail: boolean;
  /** Step 4.6 — seismic mass above allowable. */
  seismicFail: boolean;
  /** m² shortfall when GFA exceeds envelope. */
  envelopeShortfallM2: number;
}

export interface LayoutResult {
  /** Envelope outline (m) the solver packed against. */
  envelopeLengthM: number;
  envelopeWidthM: number;
  /** Optional polygon outline (m). Null → render the bounding rectangle. */
  polygon: LayoutPolygon;
  /** Column grid spacing (m) for the grid layer. */
  columnGrid: { spacingXM: number; spacingYM: number };
  /** All zones the solver placed (storage + staging + support). */
  rects: PlacedRect[];
  /** Inbound + outbound dock door placements. */
  doors: PlacedDoor[];
  /** True when at least one rect overflowed the envelope. */
  overflowed: boolean;
  /** Total m² that didn't fit (sum of overflowing rect areas). */
  overflowAreaM2: number;
  /** Cumulative feasibility flags surfaced as overlays in the renderer. */
  infeasibility: LayoutInfeasibility;
  /** Solver elapsed time for the bottom-right diagnostic. */
  elapsedMs: number;
}
