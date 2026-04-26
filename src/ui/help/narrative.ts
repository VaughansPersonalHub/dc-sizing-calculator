// Phase 10.7.5 — Plain-English engagement narrative.
//
// Auto-generated 1-2 paragraph summary that fits on a single line of
// reviewer attention. Pulled together from the engine result + the
// optional tornado run. Used as the headline NarrativeCard on
// Scenarios and Outputs.
//
// Pure function over the same EngineResultLike shape used by the
// benchmarks dataset, so this module stays independent of engine/.

import type { TornadoResult } from '../../engine/tornado';

export interface NarrativeInput {
  meta: { skuCount: number; suppressedCount: number; durationMs: number };
  validation: { stats: { totalSkus: number; suppressedSkus: number } };
  step6: {
    daily: { pickLinesPerDay: number; outboundPallets: number; inboundPallets: number };
    peak: { pickLinesPerDay: number };
  };
  step7: { totalPeakFte: number; ramadanAnnualImpact: number };
  step8: { totalUnits: number };
  step9: { totalDoors: number };
  step11: {
    rollup: {
      buildingFootprintGfaM2: number;
      siteAreaM2: number;
      siteCoverageM2: number;
      automationSwapped: boolean;
      automationSavingsM2: number;
    };
  };
  step12: { systemId: string; meetsThroughput: boolean } | null;
  feasibility: {
    overall: boolean;
    clearHeightOk: boolean;
    seismicOk: boolean;
    slabOk: boolean;
    envelopeOk: boolean;
  };
}

export interface NarrativeOutput {
  summary: string;
  bullets: string[];
  feasible: boolean;
  /** ISO timestamp of generation — useful for cache-busting. */
  generatedAt: string;
}

function pretty(n: number): string {
  return Math.round(n).toLocaleString();
}

function failingGates(f: NarrativeInput['feasibility']): string[] {
  const out: string[] = [];
  if (!f.clearHeightOk) out.push('clear height');
  if (!f.seismicOk) out.push('seismic mass');
  if (!f.slabOk) out.push('slab UDL');
  if (!f.envelopeOk) out.push('envelope fit');
  return out;
}

/**
 * Format the top-N tornado rows as a sensitivity bullet. Falls back to
 * an empty string when no tornado has been run.
 */
function tornadoSentence(tornado: TornadoResult | null, n: number = 3): string {
  if (!tornado || tornado.rows.length === 0) return '';
  const top = tornado.rows.slice(0, n);
  const items = top.map((r) => {
    const swing = Math.max(Math.abs(r.footprintDelta.low), Math.abs(r.footprintDelta.high));
    return `${r.label} (±${pretty(swing)} m²)`;
  });
  if (items.length === 0) return '';
  return `Top ${items.length} footprint sensitivities: ${items.join(', ')}.`;
}

export function buildNarrative(
  result: NarrativeInput,
  tornado: TornadoResult | null = null
): NarrativeOutput {
  const totalSkus = result.validation.stats.totalSkus;
  const activeSkus = totalSkus - result.validation.stats.suppressedSkus;
  const peakLines = result.step6.peak.pickLinesPerDay;
  const peakFte = result.step7.totalPeakFte;
  const gfa = result.step11.rollup.buildingFootprintGfaM2;
  const site = result.step11.rollup.siteAreaM2;
  const cover = site > 0 ? (result.step11.rollup.siteCoverageM2 / site) * 100 : 0;
  const fleet = result.step8.totalUnits;
  const doors = result.step9.totalDoors;
  const feasible = result.feasibility.overall;
  const failing = failingGates(result.feasibility);

  const automationLine = result.step11.rollup.automationSwapped
    ? ` ${result.step12?.systemId ?? 'Automation'} replaces conventional storage, saving ~${pretty(result.step11.rollup.automationSavingsM2)} m² of footprint${result.step12 && !result.step12.meetsThroughput ? ' but does not meet peak throughput on the supplied configuration' : ''}.`
    : '';

  const ramadanLine =
    result.step7.ramadanAnnualImpact > 0
      ? ` Ramadan derate adds ~${(result.step7.ramadanAnnualImpact * 100).toFixed(1)}% annual labour impact.`
      : '';

  const sensitivity = tornadoSentence(tornado, 3);
  const sensitivityClause = sensitivity ? ` ${sensitivity}` : '';

  const verdict = feasible
    ? 'All four feasibility gates pass.'
    : `Feasibility blocked by ${failing.join(' + ')}.`;

  const summary =
    `This DC sizes for ~${pretty(activeSkus)} active SKUs ` +
    `(of ${pretty(totalSkus)} imported), ` +
    `shipping ~${pretty(peakLines)} peak pick lines/day. ` +
    `Sized for ${peakFte.toFixed(0)} peak FTE working across a ${pretty(gfa)} m² building ` +
    `on a ${pretty(site)} m² site (${cover.toFixed(0)}% site coverage), ` +
    `with ${doors} dock doors and ${fleet} MHE units.` +
    automationLine +
    ramadanLine +
    ' ' +
    verdict +
    sensitivityClause;

  const bullets: string[] = [
    `${pretty(activeSkus)} active SKUs · ${pretty(peakLines)} peak pick lines/day · ${peakFte.toFixed(0)} peak FTE`,
    `${pretty(gfa)} m² building · ${pretty(site)} m² site (${cover.toFixed(0)}% coverage)`,
    `${doors} doors · ${fleet} MHE units`,
    feasible
      ? 'All feasibility gates pass'
      : `Infeasible — failing: ${failing.join(', ')}`,
  ];
  if (sensitivity) bullets.push(sensitivity);
  if (result.step11.rollup.automationSwapped) {
    bullets.push(
      `${result.step12?.systemId ?? 'Automation'} swap saves ~${pretty(result.step11.rollup.automationSavingsM2)} m²`
    );
  }

  return {
    summary,
    bullets,
    feasible,
    generatedAt: new Date().toISOString(),
  };
}
