// Phase 8 — Tornado PowerPoint export (pptxgenjs).
//
// SPEC §12 deliverable: a slide deck a planner can drop into a client
// review. Three slides:
//
//   1. Title — engagement name, generation timestamp, baseline footprint
//      + peak FTE, feasibility verdict.
//   2. Tornado chart — horizontal bar chart of the top 10 ranked params
//      with the {low, high} footprint delta against baseline. pptxgenjs
//      builds the chart natively so PowerPoint shows real editable bars.
//   3. Sensitivity table — full ranked list, including FTE deltas and
//      feasibility flags.

import pptxgen from 'pptxgenjs';
import type { TornadoResult } from '../engine/tornado';

interface BuildTornadoPptInputs {
  tornado: TornadoResult;
  engagementName?: string;
  regionProfile?: string;
  generatedAt?: string;
}

const TITLE_FONT = 'Calibri';
const SLATE_900 = '0F172A';
const SLATE_500 = '64748B';
const RED_600 = 'DC2626';
const GREEN_600 = '16A34A';
const SKY_500 = '0EA5E9';

export async function buildTornadoPptBlob(inputs: BuildTornadoPptInputs): Promise<Blob> {
  const { tornado } = inputs;
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.title = `${inputs.engagementName ?? 'Engagement'} — Tornado`;

  addTitleSlide(pres, inputs);
  addTornadoChartSlide(pres, tornado);
  addSensitivityTableSlide(pres, tornado);

  // pptxgen typings declare write() as returning string | ArrayBuffer in
  // some versions; the runtime returns whatever the format requested asks
  // for. We ask for blob and assert on the result.
  const blob = (await pres.write({ outputType: 'blob' })) as Blob;
  return blob;
}

function addTitleSlide(pres: pptxgen, inputs: BuildTornadoPptInputs): void {
  const slide = pres.addSlide();
  slide.background = { color: 'F8FAFC' };
  slide.addText('SCConnect · DC Sizing Calculator', {
    x: 0.5,
    y: 0.4,
    w: 12,
    h: 0.4,
    fontSize: 12,
    color: SLATE_500,
    fontFace: TITLE_FONT,
  });
  slide.addText(inputs.engagementName ?? 'Engagement', {
    x: 0.5,
    y: 0.85,
    w: 12,
    h: 0.9,
    fontSize: 36,
    bold: true,
    color: SLATE_900,
    fontFace: TITLE_FONT,
  });
  slide.addText('Tornado — sensitivity analysis', {
    x: 0.5,
    y: 1.7,
    w: 12,
    h: 0.5,
    fontSize: 18,
    color: SLATE_500,
    fontFace: TITLE_FONT,
  });

  const stats: { label: string; value: string }[] = [
    { label: 'Region', value: inputs.regionProfile ?? '—' },
    { label: 'Generated', value: inputs.generatedAt ?? new Date().toISOString().slice(0, 19) + 'Z' },
    {
      label: 'Baseline footprint',
      value: `${Math.round(inputs.tornado.baseline.footprintM2).toLocaleString()} m²`,
    },
    { label: 'Baseline peak FTE', value: round1(inputs.tornado.baseline.peakFte).toString() },
    { label: 'Feasible variants', value: inputs.tornado.feasibleVariantCount.toString() },
    { label: 'Infeasible variants', value: inputs.tornado.infeasibleVariantCount.toString() },
  ];
  stats.forEach((s, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.5 + col * 4.3;
    const y = 3.2 + row * 1.1;
    slide.addText(s.label.toUpperCase(), {
      x,
      y,
      w: 4,
      h: 0.3,
      fontSize: 9,
      color: SLATE_500,
      fontFace: TITLE_FONT,
      bold: true,
    });
    slide.addText(s.value, {
      x,
      y: y + 0.3,
      w: 4,
      h: 0.5,
      fontSize: 18,
      color: SLATE_900,
      fontFace: TITLE_FONT,
    });
  });
}

