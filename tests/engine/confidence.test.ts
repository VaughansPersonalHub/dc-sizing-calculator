// Phase 10.7.7 — Confidence score tests.

import { describe, it, expect } from 'vitest';
import { computeConfidence } from '../../src/ui/help/confidence';

describe('Phase 10.7.7 — computeConfidence', () => {
  it('full clean data + LOW sensitivity → high confidence', () => {
    const c = computeConfidence({
      sensitivity: 'LOW — bays are derived deterministically from slot count.',
      totalSkus: 5000,
      cleanSkus: 5000,
    });
    expect(c.score).toBe(100);
    expect(c.level).toBe('high');
  });

  it('full clean data + HIGH sensitivity → medium confidence', () => {
    const c = computeConfidence({
      sensitivity: 'HIGH — every downstream step depends on a clean baseline.',
      totalSkus: 5000,
      cleanSkus: 5000,
    });
    expect(c.score).toBe(70);
    expect(c.level).toBe('medium');
  });

  it('lower data quality lowers the overall score', () => {
    const c = computeConfidence({
      sensitivity: 'MODERATE',
      totalSkus: 1000,
      cleanSkus: 800,
    });
    // 0.8 × 1.0 × 0.85 = 0.68 → 68
    expect(c.score).toBe(68);
    expect(c.level).toBe('medium');
  });

  it('drops to low when both data quality + sensitivity are weak', () => {
    const c = computeConfidence({
      sensitivity: 'HIGH',
      totalSkus: 1000,
      cleanSkus: 700,
    });
    // 0.7 × 1.0 × 0.7 = 0.49 → 49
    expect(c.score).toBe(49);
    expect(c.level).toBe('low');
  });

  it('library confidence override scales the result', () => {
    const c = computeConfidence({
      sensitivity: 'LOW',
      totalSkus: 1000,
      cleanSkus: 1000,
      libraryConfidence: 0.7,
    });
    // 1.0 × 0.7 × 1.0 = 0.7 → 70
    expect(c.score).toBe(70);
    expect(c.level).toBe('medium');
  });

  it('zero SKUs treats data quality as 1 (no division by zero)', () => {
    const c = computeConfidence({
      sensitivity: 'LOW',
      totalSkus: 0,
      cleanSkus: 0,
    });
    expect(c.score).toBe(100);
    expect(c.level).toBe('high');
  });

  it('exposes the breakdown for the tooltip', () => {
    const c = computeConfidence({
      sensitivity: 'MODERATE — drives Step 3 slot allocation.',
      totalSkus: 1000,
      cleanSkus: 900,
    });
    expect(c.detail.dataQualityPct).toBe(90);
    expect(c.detail.libraryConfidencePct).toBe(100);
    expect(c.detail.sensitivityFactor).toBeCloseTo(0.85);
    expect(c.detail.sensitivityLabel).toBe('MODERATE');
  });

  it('unknown sensitivity defaults to MODERATE', () => {
    const c = computeConfidence({
      sensitivity: 'something else entirely',
      totalSkus: 1000,
      cleanSkus: 1000,
    });
    expect(c.detail.sensitivityLabel).toBe('MODERATE');
    expect(c.detail.sensitivityFactor).toBeCloseTo(0.85);
  });
});
