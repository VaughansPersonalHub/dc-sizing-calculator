import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Download, Image as ImageIcon } from 'lucide-react';
import { useLayoutResult } from '../layout-renderer/useLayoutResult';
import { LayoutSvg } from '../layout-renderer/LayoutSvg';
import { SelectionPanel } from '../layout-renderer/SelectionPanel';
import { downloadSvg, downloadPng } from '../layout-renderer/export';
import { useEngagementStore } from '../../stores/engagement.store';
import {
  useLayoutViewStore,
  type LayerId,
  type FlowPattern,
} from '../../stores/layout-view.store';
import { SHORTCUT_CLEAR_SELECTION_EVENT } from '../hooks/useKeyboardShortcuts';
import { Tooltip } from '../components/Tooltip';
import { InfoTip } from '../components/InfoTip';
import { cn } from '../../utils/cn';

const LAYERS: { id: LayerId; label: string; tooltip: string }[] = [
  {
    id: 'grid',
    label: 'Column grid',
    tooltip: 'Structural column grid at 12-15 m centres. Reference for rack alignment.',
  },
  {
    id: 'storage',
    label: 'Storage zones',
    tooltip: 'PFP / CLS / Shelf zones from Step 5 with per-zone aisle orientation.',
  },
  {
    id: 'staging',
    label: 'Staging',
    tooltip: 'Cross-dock and QC/decant areas adjacent to docks (Step 9).',
  },
  {
    id: 'docks',
    label: 'Docks',
    tooltip: 'Inbound (sky) and outbound (orange) dock doors from Step 9.',
  },
  {
    id: 'support',
    label: 'Support / office',
    tooltip: 'Step 10 cluster — office, surau, customs, battery, antechamber, etc.',
  },
  {
    id: 'flow',
    label: 'Flow arrows',
    tooltip: 'Material flow direction. Shape depends on the flow pattern (I / U / L / custom).',
  },
  {
    id: 'fire_egress',
    label: 'Fire egress',
    tooltip: '5 m grid; cells more than 45 m from any egress point are hatched red.',
  },
  {
    id: 'pedestrian',
    label: 'Pedestrian',
    tooltip: 'Walkways and pedestrian-only areas (out-of-MHE-zone routes).',
  },
  {
    id: 'labels',
    label: 'Labels',
    tooltip: 'Zone names and dimensions on each rectangle.',
  },
  {
    id: 'scale',
    label: 'Scale bar',
    tooltip: '10 m reference scale for printed exports.',
  },
  {
    id: 'north',
    label: 'Compass',
    tooltip: 'North arrow at the top-right of the canvas.',
  },
];

const FLOW_PATTERNS: { id: FlowPattern; label: string; tooltip: string }[] = [
  {
    id: 'I_flow',
    label: 'I-flow (straight through)',
    tooltip:
      'Inbound and outbound on opposite walls. Longest travel cycle but cleanest separation; suits high-throughput single-purpose DCs.',
  },
  {
    id: 'U_flow',
    label: 'U-flow (same wall)',
    tooltip:
      'Inbound and outbound on the same wall. Shortest dock-area travel; good for cross-docking; trickier yard management.',
  },
  {
    id: 'L_flow',
    label: 'L-flow (adjacent walls)',
    tooltip:
      'Inbound and outbound on perpendicular walls. Compromise between I and U; common when site shape forces a 90° turn.',
  },
  {
    id: 'custom',
    label: 'Custom',
    tooltip: 'User-drawn polyline (advanced — Phase 7+ — site-specific routes).',
  },
];

