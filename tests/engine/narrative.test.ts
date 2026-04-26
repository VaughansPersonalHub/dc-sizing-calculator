// Phase 10.7.5 — Narrative card generator tests.

import { describe, it, expect } from 'vitest';
import { buildNarrative, type NarrativeInput } from '../../src/ui/help/narrative';
import type { TornadoResult } from '../../src/engine/tornado';

function input(overrides: Partial<NarrativeInput> = {}): NarrativeInput {
  return {
    meta: { skuCount: 5000, suppressedCount: 200, durationMs: 50 },
    validation: { stats: { totalSkus: 5000, suppressedSkus: 200 } },
    step6: {
      daily: { pickLinesPerDay: 4500, outboundPallets: 100, inboundPallets: 80 },
      peak: { pickLinesPerDay: 8000 },
    },
    step7: { totalPeakFte: 28, ramadanAnnualImpact: 0 },
    step8: { totalUnits: 12 },
    step9: { totalDoors: 6 },
    step11: {
      rollup: {
        buildingFootprintGfaM2: 4200,
        siteAreaM2: 7000,
        siteCoverageM2: 4500,
        automationSwapped: false,
        automationSavingsM2: 0,
      },
    },
    step12: null,
    feasibility: {
      overall: true,
      clearHeightOk: true,
      seismicOk: true,
      slabOk: true,
      envelopeOk: true,
    },
    ...overrides,
  };
}

describe('Phase 10.7.5 — buildNarrative', () => {
  it('renders a feasible summary with all the headline numbers', () => {
    const out = buildNarrative(input());
    expect(out.feasible).toBe(true);
    expect(out.summary).toContain('4,800 active SKUs');
    expect(out.summary).toContain('8,000 peak pick lines');
    expect(out.summary).toContain('28 peak FTE');
    expect(out.summary).toContain('4,200 m²');
    expect(out.summary).toContain('7,000 m² site');
    expect(out.summary).toContain('64% site coverage');
    expect(out.summary).toContain('All four feasibility gates pass');
  });

  it('flags failing gates by name when infeasible', () => {
    const out = buildNarrative(
      input({
        feasibility: {
          overall: false,
          clearHeightOk: false,
          seismicOk: true,
          slabOk: true,
          envelopeOk: false,
        },
      })
    );
    expect(out.feasible).toBe(false);
    expect(out.summary).toContain('clear height');
    expect(out.summary).toContain('envelope fit');
    expect(out.summary).not.toContain('seismic');
    expect(out.summary).not.toContain('slab UDL');
  });

  it('mentions Ramadan impact when present', () => {
    const out = buildNarrative(
      input({
        step7: { totalPeakFte: 30, ramadanAnnualImpact: 0.018 },
      })
    );
    expect(out.summary).toContain('Ramadan');
    expect(out.summary).toContain('1.8%');
  });

  it('does NOT mention Ramadan when impact is zero', () => {
    const out = buildNarrative(input());
    expect(out.summary).not.toContain('Ramadan');
  });

  it('mentions automation swap savings when applied', () => {
    const out = buildNarrative(
      input({
        step11: {
          rollup: {
            buildingFootprintGfaM2: 3200,
            siteAreaM2: 6000,
            siteCoverageM2: 3300,
            automationSwapped: true,
            automationSavingsM2: 1200,
          },
        },
        step12: { systemId: 'autostore', meetsThroughput: true },
      })
    );
    expect(out.summary).toContain('autostore');
    expect(out.summary).toContain('1,200 m²');
  });

  it('flags automation throughput shortfall', () => {
    const out = buildNarrative(
      input({
        step11: {
          rollup: {
            buildingFootprintGfaM2: 3200,
            siteAreaM2: 6000,
            siteCoverageM2: 3300,
            automationSwapped: true,
            automationSavingsM2: 800,
          },
        },
        step12: { systemId: 'geek_plus', meetsThroughput: false },
      })
    );
    expect(out.summary).toContain('does not meet peak throughput');
  });

  it('appends the top 3 tornado sensitivities when supplied', () => {
    const tornado = {
      rows: [
        {
          paramId: 'peak_factor',
          label: 'Peak factor',
          deltaLabel: '±20%',
          footprintDelta: { low: -300, high: 420 },
          fteDelta: { low: -2, high: 3 },
          feasibility: { low: true, high: true },
          weightedDelta: 100,
        },
        {
          paramId: 'dsoh',
          label: 'DSOH days',
          deltaLabel: '±20%',
          footprintDelta: { low: -200, high: 260 },
          fteDelta: { low: 0, high: 0 },
          feasibility: { low: true, high: true },
          weightedDelta: 50,
        },
        {
          paramId: 'productivity',
          label: 'Productivity factor',
          deltaLabel: '±15%',
          footprintDelta: { low: -150, high: 200 },
          fteDelta: { low: -1, high: 1 },
          feasibility: { low: true, high: true },
          weightedDelta: 25,
        },
      ],
      baseline: { footprintM2: 4000, peakFte: 28 },
      summary: { scenarios: [], totalElapsedMs: 0, feasibleCount: 0, infeasibleCount: 0 },
      feasibleVariantCount: 0,
      infeasibleVariantCount: 0,
    } as unknown as TornadoResult;

    const out = buildNarrative(input(), tornado);
    expect(out.summary).toContain('Peak factor');
    expect(out.summary).toContain('DSOH days');
    expect(out.summary).toContain('Productivity factor');
    expect(out.summary).toMatch(/±420 m²/);
  });

  it('produces a sensible bullet list', () => {
    const out = buildNarrative(input());
    expect(out.bullets.length).toBeGreaterThanOrEqual(4);
    expect(out.bullets[0]).toContain('active SKUs');
    expect(out.bullets[3]).toContain('feasibility gates pass');
  });

  it('emits a generatedAt timestamp', () => {
    const out = buildNarrative(input());
    expect(new Date(out.generatedAt).toString()).not.toBe('Invalid Date');
  });
});
