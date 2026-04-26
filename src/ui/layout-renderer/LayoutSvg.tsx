// Phase 7 — layered SVG renderer for the layout solver.
//
// Convention: SVG y axis grows downward, so we flip the layout coordinate
// system on the way in (engine y is "north positive", screen y is "south
// positive"). All rendering happens in real metres scaled by D3 linear
// scales — no manual maths inside JSX so a future zoom/pan pass can
// extend the same scale.
//
// Layout is composed of independent <g> layers, each gated by a flag in
// useLayoutViewStore.visibleLayers. Layers in render order:
//   grid → envelope → fire egress → zones (with aisles) → docks
//   → flow arrows → pedestrian → compass / scale.
// Flow / fire-egress / pedestrian arrived in Chunk 2; selection panel is
// driven by useLayoutViewStore.selectedZoneId.

import { useMemo } from 'react';
import { scaleLinear } from 'd3-scale';
import type {
  LayoutResult,
  PlacedRect,
  PlacedDoor,
  LayoutZoneRole,
  ZoneAisleHint,
} from './types';
import { useLayoutViewStore } from '../../stores/layout-view.store';
import { buildFlowPaths } from './flow';
import { computeEgressGrid } from './egress';

interface Props {
  layout: LayoutResult;
  /** SVG width in CSS pixels. Height computed from the envelope aspect ratio. */
  pixelWidth?: number;
}

const ROLE_FILL: Record<LayoutZoneRole, string> = {
  storage_pfp: '#1e3a8a',
  storage_cls: '#2563eb',
  storage_shelf: '#60a5fa',
  staging: '#facc15',
  office: '#0f172a',
  amenities: '#334155',
  support: '#475569',
  customs: '#dc2626',
  battery: '#16a34a',
  antechamber: '#06b6d4',
  overflow: '#7f1d1d',
};

const ROLE_OPACITY = 0.78;
const SELECTED_STROKE = '#fde68a';
const FLOW_INBOUND_COLOUR = '#0ea5e9';
const FLOW_OUTBOUND_COLOUR = '#f97316';

