// Tornado bar chart — Phase 6. Each row is a SPEC §8 Step 14 param;
// horizontal bars show the {low, high} swing for the chosen metric
// (footprint m² or peak FTE). Rows are pre-sorted by weighted delta.
//
// Custom SVG (no Recharts) — the layout is opinionated enough that
// hand-rolled gives tighter control over hatched-infeasibility, label
// placement, and centre-line zero crossing.
//
// Phase 10.6b — each bar carries a thin confidence-band underlay
// representing engine modeling uncertainty (default ±5% of the
// variant's delta). The band sits behind the bar with low opacity and
// extends past the bar tip on the value-positive side, so a sceptical
// reviewer sees that the delta is approximate, not exact.

import { useMemo } from 'react';
import type { TornadoResult } from '../../engine/tornado';

export type TornadoMetric = 'footprint' | 'fte';

interface Props {
  tornado: TornadoResult;
  metric: TornadoMetric;
  /** Number of rows to render. Defaults to all 17. */
  topN?: number;
  /**
   * Engine modeling uncertainty as a fraction of the variant's delta;
   * drives the confidence-band underlay width on each bar. Default 0.05.
   */
  uncertaintyPct?: number;
}

const ROW_HEIGHT = 24;
const ROW_GAP = 4;
const LABEL_WIDTH = 220;
const RIGHT_PAD = 60;
const DEFAULT_UNCERTAINTY = 0.05;

export function TornadoChart({ tornado, metric, topN, uncertaintyPct = DEFAULT_UNCERTAINTY }: Props) {
  const rows = useMemo(() => {
    const sliced = topN ? tornado.rows.slice(0, topN) : tornado.rows;
    return sliced.map((r) => ({
      ...r,
      lowValue: metric === 'footprint' ? r.footprintDelta.low : r.fteDelta.low,
      highValue: metric === 'footprint' ? r.footprintDelta.high : r.fteDelta.high,
    }));
  }, [tornado, metric, topN]);

  // Symmetric scale around 0 so left and right bars stay comparable.
  const maxAbs = useMemo(() => {
    let m = 0;
    for (const r of rows) {
      m = Math.max(m, Math.abs(r.lowValue), Math.abs(r.highValue));
    }
    return m === 0 ? 1 : m;
  }, [rows]);

  const innerWidth = 720;
  const chartLeft = LABEL_WIDTH;
  const chartRight = innerWidth - RIGHT_PAD;
  const centreX = (chartLeft + chartRight) / 2;
  const halfRange = chartRight - centreX;

  const height = rows.length * (ROW_HEIGHT + ROW_GAP) + 32;

  const valueToX = (v: number) => centreX + (v / maxAbs) * halfRange;
  const formatValue = (v: number) =>
    metric === 'footprint' ? `${Math.round(v).toLocaleString()} m²` : `${v.toFixed(1)} FTE`;

  return (
    <svg width={innerWidth} height={height} className="block">
      <defs>
        <pattern id="tornado-hatch" patternUnits="userSpaceOnUse" width={6} height={6}>
          <path d="M 0,6 L 6,0" stroke="#dc2626" strokeWidth={1} opacity={0.6} />
        </pattern>
      </defs>

      {/* Centre axis */}
      <line
        x1={centreX}
        y1={16}
        x2={centreX}
        y2={height - 4}
        stroke="currentColor"
        strokeOpacity={0.3}
        strokeWidth={1}
        className="text-slate-500"
      />
      <text
        x={centreX}
        y={12}
        textAnchor="middle"
        fontSize={10}
        fill="currentColor"
        className="text-slate-500"
      >
        Δ vs baseline ({metric === 'footprint' ? 'm²' : 'FTE'})
      </text>

      {rows.map((row, i) => {
        const y = 24 + i * (ROW_HEIGHT + ROW_GAP);
        const lowFeasible = row.feasibility.low;
        const highFeasible = row.feasibility.high;
        return (
          <g key={row.paramId}>
            {/* Param label */}
            <text x={LABEL_WIDTH - 8} y={y + ROW_HEIGHT / 2 + 4} textAnchor="end" fontSize={11}>
              {row.label}
              <tspan x={LABEL_WIDTH - 8} dy={12} fontSize={9} opacity={0.6}>
                {row.deltaLabel}
              </tspan>
            </text>

            {/* Low bar — extends left of centre when negative, right when positive */}
            <Bar
              y={y}
              valueToX={valueToX}
              centreX={centreX}
              value={row.lowValue}
              colour="#0ea5e9"
              feasible={lowFeasible}
              uncertaintyPct={uncertaintyPct}
            />

            {/* High bar */}
            <Bar
              y={y}
              valueToX={valueToX}
              centreX={centreX}
              value={row.highValue}
              colour="#f97316"
              feasible={highFeasible}
              uncertaintyPct={uncertaintyPct}
            />

            {/* Right-side numeric annotation: bigger absolute swing wins */}
            <text
              x={chartRight + 8}
              y={y + ROW_HEIGHT / 2 + 4}
              fontSize={10}
              fontFamily="monospace"
              fill="currentColor"
              className="text-slate-600 dark:text-slate-300"
            >
              {formatValue(Math.max(Math.abs(row.lowValue), Math.abs(row.highValue)))}
            </text>
          </g>
        );
      })}

      {rows.length === 0 && (
        <text x={innerWidth / 2} y={height / 2} textAnchor="middle" fontSize={12} fill="currentColor" className="text-muted-foreground">
          No tornado rows to display.
        </text>
      )}
    </svg>
  );
}

function Bar({
  y,
  valueToX,
  centreX,
  value,
  colour,
  feasible,
  uncertaintyPct,
}: {
  y: number;
  valueToX: (v: number) => number;
  centreX: number;
  value: number;
  colour: string;
  feasible: boolean;
  uncertaintyPct: number;
}) {
  if (value === 0) return null;
  const xEnd = valueToX(value);
  const x = Math.min(centreX, xEnd);
  const w = Math.abs(xEnd - centreX);

  // Confidence band — thin pill spanning value × (1 ± uncertaintyPct).
  // Drawn above the bar at low opacity so it shows as a subtle visual
  // reminder that the delta is approximate; extends past the bar tip
  // on the value-side, making the modeling-uncertainty range obvious.
  const u = Math.abs(value * uncertaintyPct);
  const xLo = valueToX(value - Math.sign(value) * u);
  const xHi = valueToX(value + Math.sign(value) * u);
  const cbX = Math.min(xLo, xHi);
  const cbW = Math.abs(xHi - xLo);
  const cbY = y + ROW_HEIGHT / 2 - 1.5;

  return (
    <g>
      <rect
        x={x}
        y={y + 2}
        width={w}
        height={ROW_HEIGHT - 4}
        fill={colour}
        opacity={0.85}
      />
      {!feasible && (
        <rect
          x={x}
          y={y + 2}
          width={w}
          height={ROW_HEIGHT - 4}
          fill="url(#tornado-hatch)"
        />
      )}
      {uncertaintyPct > 0 && (
        <rect
          x={cbX}
          y={cbY}
          width={cbW}
          height={3}
          fill={colour}
          opacity={0.4}
          rx={1.5}
        />
      )}
    </g>
  );
}
