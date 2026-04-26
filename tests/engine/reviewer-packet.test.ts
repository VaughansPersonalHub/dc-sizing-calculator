// Phase 10.7.9 — Reviewer packet tests.
//
// The full buildReviewerPacket pipeline pulls Dexie + react-pdf +
// pptxgenjs + SheetJS through dynamic imports, so end-to-end testing
// belongs in Playwright. Here we cover the README generator (pure
// function, simple) — that's the only piece the packet adds on top of
// existing tested exports.

import { describe, it, expect } from 'vitest';
import { buildReadme } from '../../src/exports/reviewer-packet';

describe('Phase 10.7.9 — buildReadme', () => {
  it('renders the engagement name in the title', () => {
    const md = buildReadme({
      engagementName: 'Acme MY DC',
      regionProfile: 'my',
      generatedAt: '2026-04-26T00:00:00Z',
      feasible: true,
      hasTornado: true,
      commentsTotal: 0,
      commentsOpen: 0,
    });
    expect(md).toContain('# Reviewer Packet — Acme MY DC');
  });

  it('marks feasibility as Feasible / Infeasible accordingly', () => {
    const okMd = buildReadme({
      engagementName: 'X',
      generatedAt: '2026-01-01',
      feasible: true,
      hasTornado: false,
      commentsTotal: 0,
      commentsOpen: 0,
    });
    expect(okMd).toContain('**Feasibility:** Feasible');

    const failMd = buildReadme({
      engagementName: 'X',
      generatedAt: '2026-01-01',
      feasible: false,
      hasTornado: false,
      commentsTotal: 0,
      commentsOpen: 0,
    });
    expect(failMd).toContain('**Feasibility:** Infeasible');
  });

  it('omits the tornado bullet when no tornado has run', () => {
    const md = buildReadme({
      engagementName: 'X',
      generatedAt: '2026-01-01',
      feasible: true,
      hasTornado: false,
      commentsTotal: 0,
      commentsOpen: 0,
    });
    expect(md).toContain('No tornado.pptx');
    expect(md).not.toContain('Three-slide PowerPoint');
  });

  it('includes the tornado bullet when tornado is included', () => {
    const md = buildReadme({
      engagementName: 'X',
      generatedAt: '2026-01-01',
      feasible: true,
      hasTornado: true,
      commentsTotal: 0,
      commentsOpen: 0,
    });
    expect(md).toContain('Three-slide PowerPoint');
  });

  it('reports comment counts', () => {
    const md = buildReadme({
      engagementName: 'X',
      generatedAt: '2026-01-01',
      feasible: true,
      hasTornado: true,
      commentsTotal: 5,
      commentsOpen: 2,
    });
    expect(md).toContain('5 total · 2 open');
  });

  it('mentions every artefact in the bundle', () => {
    const md = buildReadme({
      engagementName: 'X',
      generatedAt: '2026-01-01',
      feasible: true,
      hasTornado: true,
      commentsTotal: 0,
      commentsOpen: 0,
    });
    expect(md).toContain('summary.pdf');
    expect(md).toContain('schedule-of-areas.xlsx');
    expect(md).toContain('assumptions.csv');
    expect(md).toContain('comments.json');
    expect(md).toContain('.scc');
  });

  it('writes "—" when region is missing', () => {
    const md = buildReadme({
      engagementName: 'X',
      generatedAt: '2026-01-01',
      feasible: true,
      hasTornado: false,
      commentsTotal: 0,
      commentsOpen: 0,
    });
    expect(md).toContain('**Region:** —');
  });

  it('echoes the supplied region', () => {
    const md = buildReadme({
      engagementName: 'X',
      regionProfile: 'sg',
      generatedAt: '2026-01-01',
      feasible: true,
      hasTornado: false,
      commentsTotal: 0,
      commentsOpen: 0,
    });
    expect(md).toContain('**Region:** sg');
  });
});