function addTornadoChartSlide(pres: pptxgen, tornado: TornadoResult): void {
  const slide = pres.addSlide();
  slide.background = { color: 'FFFFFF' };
  slide.addText('Footprint sensitivity — top 10 params', {
    x: 0.5,
    y: 0.3,
    w: 12,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: SLATE_900,
    fontFace: TITLE_FONT,
  });

  const top = tornado.rows.slice(0, 10);
  // pptxgen's bar chart wants categories + data series. We model "low" and
  // "high" as two stacked series, where the low series is negative values
  // and the high series is positive — that produces the classic tornado
  // look in PowerPoint.
  const categories = top.map((r) => r.label);
  const lowData = top.map((r) => r.footprintDelta.low);
  const highData = top.map((r) => r.footprintDelta.high);

  slide.addChart(
    pres.ChartType.bar,
    [
      { name: 'Low (m² delta)', labels: categories, values: lowData },
      { name: 'High (m² delta)', labels: categories, values: highData },
    ],
    {
      x: 0.5,
      y: 0.9,
      w: 12,
      h: 6,
      barDir: 'bar',
      barGrouping: 'standard',
      chartColors: [RED_600, GREEN_600],
      catAxisLabelFontSize: 10,
      valAxisLabelFontSize: 10,
      showLegend: true,
      legendPos: 'b',
      showTitle: false,
    }
  );
}

function addSensitivityTableSlide(pres: pptxgen, tornado: TornadoResult): void {
  const slide = pres.addSlide();
  slide.background = { color: 'FFFFFF' };
  slide.addText('Full ranked sensitivity', {
    x: 0.5,
    y: 0.3,
    w: 12,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: SLATE_900,
    fontFace: TITLE_FONT,
  });

  const header = ['Param', '±', 'ΔLow m²', 'ΔHigh m²', 'ΔLow FTE', 'ΔHigh FTE', 'Feasible'];
  const headerRow = header.map((h) => ({
    text: h,
    options: { bold: true, fill: { color: 'E2E8F0' }, color: SLATE_900, fontSize: 10 },
  }));

  const rows = tornado.rows.map((r) => [
    { text: r.label, options: { fontSize: 9, color: SLATE_900 } },
    { text: r.deltaLabel, options: { fontSize: 9, color: SLATE_500 } },
    { text: r.footprintDelta.low.toFixed(0), options: { fontSize: 9, align: 'right' as const } },
    { text: r.footprintDelta.high.toFixed(0), options: { fontSize: 9, align: 'right' as const } },
    { text: round1(r.fteDelta.low).toString(), options: { fontSize: 9, align: 'right' as const } },
    { text: round1(r.fteDelta.high).toString(), options: { fontSize: 9, align: 'right' as const } },
    {
      text:
        r.feasibility.low && r.feasibility.high ? 'both' :
        r.feasibility.low ? 'low only' :
        r.feasibility.high ? 'high only' : 'neither',
      options: {
        fontSize: 9,
        color: r.feasibility.low && r.feasibility.high ? GREEN_600 : RED_600,
      },
    },
  ]);

  slide.addTable([headerRow, ...rows], {
    x: 0.5,
    y: 0.9,
    w: 12,
    colW: [4.2, 1.0, 1.4, 1.4, 1.3, 1.3, 1.4],
    border: { type: 'solid', pt: 0.5, color: 'CBD5E1' },
    fontFace: TITLE_FONT,
  });

  // Tiny footer with the colour key.
  slide.addText(
    `Sky-blue = inbound · Red/Green = low / high. Ranked by weighted delta (footprint + FTE × ${0.5}/${0.5}).`,
    {
      x: 0.5,
      y: 7.0,
      w: 12,
      h: 0.3,
      fontSize: 8,
      color: SLATE_500,
      fontFace: TITLE_FONT,
    }
  );
  void SKY_500; // referenced in the comment above
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
