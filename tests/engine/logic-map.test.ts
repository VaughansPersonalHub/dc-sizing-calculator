// Phase 10.7.2 — Logic-map data + helpers tests.

import { describe, it, expect } from 'vitest';
import {
  LOGIC_NODES,
  LOGIC_EDGES,
  ancestors,
  descendants,
  tierColour,
} from '../../src/ui/help/logic-map';
import { STEP_EXPLAINERS } from '../../src/ui/help/step-explainers';

describe('Phase 10.7.2 — LOGIC_NODES', () => {
  it('every node id resolves to a real step explainer', () => {
    const explainerIds = new Set(STEP_EXPLAINERS.map((s) => s.id));
    for (const node of LOGIC_NODES) {
      expect(
        explainerIds.has(node.id),
        `Logic node "${node.id}" → unknown step explainer`
      ).toBe(true);
    }
  });

  it('node ids are unique', () => {
    const ids = LOGIC_NODES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every node has a tier colour', () => {
    for (const node of LOGIC_NODES) {
      const colour = tierColour(node.tier);
      expect(colour).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('node positions stay inside the 980 × 700 viewBox', () => {
    for (const node of LOGIC_NODES) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(980);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThanOrEqual(700);
    }
  });
});

describe('Phase 10.7.2 — LOGIC_EDGES', () => {
  it('every edge endpoint resolves to a known node', () => {
    const ids = new Set(LOGIC_NODES.map((n) => n.id));
    for (const edge of LOGIC_EDGES) {
      expect(ids.has(edge.from), `Edge from "${edge.from}" → unknown node`).toBe(true);
      expect(ids.has(edge.to), `Edge to "${edge.to}" → unknown node`).toBe(true);
    }
  });

  it('no self-loops', () => {
    for (const edge of LOGIC_EDGES) {
      expect(edge.from).not.toBe(edge.to);
    }
  });

  it('Step 11 has multiple inbound edges (storage + throughput converge)', () => {
    const inbound = LOGIC_EDGES.filter((e) => e.to === 'step-11-rollup');
    expect(inbound.length).toBeGreaterThanOrEqual(5);
  });
});

describe('Phase 10.7.2 — ancestors / descendants', () => {
  it('Step 0 has no ancestors (it is the root)', () => {
    expect(ancestors('step-0-validation').size).toBe(0);
  });

  it('Step 14 has Step 11 as a direct ancestor', () => {
    expect(ancestors('step-14-tornado').has('step-11-rollup')).toBe(true);
  });

  it('Step 14 has Step 0 as a transitive ancestor', () => {
    expect(ancestors('step-14-tornado').has('step-0-validation')).toBe(true);
  });

  it('Step 0 has Step 11 and Step 14 as descendants', () => {
    const desc = descendants('step-0-validation');
    expect(desc.has('step-11-rollup')).toBe(true);
    expect(desc.has('step-14-tornado')).toBe(true);
  });

  it('Step 14 has no descendants', () => {
    expect(descendants('step-14-tornado').size).toBe(0);
  });

  it('Step 7 ancestors include Step 6 and Step 0 transitively', () => {
    const anc = ancestors('step-7-labour');
    expect(anc.has('step-6-throughput')).toBe(true);
    expect(anc.has('step-0-validation')).toBe(true);
  });
});
