// Phase 10.3 — citations dataset tests.

import { describe, it, expect } from 'vitest';
import { CITATIONS } from '../../src/ui/help/citations';

describe('Phase 10.3 — CITATIONS dataset', () => {
  it('covers the must-have citations the user named explicitly', () => {
    const topics = CITATIONS.map((c) => c.topic);
    // Vaughan asked for JAKIM Surau, MTM-2 walking speed, SCDF cross-aisle
    // by name. Anything else is bonus, but these three must be present.
    expect(topics).toContain('Surau (prayer room) ratio');
    expect(topics).toContain('Walking pick speed');
    expect(topics).toContain('SCDF cross-aisle / fire compartment');
  });

  it('every citation has the load-bearing fields populated', () => {
    for (const c of CITATIONS) {
      expect(c.topic.length).toBeGreaterThan(5);
      expect(c.value.length).toBeGreaterThan(5);
      expect(c.source.length).toBeGreaterThan(3);
      expect(c.reference.length).toBeGreaterThan(20);
      expect(c.consumedBy.length).toBeGreaterThan(0);
    }
  });

  it('topics are unique', () => {
    const topics = CITATIONS.map((c) => c.topic);
    const set = new Set(topics);
    expect(set.size).toBe(topics.length);
  });

  it('every consumedBy reference points at a real engine step', () => {
    const validPrefixes = ['Step 0', 'Step 1', 'Step 2', 'Step 3', 'Step 4', 'Step 5', 'Step 6', 'Step 7', 'Step 8', 'Step 9', 'Step 10', 'Step 11', 'Step 12', 'Step 14'];
    for (const c of CITATIONS) {
      for (const consumer of c.consumedBy) {
        const matches = validPrefixes.some((p) => consumer.startsWith(p));
        expect(matches, `Citation "${c.topic}" references unknown step "${consumer}"`).toBe(true);
      }
    }
  });
});
