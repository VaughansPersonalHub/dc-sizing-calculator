// Phase 5 — basic SVG renderer for the layout solver.
//
// Convention: SVG y axis grows downward, so we flip the layout coordinate
// system on the way in (engine y is "north positive", screen y is "south
// positive"). All rendering happens in real metres scaled by D3 linear
// scales — no manual maths inside JSX so a future zoom/pan pass can
// extend the same scale.

import { useMemo } from 'react';
import { scaleLinear } from 'd3-scale';
import type { LayoutResult, PlacedRect, LayoutZoneRole } from './types';
import { useLayoutViewStore } from '../../stores/layout-view.store';

interface Props {
  layout: LayoutResult;
  /** SVG width in CSS pixels. Height computed from the envelope aspect ratio. */
  pixelWidth?: number;
}

const ROLE_FILL: Record<LayoutZoneRole, string> = {
  storage_pfp: '#1e3a8a',         // deep blue
  storage_cls: '#2563eb',         // blue
  storage_shelf: '#60a5fa',       // light blue
  staging: '#facc15',             // amber
  office: '#0f172a',              // slate
  amenities: '#334155',           // slate-700
  support: '#475569',             // slate-600
  customs: '#dc2626',             // red — bonded zone
  battery: '#16a34a',             // green
  antechamber: '#06b6d4',         // cyan
  overflow: '#7f1d1d',            // dark red
};

const ROLE_OPACITY = 0.78;

export function SimpleLayoutSvg({ layout, pixelWidth = 720 }: Props) {
  const visibleLayers = useLayoutViewStore((s) => s.visibleLayers);
  const showStorage = visibleLayers.storage;
  const showStaging = visibleLayers.staging;
  const showDocks = visibleLayers.docks;
  const showSupport = visibleLayers.support;
  const showLabels = visibleLayers.labels;
  const showScale = visibleLayers.scale;
  const showNorth = visibleLayers.north;

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
      .range([padding + innerH, padding]); // flip: 0 maps to bottom
    return {
      sx,
      sy,
      viewWidth: pixelWidth,
      viewHeight: innerH + padding * 2,
    };
  }, [layout.envelopeLengthM, layout.envelopeWidthM, pixelWidth]);

  const roleVisible = (role: LayoutZoneRole, overflow: boolean): boolean => {
    if (overflow) return true; // always show overflow rects so users see the issue
    if (role.startsWith('storage_')) return showStorage;
    if (role === 'staging') return showStaging;
    if (role === 'office' || role === 'amenities') return showSupport;
    if (role === 'support' || role === 'battery' || role === 'customs' || role === 'antechamber') {
      return showSupport;
    }
    return true;
  };

  return (
    <svg width={viewWidth} height={viewHeight} className="block bg-slate-50 dark:bg-slate-950 rounded-md">
      {/* Envelope outline */}
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

      {/* Hatched overflow underlay if Step 11 said overEnvelope */}
      {layout.overflowed && (
        <defs>
          <pattern id="overflow-hatch" patternUnits="userSpaceOnUse" width={8} height={8}>
            <path d="M 0,8 L 8,0" stroke="#dc2626" strokeWidth={1.4} />
          </pattern>
        </defs>
      )}

      {/* Zone rectangles */}
      {layout.rects.map((r) => {
        if (!roleVisible(r.role, r.overflow)) return null;
        return <RectShape key={r.id} rect={r} sx={sx} sy={sy} showLabel={showLabels} />;
      })}

      {/* Dock doors */}
      {showDocks &&
        layout.doors.map((d) => {
          const xPx = sx(d.position);
          const yPx = sy(0); // south wall
          const wPx = sx(d.position + d.widthM) - xPx;
          return (
            <rect
              key={d.id}
              x={xPx}
              y={yPx - 2}
              width={wPx}
              height={6}
              fill={d.direction === 'inbound' ? '#0ea5e9' : '#f97316'}
              opacity={0.95}
            >
              <title>{`${d.direction} door · ${d.position.toFixed(0)}–${(d.position + d.widthM).toFixed(0)} m`}</title>
            </rect>
          );
        })}

      {/* Compass + scale bar */}
      {showNorth && <CompassRose x={viewWidth - 48} y={48} />}
      {showScale && (
        <ScaleBar
          x={48}
          y={viewHeight - 24}
          metres={20}
          pixelsPerMetre={(sx(20) - sx(0))}
        />
      )}
    </svg>
  );
}

function RectShape({
  rect,
  sx,
  sy,
  showLabel,
}: {
  rect: PlacedRect;
  sx: (n: number) => number;
  sy: (n: number) => number;
  showLabel: boolean;
}) {
  const xPx = sx(rect.x);
  const yPx = sy(rect.y + rect.depthM);
  const wPx = sx(rect.x + rect.widthM) - xPx;
  const hPx = sy(rect.y) - sy(rect.y + rect.depthM);
  if (wPx <= 0 || hPx <= 0) return null;
  const fill = rect.overflow ? 'url(#overflow-hatch)' : ROLE_FILL[rect.role];
  return (
    <g>
      <rect
        x={xPx}
        y={yPx}
        width={wPx}
        height={hPx}
        fill={fill}
        fillOpacity={rect.overflow ? 1 : ROLE_OPACITY}
        stroke={rect.overflow ? '#7f1d1d' : 'rgba(15,23,42,0.4)'}
        strokeWidth={rect.overflow ? 1.5 : 0.5}
      >
        <title>{`${rect.label} · ${(rect.widthM * rect.depthM).toFixed(0)} m²`}</title>
      </rect>
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

function CompassRose({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`} className="text-slate-700 dark:text-slate-300">
      <circle r={16} fill="none" stroke="currentColor" strokeWidth={1} />
      <text
        x={0}
        y={-18}
        textAnchor="middle"
        fontSize={10}
        fill="currentColor"
      >
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
