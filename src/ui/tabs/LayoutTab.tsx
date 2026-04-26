import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useLayoutResult } from '../layout-renderer/useLayoutResult';
import { SimpleLayoutSvg } from '../layout-renderer/SimpleLayoutSvg';
import { useLayoutViewStore, type LayerId } from '../../stores/layout-view.store';
import { cn } from '../../utils/cn';

const PHASE_5_LAYERS: { id: LayerId; label: string }[] = [
  { id: 'storage', label: 'Storage zones' },
  { id: 'staging', label: 'Staging' },
  { id: 'docks', label: 'Docks' },
  { id: 'support', label: 'Support / office' },
  { id: 'labels', label: 'Labels' },
  { id: 'scale', label: 'Scale bar' },
  { id: 'north', label: 'Compass' },
];

export function LayoutTab() {
  const { layout, buildingTemplate } = useLayoutResult();
  const visibleLayers = useLayoutViewStore((s) => s.visibleLayers);
  const toggleLayer = useLayoutViewStore((s) => s.toggleLayer);

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-2xl font-semibold tracking-tight">Block Diagram</h2>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Phase 5 · simple rectangle layout
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Schematic block diagram of the engine result. Storage zones from
        Step 5, dock placements from Step 9, and the support cluster from
        Step 10 packed against the building envelope. Phase 7 will replace
        this with full Visio-grade rendering (polygons, flow arrows, fire
        egress, 11-layer toggle).
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
          <FitBanner overflowed={layout.overflowed} overflowAreaM2={layout.overflowAreaM2} />

          <div className="mt-3 grid grid-cols-[auto_1fr] gap-4">
            {/* Layer toggles */}
            <div className="rounded-md border border-border bg-card p-3 w-44">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Layers
              </h3>
              <ul className="space-y-1.5 text-xs">
                {PHASE_5_LAYERS.map((l) => (
                  <li key={l.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`layer-${l.id}`}
                      checked={visibleLayers[l.id]}
                      onChange={() => toggleLayer(l.id)}
                      className="h-3 w-3"
                    />
                    <label htmlFor={`layer-${l.id}`} className="select-none">
                      {l.label}
                    </label>
                  </li>
                ))}
              </ul>

              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-4 mb-2">
                Stats
              </h3>
              <ul className="space-y-1 text-xs">
                <Stat label="Envelope" v={`${layout.envelopeLengthM} × ${layout.envelopeWidthM} m`} />
                <Stat label="Zones placed" v={layout.rects.filter((r) => !r.overflow).length} />
                <Stat label="Doors" v={layout.doors.length} />
                <Stat label="Solver" v={`${layout.elapsedMs.toFixed(1)} ms`} />
                {layout.overflowed && (
                  <Stat label="Overflow" v={`${layout.overflowAreaM2.toFixed(0)} m²`} />
                )}
              </ul>
            </div>

            {/* Diagram */}
            <div className="rounded-md border border-border bg-card p-3 overflow-auto">
              <SimpleLayoutSvg layout={layout} />
              <Legend />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FitBanner({
  overflowed,
  overflowAreaM2,
}: {
  overflowed: boolean;
  overflowAreaM2: number;
}) {
  if (overflowed) {
    return (
      <Banner kind="error">
        <strong>Layout overflows the envelope</strong> by{' '}
        {overflowAreaM2.toFixed(0)} m². Increase the building footprint, raise
        levels, or downsize zones via the scenarios.
      </Banner>
    );
  }
  return (
    <Banner kind="success">
      <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
      <span>
        <strong>Fits within the envelope.</strong> Storage + support clusters
        placed; dock doors anchored to the south wall.
      </span>
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
