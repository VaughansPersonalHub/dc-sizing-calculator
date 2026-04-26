// Phase 10.6 — calibration-warnings tests.
//
// computeCalibrationWarnings is a pure function over ValidationSummary,
// so these tests construct the summary directly without spinning up
// the full Step 0 validator path.

import { describe, it, expect } from 'vitest';
import { computeCalibrationWarnings } from '../../src/ui/help/calibration-warnings';
import type { ValidationSummary } from '../../src/stores/engine.store';

function summary(opts: {
  totalSkus: number;
  cleanSkus?: number;
  warningSkus?: number;
  fatalSkus?: number;
  suppressedSkus?: number;
  codes?: Record<string, number>;
}): ValidationSummary {
  return {
    fatalErrors: [],
    warnings: [],
    suppressedSkus: [],
    stats: {
      totalSkus: opts.totalSkus,
      cleanSkus: opts.cleanSkus ?? opts.totalSkus,
      warningSkus: opts.warningSkus ?? 0,
      fatalSkus: opts.fatalSkus ?? 0,
      suppressedSkus: opts.suppressedSkus ?? 0,
      codesByCount: opts.codes ?? {},
    },
    ranAt: '2026-04-26T00:00:00Z',
    inputHash: 'test',
  };
}

describe('Phase 10.6 — computeCalibrationWarnings', () => {
  it('returns no warnings when there are no SKUs', () => {
    const out = computeCalibrationWarnings(summary({ totalSkus: 0 }));
    expect(out).toEqual([]);
  });

  it('returns no warnings on a clean medium-sized SKU set', () => {
    const out = computeCalibrationWarnings(summary({ totalSkus: 5000 }));
    expect(out).toEqual([]);
  });

  it('flags high CV outlier density above 5%', () => {
    const out = computeCalibrationWarnings(
      summary({ totalSkus: 1000, codes: { CV_OUTLIER: 80 } }) // 8 % > 5 %
    );
    const ids = out.map((w) => w.id);
    expect(ids).toContain('high_cv_outliers');
    const w = out.find((x) => x.id === 'high_cv_outliers')!;
    expect(w.severity).toBe('warn');
    expect(w.detail).toContain('80');
  });

  it('does NOT flag CV outliers at 4 %', () => {
    const out = computeCalibrationWarnings(
      summary({ totalSkus: 1000, codes: { CV_OUTLIER: 40 } })
    );
    expect(out.find((w) => w.id === 'high_cv_outliers')).toBeUndefined();
  });

  it('flags partial-history density above 10%', () => {
    const out = computeCalibrationWarnings(
      summary({ totalSkus: 1000, codes: { PARTIAL_HISTORY: 150 } })
    );
    expect(out.map((w) => w.id)).toContain('partial_history_density');
  });

  it('flags zero-demand rate above 15%', () => {
    const out = computeCalibrationWarnings(
      summary({ totalSkus: 1000, codes: { ZERO_DEMAND: 200 } })
    );
    expect(out.map((w) => w.id)).toContain('high_zero_demand_rate');
  });

  it('flags any missing halal status (zero tolerance)', () => {
    const out = computeCalibrationWarnings(
      summary({ totalSkus: 1000, codes: { MISSING_HALAL_STATUS: 1 } })
    );
    expect(out.map((w) => w.id)).toContain('missing_halal_status');
  });

  it('emits an info flag (not warn) for small samples', () => {
    const out = computeCalibrationWarnings(summary({ totalSkus: 50 }));
    const w = out.find((x) => x.id === 'small_sample_size');
    expect(w).toBeDefined();
    expect(w!.severity).toBe('info');
  });

  it('does NOT flag small sample at 200', () => {
    const out = computeCalibrationWarnings(summary({ totalSkus: 250 }));
    expect(out.find((w) => w.id === 'small_sample_size')).toBeUndefined();
  });

  it('flags high suppression rate above 10%', () => {
    const out = computeCalibrationWarnings(
      summary({ totalSkus: 1000, suppressedSkus: 200 })
    );
    expect(out.map((w) => w.id)).toContain('high_suppression_rate');
  });

  it('combines multiple flags when several thresholds trip', () => {
    const out = computeCalibrationWarnings(
      summary({
        totalSkus: 100,
        suppressedSkus: 30,
        codes: {
          CV_OUTLIER: 20,
          PARTIAL_HISTORY: 25,
          MISSING_HALAL_STATUS: 5,
        },
      })
    );
    const ids = out.map((w) => w.id);
    expect(ids).toContain('high_cv_outliers');
    expect(ids).toContain('partial_history_density');
    expect(ids).toContain('missing_halal_status');
    expect(ids).toContain('small_sample_size');
    expect(ids).toContain('high_suppression_rate');
  });

  it('every warning has all required fields populated', () => {
    const out = computeCalibrationWarnings(
      summary({
        totalSkus: 100,
        suppressedSkus: 30,
        codes: { CV_OUTLIER: 20, PARTIAL_HISTORY: 25, MISSING_HALAL_STATUS: 1, ZERO_DEMAND: 30 },
      })
    );
    expect(out.length).toBeGreaterThan(0);
    for (const w of out) {
      expect(w.id.length).toBeGreaterThan(2);
      expect(w.title.length).toBeGreaterThan(3);
      expect(w.detail.length).toBeGreaterThan(20);
      expect(w.suggestedAction.length).toBeGreaterThan(15);
      expect(['info', 'warn']).toContain(w.severity);
    }
  });
});
