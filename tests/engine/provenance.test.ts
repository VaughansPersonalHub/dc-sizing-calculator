// Phase 10.7.4 — Provenance dataset tests.

import { describe, it, expect } from 'vitest';
import { PROVENANCE, findProvenance } from '../../src/ui/help/provenance';
import { STEP_EXPLAINERS } from '../../src/ui/help/step-explainers';
import { CITATIONS } from '../../src/ui/help/citations';

describe('Phase 10.7.4 — PROVENANCE dataset', () => {
  it('every entry has populated load-bearing fields', () => {
    for (const p of PROVENANCE) {
      expect(p.id.length).toBeGreaterThan(3);
      expect(p.label.length).toBeGreaterThan(2);
      expect(p.stepExplainerId.length).toBeGreaterThan(3);
      expect(p.inputs.length).toBeGreaterThan(0);
      expect(p.derivation.length).toBeGreaterThan(20);
    }
  });

  it('output ids are unique', () => {
    const ids = PROVENANCE.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every stepExplainerId resolves to a real step explainer', () => {
    const explainerIds = new Set(STEP_EXPLAINERS.map((s) => s.id));
    for (const p of PROVENANCE) {
      expect(
        explainerIds.has(p.stepExplainerId),
        `Provenance "${p.id}" → unknown step explainer "${p.stepExplainerId}"`
      ).toBe(true);
    }
  });

  it('citation topics resolve to real citations when present', () => {
    const topics = new Set(CITATIONS.map((c) => c.topic));
    for (const p of PROVENANCE) {
      if (p.citationTopic) {
        expect(
          topics.has(p.citationTopic),
          `Provenance "${p.id}" → unknown citation topic "${p.citationTopic}"`
        ).toBe(true);
      }
    }
  });

  it('covers the top engine outputs by name', () => {
    const ids = new Set(PROVENANCE.map((p) => p.id));
    expect(ids.has('step-7.totalPeakFte')).toBe(true);
    expect(ids.has('step-11.buildingFootprintGfaM2')).toBe(true);
    expect(ids.has('step-11.siteAreaM2')).toBe(true);
    expect(ids.has('step-9.totalDoors')).toBe(true);
  });

  it('findProvenance returns the entry by id, undefined for misses', () => {
    expect(findProvenance('step-7.totalPeakFte')).toBeDefined();
    expect(findProvenance('nope')).toBeUndefined();
  });
});
