// Phase 5 — Simple layout solver.
// SPEC §13 Phase 5 deliverable: rectangle packing + fit check + basic SVG.
// Phase 7 (Visio-grade) replaces this with polygon support, per-zone aisle
// orientation, flexible dock placement and 11 toggleable layers.
//
// Geometry conventions:
//   • Origin (0, 0) = south-west corner of the envelope
//   • +x to the east, +y to the north
//   • All units in metres
//
// Algorithm:
//   1. Reserve a south strip (DOCK_STRIP_DEPTH_M) for staging + dock apron.
//   2. Drop dock doors along the south wall — inbound on the west half,
//      outbound on the east half, evenly spaced.
//   3. Pack storage zones north of the dock strip using shelf packing
//      (largest-first by area). Storage zones come from Step 5 with
//      authoritative width × depth.
//   4. Pack support zones along the east wall (office cluster + Surau +
//      customs + battery + antechamber). Sized from Step 10 areas.
//   5. Anything that doesn't fit gets placed at an "overflow" anchor
//      south-east of the envelope and flagged.

import type { PipelineOutputs } from '../engine/pipeline';
import type { EngineBuildingEnvelope } from '../engine/models';
import type { LayoutResult, PlacedRect, PlacedDoor, LayoutZoneRole } from './types';

const DOCK_STRIP_DEPTH_M = 25;
const DOCK_DOOR_WIDTH_M = 3.5;
const DOCK_DOOR_PITCH_M = 4;
const SUPPORT_STRIP_WIDTH_M = 12;
const ZONE_GAP_M = 1.5;

interface SolverInputs {
  result: PipelineOutputs;
  envelope: EngineBuildingEnvelope;
}

export function runLayoutSolver(inputs: SolverInputs): LayoutResult {
  const t0 = performance.now();
  const env = inputs.envelope.envelope;
  const Lx = env.lengthM;
  const Ly = env.widthM;

  const rects: PlacedRect[] = [];
  const doors: PlacedDoor[] = [];

  // ----------------------------------------------------------------
  // 1. South dock strip + staging
  // ----------------------------------------------------------------
  const dockStripDepth = Math.min(DOCK_STRIP_DEPTH_M, Ly * 0.25);
  rects.push({
    id: 'staging',
    role: 'staging',
    label: 'Staging / dock apron',
    x: 0,
    y: 0,
    widthM: Lx,
    depthM: dockStripDepth,
    overflow: false,
  });

  // ----------------------------------------------------------------
  // 2. Dock doors — inbound left, outbound right
  // ----------------------------------------------------------------
  const inboundDoors = inputs.result.step9.inbound.doorsRequired;
  const outboundDoors = inputs.result.step9.outbound.doorsRequired;
  const placeDoors = (count: number, startX: number, endX: number, dir: 'inbound' | 'outbound') => {
    if (count <= 0) return;
    const usableLen = Math.max(0, endX - startX);
    const pitch = Math.min(DOCK_DOOR_PITCH_M, usableLen / Math.max(1, count));
    const gap = Math.max(0, pitch - DOCK_DOOR_WIDTH_M);
    let cursor = startX + gap / 2;
    for (let i = 0; i < count; i++) {
      if (cursor + DOCK_DOOR_WIDTH_M > endX) break;
      doors.push({
        id: `${dir}_${i}`,
        wall: 'south',
        position: cursor,
        widthM: DOCK_DOOR_WIDTH_M,
        direction: dir,
      });
      cursor += pitch;
    }
  };
  const half = Lx / 2;
  placeDoors(inboundDoors, 0, half, 'inbound');
  placeDoors(outboundDoors, half, Lx, 'outbound');

  // ----------------------------------------------------------------
  // 3. Storage zones — north of the dock strip, west of the support strip
  // ----------------------------------------------------------------
  const storageOriginY = dockStripDepth + ZONE_GAP_M;
  const storageMaxY = Ly;
  const storageMaxX = Math.max(0, Lx - SUPPORT_STRIP_WIDTH_M - ZONE_GAP_M);
  const storageRegionWidth = storageMaxX;
  const storageRegionDepth = Math.max(0, storageMaxY - storageOriginY);

  // Build candidate storage zones from Step 5. Skip empty zones.
  const storageZones = inputs.result.step5.zones
    .filter((z) => z.alignedAreaM2 > 0)
    .map((z) => ({
      label: z.zone,
      role: roleForZone(z.zone),
      widthM: z.zoneWidthRawM,
      depthM: z.zoneDepthRawM,
      areaM2: z.alignedAreaM2,
    }))
    // Largest-area first → biggest zones secure the prime real estate.
    .sort((a, b) => b.areaM2 - a.areaM2);

  // Shelf packing: row-by-row, west-to-east; new row when current row's
  // remaining width can't accommodate the next zone.
  let cursorX = 0;
  let cursorY = storageOriginY;
  let rowMaxDepth = 0;
  for (const zone of storageZones) {
    const fitsInRow = cursorX + zone.widthM <= storageRegionWidth;
    if (!fitsInRow) {
      // New row.
      cursorX = 0;
      cursorY += rowMaxDepth + ZONE_GAP_M;
      rowMaxDepth = 0;
    }
    const overflows =
      cursorY + zone.depthM > storageMaxY ||
      cursorX + zone.widthM > storageRegionWidth + 0.001;
    rects.push({
      id: `storage_${zone.label}`,
      role: zone.role,
      label: zone.label,
      x: overflows ? Lx + 5 : cursorX,
      y: overflows ? -zone.depthM - 5 : cursorY,
      widthM: zone.widthM,
      depthM: zone.depthM,
      overflow: overflows,
    });
    if (!overflows) {
      cursorX += zone.widthM + ZONE_GAP_M;
      if (zone.depthM > rowMaxDepth) rowMaxDepth = zone.depthM;
    }
  }

  // ----------------------------------------------------------------
  // 4. Support cluster — east strip (office, Surau, customs, etc.)
  // ----------------------------------------------------------------
  const supportX = Math.max(0, Lx - SUPPORT_STRIP_WIDTH_M);
  const supportItems = buildSupportItems(inputs.result, SUPPORT_STRIP_WIDTH_M);
  let supportCursor = dockStripDepth + ZONE_GAP_M;
  for (const item of supportItems) {
    if (item.areaM2 <= 0) continue;
    const widthM = SUPPORT_STRIP_WIDTH_M;
    const depthM = item.areaM2 / widthM;
    const overflows = supportCursor + depthM > Ly + 0.001;
    rects.push({
      id: `support_${item.id}`,
      role: item.role,
      label: item.label,
      x: overflows ? Lx + 5 : supportX,
      y: overflows ? -depthM - 5 : supportCursor,
      widthM,
      depthM,
      overflow: overflows,
    });
    if (!overflows) supportCursor += depthM + ZONE_GAP_M;
  }

  // ----------------------------------------------------------------
  // 5. Roll up overflow stats
  // ----------------------------------------------------------------
  let overflowAreaM2 = 0;
  let overflowed = false;
  for (const r of rects) {
    if (r.overflow) {
      overflowed = true;
      overflowAreaM2 += r.widthM * r.depthM;
    }
  }
  // Sanity: even if every rect fit, the building GFA may still exceed the
  // envelope area (Step 11 overEnvelope). Surface that as overflow too.
  if (!overflowed && inputs.result.step11.structural.overEnvelope) {
    overflowed = true;
    overflowAreaM2 = inputs.result.step11.structural.envelopeShortfallM2;
  }

  void storageRegionDepth;

  return {
    envelopeLengthM: Lx,
    envelopeWidthM: Ly,
    rects,
    doors,
    overflowed,
    overflowAreaM2,
    elapsedMs: performance.now() - t0,
  };
}