export function LayoutTab() {
  const { layout, buildingTemplate } = useLayoutResult();
  const visibleLayers = useLayoutViewStore((s) => s.visibleLayers);
  const toggleLayer = useLayoutViewStore((s) => s.toggleLayer);
  const flowPattern = useLayoutViewStore((s) => s.flowPattern);
  const setFlowPattern = useLayoutViewStore((s) => s.setFlowPattern);
  const setSelectedZone = useLayoutViewStore((s) => s.setSelectedZone);
  const engagementName = useEngagementStore((s) => {
    const id = s.activeEngagementId;
    if (!id) return null;
    return s.availableEngagements.find((e) => e.id === id)?.name ?? null;
  });
  const svgRef = useRef<SVGSVGElement | null>(null);

  const exportFileBase = (engagementName ?? 'engagement')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'engagement';

  // Phase 9 — Esc clears the selected zone.
  useEffect(() => {
    function clearSelection() {
      setSelectedZone(null);
    }
    document.addEventListener(SHORTCUT_CLEAR_SELECTION_EVENT, clearSelection);
    return () => document.removeEventListener(SHORTCUT_CLEAR_SELECTION_EVENT, clearSelection);
  }, [setSelectedZone]);

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-2xl font-semibold tracking-tight">Block Diagram</h2>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Phase 7 · Visio-grade layout
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Block diagram of the engine result. Storage zones from Step 5 (with
        per-zone aisle orientation), dock placements from Step 9, support
        cluster from Step 10, all packed against the building envelope
        (polygon-clipped when supplied). Click any zone for details; toggle
        layers and flow patterns from the side panel.
      </p>

      {!layout && (
        <Banner kind="warning">
          No engine result yet — run the engine first on the{' '}
          <Link to="/scenarios" className="underline">
            Scenarios tab
          </Link>
          . The layout updates automatically when the engine completes.
        </Banner>
      )}

      {layout && buildingTemplate && (
        <>
          <FitBanner layout={layout} />

          <div className="mt-3 grid grid-cols-[auto_1fr] gap-4">
            {/* Sidebar: layers / flow / stats / selection */}
            <div className="w-52 space-y-3">
              <div className="rounded-md border border-border bg-card p-3">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Layers
                </h3>
                <ul className="space-y-1.5 text-xs">
                  {LAYERS.map((l) => (
                    <li key={l.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`layer-${l.id}`}
                        checked={visibleLayers[l.id]}
                        onChange={() => toggleLayer(l.id)}
                        className="h-3 w-3"
                      />
                      <label htmlFor={`layer-${l.id}`} className="select-none flex-1">
                        {l.label}
                      </label>
                      <InfoTip content={l.tooltip} side="right" label={`About ${l.label}`} />
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-md border border-border bg-card p-3">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  Flow pattern
                  <InfoTip
                    content="Material flow shape. I = inbound and outbound on opposite walls (longest cycle, cleanest). U = same wall (shortest, harder yard). L = adjacent walls (compromise). Picks the arrow geometry on the diagram."
                    side="right"
                  />
                </h3>
                <select
                  value={flowPattern}
                  onChange={(e) => setFlowPattern(e.target.value as FlowPattern)}
                  className="w-full text-xs rounded-sm border border-border bg-background px-2 py-1"
                  title={FLOW_PATTERNS.find((p) => p.id === flowPattern)?.tooltip}
                >
                  {FLOW_PATTERNS.map((p) => (
                    <option key={p.id} value={p.id} title={p.tooltip}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-md border border-border bg-card p-3">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Stats
                </h3>
                <ul className="space-y-1 text-xs">
                  <Stat label="Envelope" v={`${layout.envelopeLengthM} × ${layout.envelopeWidthM} m`} />
                  <Stat label="Polygon" v={layout.polygon ? `${layout.polygon.length} vtx` : 'rect'} />
                  <Stat label="Zones placed" v={layout.rects.filter((r) => !r.overflow).length} />
                  <Stat label="Doors" v={layout.doors.length} />
                  <Stat label="Solver" v={`${layout.elapsedMs.toFixed(1)} ms`} />
                  {layout.overflowed && (
                    <Stat label="Overflow" v={`${layout.overflowAreaM2.toFixed(0)} m²`} />
                  )}
                </ul>
              </div>

              <SelectionPanel layout={layout} />
            </div>

            {/* Diagram */}
            <div className="rounded-md border border-border bg-card p-3 overflow-auto">
              <div className="flex items-center justify-end gap-2 mb-2">
                <Tooltip
                  content="Vector format. Scales to any print size with no quality loss. Best for client deliverables and editing in Visio / Illustrator."
                  side="bottom"
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (svgRef.current) downloadSvg(svgRef.current, `${exportFileBase}-layout.svg`);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-sm border border-border hover:bg-accent"
                  >
                    <Download className="h-3 w-3" />
                    SVG
                  </button>
                </Tooltip>
                <Tooltip
                  content="2× raster export. Good for slide decks, email, screenshots. Fixed pixel size (will pixelate if blown up further)."
                  side="bottom"
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (svgRef.current) {
                        void downloadPng(svgRef.current, `${exportFileBase}-layout.png`);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-sm border border-border hover:bg-accent"
                  >
                    <ImageIcon className="h-3 w-3" />
                    PNG
                  </button>
                </Tooltip>
              </div>
              <LayoutSvg layout={layout} svgRef={svgRef} />
              <Legend />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FitBanner({ layout }: { layout: import('../layout-renderer/types').LayoutResult }) {
  const { infeasibility, overflowAreaM2 } = layout;
  const messages: string[] = [];
  if (infeasibility.envelopeOverflow) {
    messages.push(`Envelope overflows by ${overflowAreaM2.toFixed(0)} m²`);
  }
  if (infeasibility.clearHeightFail) {
    const shortM = (infeasibility.requiredRackHeightMm - infeasibility.usableRackHeightMm) / 1000;
    messages.push(`Clear height short by ${shortM.toFixed(1)} m (Step 4.5)`);
  }
  if (infeasibility.slabFail) {
    const shortT = infeasibility.staticSlabUdlTPerM2 - infeasibility.slabCapacityTPerM2;
    messages.push(`Slab UDL exceeds capacity by ${shortT.toFixed(1)} t/m²`);
  }
  if (infeasibility.seismicFail) {
    const shortT = infeasibility.seismicMassT - infeasibility.allowableSeismicMassT;
    messages.push(`Seismic mass exceeds allowable by ${shortT.toFixed(0)} t (Step 4.6)`);
  }
  if (messages.length === 0) {
    return (
      <Banner kind="success">
        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          <strong>Feasible.</strong> Envelope, slab, clear height and seismic
          checks all pass; storage + support clusters placed; dock doors
          anchored.
        </span>
      </Banner>
    );
  }
  return (
    <Banner kind="error">
      <div>
        <strong>Infeasible — {messages.length} flag{messages.length === 1 ? '' : 's'}.</strong>
        <ul className="mt-1 list-disc list-inside space-y-0.5">
          {messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </div>
    </Banner>
  );
}

function Legend() {
  const items: { label: string; colour: string }[] = [
    { label: 'PFP', colour: '#1e3a8a' },
    { label: 'CLS', colour: '#2563eb' },
    { label: 'Shelf', colour: '#60a5fa' },
    { label: 'Staging', colour: '#facc15' },
    { label: 'Office / amenities', colour: '#334155' },
    { label: 'Customs', colour: '#dc2626' },
    { label: 'Battery', colour: '#16a34a' },
    { label: 'Antechamber', colour: '#06b6d4' },
    { label: 'Inbound dock', colour: '#0ea5e9' },
    { label: 'Outbound dock', colour: '#f97316' },
  ];
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: i.colour }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function Stat({ label, v }: { label: string; v: string | number }) {
  return (
    <li className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{v}</span>
    </li>
  );
}

function Banner({
  kind,
  children,
}: {
  kind: 'warning' | 'error' | 'success';
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'px-3 py-2 rounded-md text-xs flex items-start gap-2',
        kind === 'warning'
          ? 'bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400'
          : kind === 'error'
            ? 'bg-destructive/10 border border-destructive/30 text-destructive'
            : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
      )}
    >
      {kind !== 'success' && <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
      <div>{children}</div>
    </div>
  );
}