export function LayoutSvg({ layout, pixelWidth = 720 }: Props) {
  const visibleLayers = useLayoutViewStore((s) => s.visibleLayers);
  const flowPattern = useLayoutViewStore((s) => s.flowPattern);
  const selectedZoneId = useLayoutViewStore((s) => s.selectedZoneId);
  const setSelectedZone = useLayoutViewStore((s) => s.setSelectedZone);

  const { sx, sy, viewWidth, viewHeight } = useMemo(() => {
    const padding = 32;
    const aspect = layout.envelopeWidthM / layout.envelopeLengthM;
    const innerW = pixelWidth - padding * 2;
    const innerH = innerW * aspect;
    const sx = scaleLinear()
      .domain([0, layout.envelopeLengthM])
      .range([padding, padding + innerW]);
    const sy = scaleLinear()
      .domain([0, layout.envelopeWidthM])
      .range([padding + innerH, padding]);
    return {
      sx,
      sy,
      viewWidth: pixelWidth,
      viewHeight: innerH + padding * 2,
    };
  }, [layout.envelopeLengthM, layout.envelopeWidthM, pixelWidth]);

  const flowPaths = useMemo(
    () => (visibleLayers.flow ? buildFlowPaths({ layout, pattern: flowPattern }) : []),
    [layout, flowPattern, visibleLayers.flow]
  );

  const egressGrid = useMemo(
    () => (visibleLayers.fire_egress ? computeEgressGrid({ layout }) : null),
    [layout, visibleLayers.fire_egress]
  );

  const roleVisible = (role: LayoutZoneRole, overflow: boolean): boolean => {
    if (overflow) return true; // always show overflow rects so users see the issue
    if (role.startsWith('storage_')) return visibleLayers.storage;
    if (role === 'staging') return visibleLayers.staging;
    if (role === 'office' || role === 'amenities') return visibleLayers.support;
    if (role === 'support' || role === 'battery' || role === 'customs' || role === 'antechamber') {
      return visibleLayers.support;
    }
    return true;
  };

  return (
    <svg
      width={viewWidth}
      height={viewHeight}
      className="block bg-slate-50 dark:bg-slate-950 rounded-md"
      onClick={(e) => {
        // Click on empty SVG background → deselect.
        if (e.target === e.currentTarget) setSelectedZone(null);
      }}
    >
      <defs>
        <pattern id="overflow-hatch" patternUnits="userSpaceOnUse" width={8} height={8}>
          <path d="M 0,8 L 8,0" stroke="#dc2626" strokeWidth={1.4} />
        </pattern>
        <pattern id="egress-hatch" patternUnits="userSpaceOnUse" width={6} height={6}>
          <path d="M 0,6 L 6,0" stroke="#dc2626" strokeOpacity={0.55} strokeWidth={1} />
        </pattern>
        <marker
          id="flow-arrow-in"
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={7}
          markerHeight={7}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={FLOW_INBOUND_COLOUR} />
        </marker>
        <marker
          id="flow-arrow-out"
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={7}
          markerHeight={7}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={FLOW_OUTBOUND_COLOUR} />
        </marker>
      </defs>

      {visibleLayers.grid && (
        <GridLayer
          envelopeLengthM={layout.envelopeLengthM}
          envelopeWidthM={layout.envelopeWidthM}
          spacingXM={layout.columnGrid.spacingXM}
          spacingYM={layout.columnGrid.spacingYM}
          sx={sx}
          sy={sy}
        />
      )}

      <EnvelopeOutline layout={layout} sx={sx} sy={sy} />

      {egressGrid && egressGrid.failingCells.length > 0 && (
        <g style={{ pointerEvents: 'none' }}>
          {egressGrid.failingCells.map((c, i) => (
            <rect
              key={`egress-${i}`}
              x={sx(c.x)}
              y={sy(c.y + c.depthM)}
              width={sx(c.x + c.widthM) - sx(c.x)}
              height={sy(c.y) - sy(c.y + c.depthM)}
              fill="url(#egress-hatch)"
              opacity={0.85}
            >
              <title>{`> ${egressGrid.maxDistanceM} m to nearest exit (${c.distanceM.toFixed(0)} m)`}</title>
            </rect>
          ))}
        </g>
      )}

      {/* Zone rectangles + per-zone aisles */}
      {layout.rects.map((r) => {
        if (!roleVisible(r.role, r.overflow)) return null;
        return (
          <RectShape
            key={r.id}
            rect={r}
            sx={sx}
            sy={sy}
            showLabel={visibleLayers.labels}
            selected={selectedZoneId === r.id}
            onSelect={() => setSelectedZone(r.id)}
          />
        );
      })}

      {/* Dock doors */}
      {visibleLayers.docks &&
        layout.doors.map((d) => (
          <DockDoor
            key={d.id}
            door={d}
            envelopeLengthM={layout.envelopeLengthM}
            envelopeWidthM={layout.envelopeWidthM}
            sx={sx}
            sy={sy}
          />
        ))}

      {/* Flow arrows */}
      {visibleLayers.flow && flowPaths.length > 0 && (
        <g style={{ pointerEvents: 'none' }}>
          {flowPaths.map((p) => (
            <polyline
              key={p.id}
              points={p.points.map((pt) => `${sx(pt.x)},${sy(pt.y)}`).join(' ')}
              fill="none"
              stroke={p.direction === 'inbound' ? FLOW_INBOUND_COLOUR : FLOW_OUTBOUND_COLOUR}
              strokeWidth={2.5}
              strokeOpacity={0.85}
              markerEnd={`url(#flow-arrow-${p.direction === 'inbound' ? 'in' : 'out'})`}
            />
          ))}
        </g>
      )}

      {/* Pedestrian walkway: dashed green strip along the
          dock-strip / storage interface — the main cross-traffic seam. */}
      {visibleLayers.pedestrian && <PedestrianLayer layout={layout} sx={sx} sy={sy} />}

      {/* Compass + scale bar */}
      {visibleLayers.north && <CompassRose x={viewWidth - 48} y={48} />}
      {visibleLayers.scale && (
        <ScaleBar
          x={48}
          y={viewHeight - 24}
          metres={20}
          pixelsPerMetre={sx(20) - sx(0)}
        />
      )}
    </svg>
  );
}

