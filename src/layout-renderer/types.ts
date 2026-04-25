// Layout renderer types. Phase 5 keeps this minimal — a flat list of
// placed rectangles, each with role / id / coordinates. Phase 7 layers
// polygons + per-zone aisle orientation + 11-layer toggling on top.

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
}

export interface PlacedDoor {
  id: string;
  /** Wall the door is on. Phase 5 uses 'south' only (front of warehouse). */
  wall: 'north' | 'south' | 'east' | 'west';
  /** Position along the wall (m from origin corner of that wall). */
  position: number;
  /** Door opening width (m). */
  widthM: number;
  /** 'inbound' / 'outbound' — drives icon colour in the renderer. */
  direction: 'inbound' | 'outbound';
}

export interface LayoutResult {
  /** Envelope outline (m) the solver packed against. */
  envelopeLengthM: number;
  envelopeWidthM: number;
  /** All zones the solver placed (storage + staging + support). */
  rects: PlacedRect[];
  /** Inbound + outbound dock door placements along the south wall. */
  doors: PlacedDoor[];
  /** True when at least one rect overflowed the envelope. */
  overflowed: boolean;
  /** Total m² that didn't fit (sum of overflowing rect areas). */
  overflowAreaM2: number;
  /** Solver elapsed time for the bottom-right diagnostic. */
  elapsedMs: number;
}
