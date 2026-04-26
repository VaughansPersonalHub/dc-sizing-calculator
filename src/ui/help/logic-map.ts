// Phase 10.7.2 — Logic-map data.
//
// Hand-curated DAG of the engine pipeline. Nodes are step explainers
// (Step 0 → Step 14, no Step 13 because that's the Visio-grade
// renderer, not a pipeline step). Edges are the data-flow
// dependencies — Step A → Step B means B consumes one or more outputs
// of A.
//
// Positions are absolute SVG coordinates inside a 980 × 700 viewBox.
// Tweak by editing the table; the LogicMap component reads this
// directly without other layout logic.

export interface LogicNode {
  /** Step explainer id (matches src/ui/help/step-explainers.ts). */
  id: string;
  /** Short label rendered inside the node (e.g. "Step 7"). */
  label: string;
  /** Subtitle line (e.g. "Labour"). */
  subtitle: string;
  /** Tier — used to colour nodes by stage so the eye can group them. */
  tier: 'input' | 'profile' | 'storage' | 'throughput' | 'gate' | 'rollup' | 'sensitivity';
  /** Centre-x in the SVG viewBox. */
  x: number;
  /** Centre-y in the SVG viewBox. */
  y: number;
}

export interface LogicEdge {
  from: string;
  to: string;
}

export const LOGIC_NODES: readonly LogicNode[] = [
  { id: 'step-0-validation', label: 'Step 0', subtitle: 'Validation', tier: 'input', x: 490, y: 50 },
  { id: 'step-1-profiling', label: 'Step 1', subtitle: 'Profiling · ABC', tier: 'profile', x: 340, y: 130 },
  { id: 'step-2-growth', label: 'Step 2', subtitle: 'Forward growth', tier: 'profile', x: 640, y: 130 },
  { id: 'step-3-slot-sizing', label: 'Step 3', subtitle: 'Slot sizing', tier: 'storage', x: 220, y: 220 },
  { id: 'step-4-bays', label: 'Step 4', subtitle: 'Bays', tier: 'storage', x: 220, y: 300 },
  { id: 'step-4-5-clear-height', label: 'Step 4.5', subtitle: 'Clear height (gate)', tier: 'gate', x: 60, y: 380 },
  { id: 'step-4-6-seismic', label: 'Step 4.6', subtitle: 'Seismic mass (gate)', tier: 'gate', x: 220, y: 380 },
  { id: 'step-5-footprint', label: 'Step 5', subtitle: 'Footprint', tier: 'storage', x: 380, y: 380 },
  { id: 'step-6-throughput', label: 'Step 6', subtitle: 'Throughput', tier: 'throughput', x: 740, y: 220 },
  { id: 'step-7-labour', label: 'Step 7', subtitle: 'Labour', tier: 'throughput', x: 600, y: 300 },
  { id: 'step-9-docks', label: 'Step 9', subtitle: 'Docks · staging', tier: 'throughput', x: 880, y: 300 },
  { id: 'step-8-mhe', label: 'Step 8', subtitle: 'MHE fleet', tier: 'throughput', x: 540, y: 380 },
  { id: 'step-10-support', label: 'Step 10', subtitle: 'Support areas', tier: 'throughput', x: 720, y: 380 },
  { id: 'step-12-automation', label: 'Step 12', subtitle: 'Automation override', tier: 'storage', x: 380, y: 470 },
  { id: 'step-11-rollup', label: 'Step 11', subtitle: 'Footprint roll-up · feasibility', tier: 'rollup', x: 490, y: 560 },
  { id: 'step-14-tornado', label: 'Step 14', subtitle: 'Tornado · sensitivity', tier: 'sensitivity', x: 490, y: 640 },
];

export const LOGIC_EDGES: readonly LogicEdge[] = [
  { from: 'step-0-validation', to: 'step-1-profiling' },
  { from: 'step-0-validation', to: 'step-2-growth' },

  { from: 'step-1-profiling', to: 'step-3-slot-sizing' },
  { from: 'step-2-growth', to: 'step-3-slot-sizing' },

  { from: 'step-1-profiling', to: 'step-6-throughput' },
  { from: 'step-2-growth', to: 'step-6-throughput' },

  { from: 'step-3-slot-sizing', to: 'step-4-bays' },

  { from: 'step-4-bays', to: 'step-4-5-clear-height' },
  { from: 'step-4-bays', to: 'step-4-6-seismic' },
  { from: 'step-4-bays', to: 'step-5-footprint' },

  { from: 'step-6-throughput', to: 'step-7-labour' },
  { from: 'step-6-throughput', to: 'step-9-docks' },

  { from: 'step-7-labour', to: 'step-8-mhe' },
  { from: 'step-7-labour', to: 'step-10-support' },

  { from: 'step-5-footprint', to: 'step-12-automation' },
  { from: 'step-12-automation', to: 'step-11-rollup' },
  { from: 'step-5-footprint', to: 'step-11-rollup' },
  { from: 'step-4-5-clear-height', to: 'step-11-rollup' },
  { from: 'step-4-6-seismic', to: 'step-11-rollup' },
  { from: 'step-8-mhe', to: 'step-11-rollup' },
  { from: 'step-9-docks', to: 'step-11-rollup' },
  { from: 'step-10-support', to: 'step-11-rollup' },

  { from: 'step-11-rollup', to: 'step-14-tornado' },
];

const TIER_COLOURS: Record<LogicNode['tier'], string> = {
  input: '#6366f1', // indigo
  profile: '#0ea5e9', // sky
  storage: '#10b981', // emerald
  throughput: '#f59e0b', // amber
  gate: '#dc2626', // red — feasibility gates
  rollup: '#8b5cf6', // violet
  sensitivity: '#64748b', // slate
};

export function tierColour(tier: LogicNode['tier']): string {
  return TIER_COLOURS[tier];
}

/** Set of step ids that the given node depends on (transitive ancestors). */
export function ancestors(nodeId: string): Set<string> {
  const out = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const e of LOGIC_EDGES) {
      if (e.to === cur && !out.has(e.from)) {
        out.add(e.from);
        queue.push(e.from);
      }
    }
  }
  return out;
}

/** Set of step ids that depend on the given node (transitive descendants). */
export function descendants(nodeId: string): Set<string> {
  const out = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const e of LOGIC_EDGES) {
      if (e.from === cur && !out.has(e.to)) {
        out.add(e.to);
        queue.push(e.to);
      }
    }
  }
  return out;
}
