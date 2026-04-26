// Phase 10.7.9 — Reviewer packet exporter.
//
// Bundles every Phase 8 export plus the comments JSON + a README into
// a single zip. Use case: one handoff artifact for a reviewer or
// client. Each file inside the zip is the same bytes that the
// individual download cards would produce — no new schema, no drift.
//
// Heavy dependencies (SheetJS, react-pdf, pptxgenjs) are dynamic-
// imported in the build path so the entry chunk stays light.

import { zipSync, strToU8 } from 'fflate';
import type { PipelineOutputs } from '../engine/pipeline';
import type { TornadoResult } from '../engine/tornado';
import type { OpsProfile } from '../schemas/scenario';
import { buildAssumptionsCsv } from './assumptions-csv';
import { exportCommentsJSON, commentSummary } from '../utils/comments';
import { exportEngagement } from '../sync/serialize';
import { fileBaseFromName } from './download';

export interface ReviewerPacketInputs {
  result: PipelineOutputs;
  tornado: TornadoResult | null;
  opsProfile: OpsProfile;
  engagementId: string;
  engagementName?: string;
  regionProfile?: string;
  /** Override generation timestamp — useful for tests. */
  generatedAt?: string;
}

export interface ReviewerPacketBuildResult {
  blob: Blob;
  /** Filenames included in the zip, in order. */
  files: string[];
  /** Total compressed size in bytes — surfaced to the UI for feedback. */
  size: number;
}

/**
 * Build the reviewer packet. Awaits every dynamic import in parallel
 * where it can; the heaviest step (PDF render via react-pdf) drives
 * the elapsed time.
 */
export async function buildReviewerPacket(
  inputs: ReviewerPacketInputs
): Promise<ReviewerPacketBuildResult> {
  const fileBase = fileBaseFromName(inputs.engagementName);
  const generatedAt = inputs.generatedAt ?? new Date().toISOString();

  // Spin up every artefact in parallel where practical.
  const [
    { buildScheduleOfAreasWorkbook, workbookToArrayBuffer },
    { renderSummaryPdf },
    sccBytes,
  ] = await Promise.all([
    import('./schedule-of-areas'),
    import('./pdf-renderer'),
    exportEngagement(inputs.engagementId),
  ]);

  const wb = buildScheduleOfAreasWorkbook({
    result: inputs.result,
    engagementName: inputs.engagementName,
    regionProfile: inputs.regionProfile,
  });
  const xlsxBuffer = workbookToArrayBuffer(wb);

  const csv = buildAssumptionsCsv({
    opsProfile: inputs.opsProfile,
    engagementName: inputs.engagementName,
    regionProfile: inputs.regionProfile,
    generatedAt,
  });

  const pdfBlob = await renderSummaryPdf({
    result: inputs.result,
    engagementName: inputs.engagementName,
    regionProfile: inputs.regionProfile,
    tornado: inputs.tornado,
  });
  const pdfBuffer = await pdfBlob.arrayBuffer();

  let pptBuffer: ArrayBuffer | null = null;
  if (inputs.tornado) {
    const { buildTornadoPptBlob } = await import('./tornado-ppt');
    const pptBlob = await buildTornadoPptBlob({
      tornado: inputs.tornado,
      engagementName: inputs.engagementName,
      regionProfile: inputs.regionProfile,
    });
    pptBuffer = await pptBlob.arrayBuffer();
  }

  const commentsJson = exportCommentsJSON(inputs.engagementId);
  const commentsCounts = commentSummary(inputs.engagementId);

  const readme = buildReadme({
    engagementName: inputs.engagementName ?? fileBase,
    regionProfile: inputs.regionProfile,
    generatedAt,
    feasible: inputs.result.feasibility.overall,
    hasTornado: inputs.tornado !== null,
    commentsTotal: commentsCounts.total,
    commentsOpen: commentsCounts.open,
  });

  const files: Record<string, Uint8Array> = {
    'README.md': strToU8(readme),
    [`${fileBase}-schedule-of-areas.xlsx`]: new Uint8Array(xlsxBuffer),
    [`${fileBase}-assumptions.csv`]: strToU8(csv),
    [`${fileBase}-summary.pdf`]: new Uint8Array(pdfBuffer),
    [`${fileBase}-comments.json`]: strToU8(commentsJson),
    [`${fileBase}.scc`]: sccBytes,
  };
  if (pptBuffer) {
    files[`${fileBase}-tornado.pptx`] = new Uint8Array(pptBuffer);
  }

  const zipped = zipSync(files);
  const blob = new Blob([zipped.slice().buffer], { type: 'application/zip' });

  return {
    blob,
    files: Object.keys(files),
    size: blob.size,
  };
}

interface ReadmeInputs {
  engagementName: string;
  regionProfile?: string;
  generatedAt: string;
  feasible: boolean;
  hasTornado: boolean;
  commentsTotal: number;
  commentsOpen: number;
}

export function buildReadme(i: ReadmeInputs): string {
  return [
    `# Reviewer Packet — ${i.engagementName}`,
    '',
    `**Region:** ${i.regionProfile ?? '—'}`,
    `**Generated:** ${i.generatedAt}`,
    `**Feasibility:** ${i.feasible ? 'Feasible' : 'Infeasible — see PDF for failing gates'}`,
    `**Comments:** ${i.commentsTotal} total · ${i.commentsOpen} open`,
    '',
    '## What is in this zip',
    '',
    '- `*-summary.pdf` — Four-page A4 PDF deck. Cover + key metrics + schedule of areas + tornado top-10 (when run).',
    '- `*-schedule-of-areas.xlsx` — Multi-sheet workbook (Summary, Storage Zones, Labour, MHE Fleet, Docks, Support, Footprint Roll-up, Automation when applied, Feasibility).',
    '- `*-assumptions.csv` — Flat dump of every ops-profile knob + tornado weights. Re-importable to any spreadsheet.',
    i.hasTornado ? '- `*-tornado.pptx` — Three-slide PowerPoint with native horizontal-bar tornado chart + ranked sensitivity table.' : '- (No tornado.pptx — tornado was not run before packet build.)',
    '- `*-comments.json` — Reviewer comment threads, schemaVersion 1. Re-importable into any DC Sizing Calculator instance, or readable by an AI session for follow-up.',
    '- `*.scc` — Gzipped JSON engagement snapshot. Round-trips into any SCConnect DC Sizing instance via the Outputs tab Import card.',
    '',
    '## How to use this packet',
    '',
    '1. Skim the **PDF** for the top-line verdict and key metrics.',
    '2. Drill into the **xlsx** for the Schedule of Areas — every cell is editable.',
    '3. If you want to challenge an assumption, open the **assumptions.csv** in a spreadsheet.',
    '4. If you want to re-run a what-if locally, drop the **.scc** into another DC Sizing Calculator instance and tweak.',
    '5. Add your review notes to **comments.json** (export from your local instance, the AI can read it back).',
    '',
    '_Generated by SCConnect DC Sizing Calculator. https://calc.scconnect.co.nz_',
  ].join('\n');
}
