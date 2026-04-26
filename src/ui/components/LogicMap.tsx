// Phase 10.7.2 — Visual logic map.
//
// Modal overlay showing the engine pipeline as a clickable DAG.
// Reviewer 1 persona: "I want to see at a glance how Step 7 depends
// on Step 6 and Step 1 — and what Step 11 ultimately consumes."
//
// Click a node → ancestor and descendant edges + nodes get highlighted,
// the right-side panel surfaces that step's StepExplainer card. Click
// the SVG background to deselect.

import { useMemo, useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import {
  LOGIC_NODES,
  LOGIC_EDGES,
  tierColour,
  ancestors,
  descendants,
  type LogicNode,
} from '../help/logic-map';
import { STEP_EXPLAINERS } from '../help/step-explainers';
import { StepExplainerCard } from './StepExplainer';
import { cn } from '../../utils/cn';

interface LogicMapProps {
  open: boolean;
  onClose: () => void;
}

const NODE_W = 124;
const NODE_H = 42;
const VIEW_W = 980;
const VIEW_H = 700;

export function LogicMap({ open, onClose }: LogicMapProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const highlight = useMemo(() => {
    if (!selected) return { ancestors: new Set<string>(), descendants: new Set<string>() };
    return {
      ancestors: ancestors(selected),
      descendants: descendants(selected),
    };
  }, [selected]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const selectedNode = selected ? LOGIC_NODES.find((n) => n.id === selected) : undefined;
  const selectedExplainer = selected
    ? STEP_EXPLAINERS.find((s) => s.id === selected)
    : undefined;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-stretch justify-center p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative w-full max-w-6xl max-h-full overflow-auto rounded-lg bg-card border border-border shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="logic-map-title"
      >
        <div className="sticky top-0 bg-card border-b border-border px-6 py-3 flex items-center justify-between z-10">
          <div>
            <h2 id="logic-map-title" className="text-lg font-semibold tracking-tight">
              Engine logic map
            </h2>
            <p className="text-xs text-muted-foreground">
              Click any step to highlight its inputs (ancestors) and outputs (descendants).
              Esc to close.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close logic map"
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 p-4 flex-1 min-h-0">
          <div
            className="flex-1 min-w-0 rounded-md border border-border bg-muted/20 overflow-auto"
            onClick={() => setSelected(null)}
          >
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              className="block w-full h-auto"
              role="graphics-document"
              aria-label="Engine pipeline DAG"
            >
              <defs>
                <marker
                  id="arrow-default"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L10,5 L0,10 z" fill="#94a3b8" />
                </marker>
                <marker
                  id="arrow-hi"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L10,5 L0,10 z" fill="#0ea5e9" />
                </marker>
              </defs>

              {/* edges */}
              {LOGIC_EDGES.map((edge) => {
                const from = LOGIC_NODES.find((n) => n.id === edge.from);
                const to = LOGIC_NODES.find((n) => n.id === edge.to);
                if (!from || !to) return null;
                const onPath =
                  selected === null ||
                  edge.from === selected ||
                  edge.to === selected ||
                  (highlight.ancestors.has(edge.from) && highlight.ancestors.has(edge.to)) ||
                  (highlight.ancestors.has(edge.from) && edge.to === selected) ||
                  (edge.from === selected && highlight.descendants.has(edge.to)) ||
                  (highlight.descendants.has(edge.from) && highlight.descendants.has(edge.to));
                const dim = selected !== null && !onPath;

                // Curve path between bottom of from and top of to.
                const x1 = from.x;
                const y1 = from.y + NODE_H / 2;
                const x2 = to.x;
                const y2 = to.y - NODE_H / 2;
                const dy = y2 - y1;
                const cx1 = x1;
                const cy1 = y1 + dy * 0.4;
                const cx2 = x2;
                const cy2 = y2 - dy * 0.4;
                const d = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;

                return (
                  <path
                    key={`${edge.from}->${edge.to}`}
                    d={d}
                    fill="none"
                    stroke={onPath ? '#0ea5e9' : '#94a3b8'}
                    strokeWidth={onPath ? 1.6 : 1}
                    opacity={dim ? 0.18 : onPath && selected ? 0.9 : 0.55}
                    markerEnd={onPath ? 'url(#arrow-hi)' : 'url(#arrow-default)'}
                  />
                );
              })}

              {/* nodes */}
              {LOGIC_NODES.map((node) => {
                const isSelected = node.id === selected;
                const isAncestor = highlight.ancestors.has(node.id);
                const isDescendant = highlight.descendants.has(node.id);
                const dim = selected !== null && !isSelected && !isAncestor && !isDescendant;
                return (
                  <NodeRect
                    key={node.id}
                    node={node}
                    selected={isSelected}
                    isAncestor={isAncestor}
                    isDescendant={isDescendant}
                    dim={dim}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(node.id === selected ? null : node.id);
                    }}
                  />
                );
              })}
            </svg>
          </div>

          <aside className="lg:w-96 lg:shrink-0 flex flex-col gap-3 overflow-auto">
            {!selectedNode && (
              <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground leading-relaxed">
                <p>
                  Pick a step on the left to see its inputs, outputs, formula, assumptions, and
                  ways it could be wrong. Edges show data dependencies — bays feeds the gates +
                  footprint; throughput feeds labour + docks; everything funnels into Step 11
                  roll-up before Step 14 sensitivity.
                </p>
                <ul className="mt-3 space-y-1 text-[10.5px]">
                  <li className="flex items-center gap-1.5">
                    <Swatch colour={tierColour('input')} />
                    Input · validation
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Swatch colour={tierColour('profile')} />
                    Demand profile
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Swatch colour={tierColour('storage')} />
                    Storage / slotting / footprint
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Swatch colour={tierColour('throughput')} />
                    Throughput / labour / docks
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Swatch colour={tierColour('gate')} />
                    Mandatory feasibility gate
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Swatch colour={tierColour('rollup')} />
                    Roll-up + feasibility
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Swatch colour={tierColour('sensitivity')} />
                    Sensitivity / tornado
                  </li>
                </ul>
              </div>
            )}
            {selectedNode && selectedExplainer && (
              <>
                <div className="rounded-md border border-border bg-card px-3 py-2 text-xs">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Selected
                  </div>
                  <div className="font-semibold">
                    {selectedNode.label} · {selectedNode.subtitle}
                  </div>
                  <div className="text-[10.5px] text-muted-foreground mt-1">
                    Highlighted: {highlight.ancestors.size} ancestor
                    {highlight.ancestors.size === 1 ? '' : 's'} ·{' '}
                    {highlight.descendants.size} descendant
                    {highlight.descendants.size === 1 ? '' : 's'}.
                  </div>
                </div>
                <StepExplainerCard data={selectedExplainer} defaultOpen />
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function NodeRect({
  node,
  selected,
  isAncestor,
  isDescendant,
  dim,
  onClick,
}: {
  node: LogicNode;
  selected: boolean;
  isAncestor: boolean;
  isDescendant: boolean;
  dim: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const colour = tierColour(node.tier);
  const x = node.x - NODE_W / 2;
  const y = node.y - NODE_H / 2;
  return (
    <g
      onClick={onClick}
      className="cursor-pointer"
      opacity={dim ? 0.28 : 1}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      aria-label={`${node.label}: ${node.subtitle}. Click to highlight dependencies.`}
    >
      <rect
        x={x}
        y={y}
        width={NODE_W}
        height={NODE_H}
        rx={6}
        fill="white"
        stroke={colour}
        strokeWidth={selected ? 3 : isAncestor || isDescendant ? 2 : 1.5}
        className={cn(
          'transition-[stroke-width]',
          // shadow when selected
          selected ? 'drop-shadow-md' : ''
        )}
      />
      <text
        x={node.x}
        y={node.y - 2}
        textAnchor="middle"
        fontSize={11}
        fontWeight={600}
        fill={colour}
      >
        {node.label}
      </text>
      <text
        x={node.x}
        y={node.y + 12}
        textAnchor="middle"
        fontSize={9}
        fill="#475569"
      >
        {node.subtitle}
      </text>
    </g>
  );
}

function Swatch({ colour }: { colour: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block w-3 h-3 rounded-sm"
      style={{ background: colour }}
    />
  );
}