function GridLayer({
  envelopeLengthM,
  envelopeWidthM,
  spacingXM,
  spacingYM,
  sx,
  sy,
}: {
  envelopeLengthM: number;
  envelopeWidthM: number;
  spacingXM: number;
  spacingYM: number;
  sx: (n: number) => number;
  sy: (n: number) => number;
}) {
  if (spacingXM <= 0 || spacingYM <= 0) return null;
  const verticals: number[] = [];
  for (let x = spacingXM; x < envelopeLengthM; x += spacingXM) verticals.push(x);
  const horizontals: number[] = [];
  for (let y = spacingYM; y < envelopeWidthM; y += spacingYM) horizontals.push(y);
  return (
    <g className="text-slate-300 dark:text-slate-700" opacity={0.55} style={{ pointerEvents: 'none' }}>
      {verticals.map((x) => (
        <line
          key={`gv-${x}`}
          x1={sx(x)}
          y1={sy(0)}
          x2={sx(x)}
          y2={sy(envelopeWidthM)}
          stroke="currentColor"
          strokeWidth={0.5}
          strokeDasharray="2 3"
        />
      ))}
      {horizontals.map((y) => (
        <line
          key={`gh-${y}`}
          x1={sx(0)}
          y1={sy(y)}
          x2={sx(envelopeLengthM)}
          y2={sy(y)}
          stroke="currentColor"
          strokeWidth={0.5}
          strokeDasharray="2 3"
        />
      ))}
    </g>
  );
}