interface SupportItem {
  id: string;
  label: string;
  role: LayoutZoneRole;
  areaM2: number;
}

function buildSupportItems(result: PipelineOutputs, widthM: number): SupportItem[] {
  const a = result.step10.areas;
  const items: SupportItem[] = [
    { id: 'office', label: 'Office', role: 'office', areaM2: a.office },
    { id: 'amenities', label: 'Amenities', role: 'amenities', areaM2: 80 },
    { id: 'training', label: 'Training', role: 'amenities', areaM2: 40 },
    { id: 'firstAid', label: 'First aid', role: 'amenities', areaM2: 15 },
  ];
  if (a.surau > 0) {
    items.push({ id: 'surau', label: `Surau + ablution`, role: 'support', areaM2: a.surau + a.ablution });
  }
  if (a.battery > 0) {
    items.push({ id: 'battery', label: 'Battery / charging', role: 'battery', areaM2: a.battery });
  }
  if (a.customs > 0) {
    items.push({ id: 'customs', label: 'Customs hold', role: 'customs', areaM2: a.customs });
  }
  if (a.tempAntechamber > 0) {
    items.push({ id: 'antechamber', label: 'Cold-chain antechamber', role: 'antechamber', areaM2: a.tempAntechamber });
  }
  if (a.vas > 0) items.push({ id: 'vas', label: 'VAS', role: 'support', areaM2: a.vas });
  if (a.returns > 0) items.push({ id: 'returns', label: 'Returns', role: 'support', areaM2: a.returns });
  if (a.qc > 0) items.push({ id: 'qc', label: 'QC hold', role: 'support', areaM2: a.qc });
  void widthM;
  return items;
}

function roleForZone(zoneName: string): LayoutZoneRole {
  if (zoneName === 'PFP') return 'storage_pfp';
  if (zoneName === 'CLS') return 'storage_cls';
  if (zoneName.startsWith('Shelf')) return 'storage_shelf';
  return 'storage_pfp';
}
