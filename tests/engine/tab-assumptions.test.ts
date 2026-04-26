// Phase 10.7.1 — tab-assumptions index tests.
//
// The drawer reads TAB_ASSUMPTIONS keyed by tab id. These tests assert
// the data shape: every TabId has an entry, every citationTopic
// resolves to a real CITATIONS entry, and every entry carries either
// text or a citationTopic (not both, not neither).

import { describe, it, expect } from 'vitest';
import { TAB_ASSUMPTIONS, type TabId } from '../../src/ui/help/tab-assumptions';
import { CITATIONS } from '../../src/ui/help/citations';

const ALL_TABS: TabId[] = [
  'engagements',
  'inputs',
  'reference',
  'design-rules',
  'scenarios',
  'outputs',
  'layout',
];

describe('Phase 10.7.1 — TAB_ASSUMPTIONS', () => {
  it('covers all 7 tabs', () => {
    for (const tabId of ALL_TABS) {
      expect(
        TAB_ASSUMPTIONS[tabId],
        `Missing TAB_ASSUMPTIONS entry for "${tabId}"`
      ).toBeDefined();
    }
  });

  it('every tab has at least one assumption', () => {
    for (const tabId of ALL_TABS) {
      expect(TAB_ASSUMPTIONS[tabId].length).toBeGreaterThan(0);
    }
  });

  it('every citationTopic resolves to a real CITATIONS entry', () => {
    const topics = new Set(CITATIONS.map((c) => c.topic));
    for (const tabId of ALL_TABS) {
      for (const item of TAB_ASSUMPTIONS[tabId]) {
        if (item.citationTopic) {
          expect(
            topics.has(item.citationTopic),
            `Tab "${tabId}" references unknown citation "${item.citationTopic}"`
          ).toBe(true);
        }
      }
    }
  });

  it('every entry has either text OR citationTopic, never both, never neither', () => {
    for (const tabId of ALL_TABS) {
      for (const item of TAB_ASSUMPTIONS[tabId]) {
        const hasText = !!item.text;
        const hasCitation = !!item.citationTopic;
        expect(
          (hasText || hasCitation) && !(hasText && hasCitation),
          `Tab "${tabId}" entry must have exactly one of text / citationTopic`
        ).toBe(true);
      }
    }
  });

  it('inline notes are non-trivially long (forces useful prose)', () => {
    for (const tabId of ALL_TABS) {
      for (const item of TAB_ASSUMPTIONS[tabId]) {
        if (item.text) {
          expect(item.text.length).toBeGreaterThan(40);
        }
      }
    }
  });

  it('Scenarios tab covers the most-load-bearing citations', () => {
    const scenariosTopics = TAB_ASSUMPTIONS.scenarios
      .map((i) => i.citationTopic)
      .filter(Boolean);
    expect(scenariosTopics).toContain('Walking pick speed');
    expect(scenariosTopics).toContain('Slab UDL — typical industrial');
  });
});