function EnvelopeOutline({
  layout,
  sx,
  sy,
}: {
  layout: LayoutResult;
  sx: (n: number) => number;
  sy: (n: number) => number;
}) {
  if (layout.polygon && layout.polygon.length >= 3) {
    const points = layout.polygon.map((v) => `${sx(v.x)},${sy(v.y)}`).join(' ');
    return (
      <polygon
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className="text-slate-700 dark:text-slate-300"
      />
    );
  }
  return (
    <rect
      x={sx(0)}
      y={sy(layout.envelopeWidthM)}
      width={sx(layout.envelopeLengthM) - sx(0)}
      height={sy(0) - sy(layout.envelopeWidthM)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="text-slate-700 dark:text-slate-300"
    />
  );
}

function DockDoor({
  door,
  envelopeLengthM,
  envelopeWidthM,
  sx,
  sy,
}: {
  door: PlacedDoor;
  envelopeLengthM: number;
  envelopeWidthM: number;
  sx: (n: number) => number;
  sy: (n: number) => number;
}) {
  const colour = door.direction === 'inbound' ? FLOW_INBOUND_COLOUR : FLOW_OUTBOUND_COLOUR;
  const thickness = 6;
  let x: number;
  let y: number;
  let w: number;
  let h: number;
  if (door.wall === 'south') {
    x = sx(door.position);
    y = sy(0) - 2;
    w = sx(door.position + door.widthM) - x;
    h = thickness;
  } else if (door.wall === 'north') {
    x = sx(door.position);
    y = sy(envelopeWidthM) - 2;
    w = sx(door.position + door.widthM) - x;
    h = thickness;
  } else if (door.wall === 'west') {
    x = sx(0) - 2;
    y = sy(door.position + door.widthM);
    w = thickness;
    h = sy(door.position) - y;
  } else {
    x = sx(envelopeLengthM) - 2;
    y = sy(door.position + door.widthM);
    w = thickness;
    h = sy(door.position) - y;
  }
  return (
    <rect x={x} y={y} width={w} height={h} fill={colour} opacity={0.95}>
      <title>{`${door.direction} door · ${door.wall} wall · ${door.position.toFixed(0)}–${(door.position + door.widthM).toFixed(0)} m`}</title>
    </rect>
  );
}

function RectShape({
  rect,
  sx,
  sy,
  showLabel,
  selected,
  onSelect,
}: {
  rect: PlacedRect;
  sx: (n: number) => number;
  sy: (n: number) => number;
  showLabel: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const xPx = sx(rect.x);
  const yPx = sy(rect.y + rect.depthM);
  const wPx = sx(rect.x + rect.widthM) - xPx;
  const hPx = sy(rect.y) - sy(rect.y + rect.depthM);
  if (wPx <= 0 || hPx <= 0) return null;
  const fill = rect.overflow ? 'url(#overflow-hatch)' : ROLE_FILL[rect.role];
  return (
    <g
      style={{ cursor: 'pointer' }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <rect
        x={xPx}
        y={yPx}
        width={wPx}
        height={hPx}
        fill={fill}
        fillOpacity={rect.overflow ? 1 : ROLE_OPACITY}
        stroke={selected ? SELECTED_STROKE : rect.overflow ? '#7f1d1d' : 'rgba(15,23,42,0.4)'}
        strokeWidth={selected ? 2.5 : rect.overflow ? 1.5 : 0.5}
      >
        <title>{`${rect.label} · ${(rect.widthM * rect.depthM).toFixed(0)} m²`}</title>
      </rect>
      {rect.aisles && !rect.overflow && (
        <ZoneAisles rect={rect} hint={rect.aisles} sx={sx} sy={sy} />
      )}
      {showLabel && wPx > 60 && hPx > 18 && (
        <text
          x={xPx + 4}
          y={yPx + 14}
          fontSize={10}
          fill="white"
          opacity={0.92}
          style={{ pointerEvents: 'none' }}
        >
          {rect.label}
        </text>
      )}
    </g>
  );
}

function ZoneAisles({
  rect,
  hint,
  sx,
  sy,
}: {
  rect: PlacedRect;
  hint: ZoneAisleHint;
  sx: (n: number) => number;
  sy: (n: number) => number;
}) {
  if (hint.count <= 0) return null;
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  if (hint.orientation === 'matches_flow') {
    const step = rect.widthM / (hint.count + 1);
    for (let i = 1; i <= hint.count; i++) {
      const x = rect.x + step * i;
      lines.push({ x1: x, y1: rect.y, x2: x, y2: rect.y + rect.depthM });
    }
  } else {
    const step = rect.depthM / (hint.count + 1);
    for (let i = 1; i <= hint.count; i++) {
      const y = rect.y + step * i;
      lines.push({ x1: rect.x, y1: y, x2: rect.x + rect.widthM, y2: y });
    }
  }
  return (
    <g opacity={0.45} style={{ pointerEvents: 'none' }}>
      {lines.map((l, i) => (
        <line
          key={i}
          x1={sx(l.x1)}
          y1={sy(l.y1)}
          x2={sx(l.x2)}
          y2={sy(l.y2)}
          stroke="rgba(255,255,255,0.85)"
          strokeWidth={0.6}
          strokeDasharray="2 2"
        />
      ))}
    </g>
  );
}

function PedestrianLayer({
  layout,
  sx,
  sy,
}: {
  layout: LayoutResult;
  sx: (n: number) => number;
  sy: (n: number) => number;
}) {
  // Pedestrian aisle = a dashed green polyline along the dock-strip / storage
  // interface. We approximate it as the south edge of the storage region:
  // it's the seam where staff cross between staging and storage on foot.
  const staging = layout.rects.find((r) => r.role === 'staging');
  if (!staging) return null;
  const yLine = staging.y + staging.depthM;
  return (
    <g style={{ pointerEvents: 'none' }}>
      <line
        x1={sx(0)}
        y1={sy(yLine)}
        x2={sx(layout.envelopeLengthM)}
        y2={sy(yLine)}
        stroke="#16a34a"
        strokeWidth={1.5}
        strokeDasharray="6 3"
        opacity={0.75}
      />
    </g>
  );
}

function CompassRose({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`} className="text-slate-700 dark:text-slate-300">
      <circle r={16} fill="none" stroke="currentColor" strokeWidth={1} />
      <text x={0} y={-18} textAnchor="middle" fontSize={10} fill="currentColor">
        N
      </text>
      <line x1={0} y1={-12} x2={0} y2={12} stroke="currentColor" strokeWidth={1} />
    </g>
  );
}

function ScaleBar({
  x,
  y,
  metres,
  pixelsPerMetre,
}: {
  x: number;
  y: number;
  metres: number;
  pixelsPerMetre: number;
}) {
  const widthPx = Math.max(40, Math.abs(pixelsPerMetre));
  return (
    <g transform={`translate(${x},${y})`} className="text-slate-700 dark:text-slate-300">
      <line x1={0} y1={0} x2={widthPx} y2={0} stroke="currentColor" strokeWidth={2} />
      <line x1={0} y1={-3} x2={0} y2={3} stroke="currentColor" strokeWidth={2} />
      <line x1={widthPx} y1={-3} x2={widthPx} y2={3} stroke="currentColor" strokeWidth={2} />
      <text x={widthPx / 2} y={-6} textAnchor="middle" fontSize={10} fill="currentColor">
        {metres} m
      </text>
    </g>
  );
}
