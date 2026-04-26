// Phase 10.7.8 — Pre-flight reviewer checklist tests.

import { describe, it, expect } from 'vitest';
import {
  computeChecklist,
  checklistProgress,
  isManualAckId,
  MANUAL_ACK_IDS,
  type ChecklistInput,
} from '../../src/ui/help/reviewer-checklist';
import type { ValidationSummary } from '../../src/stores/engine.store';

function summary(opts: Partial<ValidationSummary['stats']> = {}): ValidationSummary {
  return {
    fatalErrors: [],
    warnings: [],
    suppressedSkus: [],
    stats: {
      totalSkus: opts.totalSkus ?? 1000,
      cleanSkus: opts.cleanSkus ?? 1000,
      warningSkus: opts.warningSkus ?? 0,
      fatalSkus: opts.fatalSkus ?? 0,
      suppressedSkus: opts.suppressedSkus ?? 0,
      codesByCount: opts.codesByCount ?? {},
    },
    ranAt: '2026-04-26T00:00:00Z',
    inputHash: 'h',
  };
}

function input(overrides: Partial<ChecklistInput> = {}): ChecklistInput {
  return {
    hasActiveEngagement: true,
    skuCount: 1000,
    validation: summary(),
    validationAcknowledged: true,
    hasResult: true,
    feasibility: { overall: true, clearHeightOk: true, seismicOk: true, slabOk: true, envelopeOk: true },
    hasTornado: true,
    openCommentCount: 0,
    manualAcks: { region_flags: true, tornado_top3: true, calibration_warnings: true, key_citations: true },
    regionProfile: 'my',
    ...overrides,
  };
}

describe('Phase 10.7.8 — computeChecklist', () => {
  it('returns 10 items', () => {
    expect(computeChecklist(input())).toHaveLength(10);
  });

  it('all-pass on a fully prepared engagement', () => {
    const items = computeChecklist(input());
    const progress = checklistProgress(items);
    expect(progress.ready).toBe(true);
    expect(progress.pass).toBe(10);
  });

  it('flags missing engagement as fail', () => {
    const items = computeChecklist(input({ hasActiveEngagement: false }));
    const item = items.find((i) => i.id === 'active_engagement')!;
    expect(item.status).toBe('fail');
  });

  it('flags missing SKUs as fail', () => {
    const items = computeChecklist(input({ skuCount: 0 }));
    expect(items.find((i) => i.id === 'skus_imported')!.status).toBe('fail');
  });

  it('flags un-acknowledged data quality as fail', () => {
    const items = computeChecklist(input({ validationAcknowledged: false }));
    expect(items.find((i) => i.id === 'data_quality_ack')!.status).toBe('fail');
  });

  it('flags failing feasibility as warn (not fail)', () => {
    const items = computeChecklist(
      input({
        feasibility: { overall: false, clearHeightOk: false, seismicOk: true, slabOk: true, envelopeOk: true },
      })
    );
    const item = items.find((i) => i.id === 'no_fatal_flags')!;
    expect(item.status).toBe('warn');
    expect(item.suggestedAction).toContain('clear height');
  });

  it('manual region_flags becomes pass when reviewed', () => {
    const items = computeChecklist(
      input({ manualAcks: { region_flags: true, tornado_top3: true, calibration_warnings: true, key_citations: true } })
    );
    expect(items.find((i) => i.id === 'region_flags')!.status).toBe('pass');
  });

  it('manual region_flags is "manual" when not reviewed', () => {
    const items = computeChecklist(
      input({ manualAcks: { region_flags: false, tornado_top3: false, calibration_warnings: false, key_citations: false } })
    );
    expect(items.find((i) => i.id === 'region_flags')!.status).toBe('manual');
  });

  it('tornado_top3 is fail when no tornado has run', () => {
    const items = computeChecklist(input({ hasTornado: false }));
    const item = items.find((i) => i.id === 'tornado_top3')!;
    expect(item.status).toBe('fail');
  });

  it('comments_triaged warns when there are open comments', () => {
    const items = computeChecklist(input({ openCommentCount: 3 }));
    const item = items.find((i) => i.id === 'comments_triaged')!;
    expect(item.status).toBe('warn');
    expect(item.suggestedAction).toContain('3 open');
  });

  it('checklistProgress reports the percentage correctly', () => {
    const items = computeChecklist(input({ skuCount: 0 }));
    const progress = checklistProgress(items);
    expect(progress.total).toBe(10);
    expect(progress.pass).toBeLessThan(10);
    expect(progress.ready).toBe(false);
  });

  it('isManualAckId recognises every manual id', () => {
    for (const id of MANUAL_ACK_IDS) {
      expect(isManualAckId(id)).toBe(true);
    }
    expect(isManualAckId('not_a_thing')).toBe(false);
  });
});
