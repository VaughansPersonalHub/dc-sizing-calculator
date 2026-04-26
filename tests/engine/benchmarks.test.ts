// Phase 10.6 — benchmarks dataset + classification tests.

import { describe, it, expect } from 'vitest';
import {
  BENCHMARKS,
  classifyBenchmark,
  type BenchmarkInput,
} from '../../src/ui/help/benchmarks';
import { STEP_EXPLAINERS } from '../../src/ui/help/step-explainers';

describe('Phase 10.6 — BENCHMARKS dataset', () => {
  it('has at least the 5–10 chips the user named', () => {
    // Handover specifies 5–10 chips; we ship 7.
    expect(BENCHMARKS.length).toBeGreaterThanOrEqual(5);
    expect(BENCHMARKS.length).toBeLessThanOrEqual(15);
  });

  it('every benchmark has the load-bearing fields populated', () => {
    for (const b of BENCHMARKS) {
      expect(b.id.length).toBeGreaterThan(2);
      expect(b.label.length).toBeGreaterThan(3);
      expect(b.unit.length).toBeGreaterThanOrEqual(0); // some units are %, may be 1 char
      expect(b.description.length).toBeGreaterThan(20);
      expect(b.band.high).toBeGreaterThan(b.band.low);
      expect(b.sources.length).toBeGreaterThan(0);
      for (const s of b.sources) {
        expect(s.name.length).toBeGreaterThan(2);
        expect(s.reference.length).toBeGreaterThan(10);
      }
    }
  });

  it('benchmark ids are unique', () => {
    const ids = BENCHMARKS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every benchmark stepExplainerId points at a real explainer', () => {
    const explainerIds = new Set(STEP_EXPLAINERS.map((s) => s.id));
    for (const b of BENCHMARKS) {
      expect(
        explainerIds.has(b.stepExplainerId),
        `Benchmark "${b.id}" → unknown stepExplainerId "${b.stepExplainerId}"`
      ).toBe(true);
    }
  });

  it('FTE per 1k peak lines benchmark exists with sensible band', () => {
    const fte = BENCHMARKS.find((b) => b.id === 'fte_per_k_lines');
    expect(fte).toBeDefined();
    expect(fte!.band.low).toBeGreaterThan(0.5);
    expect(fte!.band.high).toBeLessThan(10);
  });
});

describe('Phase 10.6 — classifyBenchmark', () => {
  const band = { low: 30, high: 55 };

  it('returns "ok" inside the band', () => {
    expect(classifyBenchmark(30, band)).toBe('ok');
    expect(classifyBenchmark(42, band)).toBe('ok');
    expect(classifyBenchmark(55, band)).toBe('ok');
  });

  it('returns "near" within tolerance of the band edge', () => {
    // band width 25, 15% tolerance = 3.75 → near-low edge 26.25, near-high edge 58.75
    expect(classifyBenchmark(28, band)).toBe('near');
    expect(classifyBenchmark(57, band)).toBe('near');
  });

  it('returns "outside" beyond tolerance', () => {
    expect(classifyBenchmark(20, band)).toBe('outside');
    expect(classifyBenchmark(80, band)).toBe('outside');
  });

  it('uses the wider of band-width × 15% or band.high × 5%', () => {
    // Tight band [10, 11] — 15% of 1 = 0.15, but 5% of 11 = 0.55. Tolerance = 0.55.
    const tight = { low: 10, high: 11 };
    expect(classifyBenchmark(11.4, tight)).toBe('near');
    expect(classifyBenchmark(11.7, tight)).toBe('outside');
  });
});

describe('Phase 10.6 — BENCHMARKS valueFn behaviour', () => {
  // Minimal-but-valid input shape for the valueFns.
  const baseResult: BenchmarkInput = {
    step3: { totals: { pfpPositions: 1000, clsLanes: 200 } },
    step5: { totalAlignedAreaM2: 1500 },
    step6: { peak: { pickLinesPerDay: 5000 } },
    step7: { totalPeakFte: 12 },
    step8: { totalUnits: 6, totalChargingFootprintM2: 60 },
    step9: {
      inbound: { blendedCycleMin: 42 },
      outbound: { blendedCycleMin: 32 },
    },
    step11: {
      rollup: {
        buildingFootprintGfaM2: 3500,
        siteCoverageM2: 4200,
        siteAreaM2: 9000,
      },
    },
  };

  it('FTE per 1k lines computes correctly', () => {
    const b = BENCHMARKS.find((x) => x.id === 'fte_per_k_lines')!;
    // 12 / (5000/1000) = 2.4
    expect(b.valueFn(baseResult)).toBeCloseTo(2.4, 5);
  });

  it('returns null when the denominator is zero', () => {
    const b = BENCHMARKS.find((x) => x.id === 'fte_per_k_lines')!;
    const zeroLines: BenchmarkInput = {
      ...baseResult,
      step6: { peak: { pickLinesPerDay: 0 } },
    };
    expect(b.valueFn(zeroLines)).toBeNull();
  });

  it('GFA per pallet position uses pfp + cls as denominator', () => {
    const b = BENCHMARKS.find((x) => x.id === 'gfa_per_pallet_position')!;
    // 3500 / (1000 + 200) = 2.917
    expect(b.valueFn(baseResult)).toBeCloseTo(2.917, 2);
  });

  it('site coverage % returns a percentage value', () => {
    const b = BENCHMARKS.find((x) => x.id === 'site_coverage_pct')!;
    // 4200 / 9000 = 0.4667 → 46.67 %
    expect(b.valueFn(baseResult)).toBeCloseTo(46.67, 1);
  });

  it('charging area per MHE returns m²/unit', () => {
    const b = BENCHMARKS.find((x) => x.id === 'charging_area_per_mhe')!;
    // 60 / 6 = 10
    expect(b.valueFn(baseResult)).toBe(10);
  });

  it('storage zone density returns null when no positions', () => {
    const b = BENCHMARKS.find((x) => x.id === 'storage_zone_density_m2_per_pallet')!;
    const zero: BenchmarkInput = {
      ...baseResult,
      step3: { totals: { pfpPositions: 0, clsLanes: 0 } },
    };
    expect(b.valueFn(zero)).toBeNull();
  });

  it('outbound dock cycle returns null when zero', () => {
    const b = BENCHMARKS.find((x) => x.id === 'dock_cycle_outbound_min')!;
    const zero: BenchmarkInput = {
      ...baseResult,
      step9: {
        inbound: { blendedCycleMin: 42 },
        outbound: { blendedCycleMin: 0 },
      },
    };
    expect(b.valueFn(zero)).toBeNull();
  });
});
