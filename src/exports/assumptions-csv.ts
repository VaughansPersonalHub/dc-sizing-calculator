// Phase 8 — Assumptions CSV.
//
// SPEC §12 deliverable: a flat CSV of every ops-profile knob plus the
// engagement / scenario context. Pure utility — no DOM, no Dexie. The UI
// triggers a download by wrapping the string in a Blob.
//
// Columns: section, key, value. Sections: meta / ops / forwardDsoh /
// dsohChange / pareto / regional / tornado.

import type { OpsProfile } from '../schemas/scenario';

interface BuildAssumptionsInputs {
  opsProfile: OpsProfile;
  engagementName?: string;
  regionProfile?: string;
  generatedAt?: string;
}

export function buildAssumptionsCsv(inputs: BuildAssumptionsInputs): string {
  const ops = inputs.opsProfile;
  const rows: { section: string; key: string; value: string | number | boolean }[] = [];

  rows.push({ section: 'meta', key: 'engagementName', value: inputs.engagementName ?? '' });
  rows.push({ section: 'meta', key: 'regionProfile', value: inputs.regionProfile ?? ops.regionProfile });
  rows.push({ section: 'meta', key: 'generatedAt', value: inputs.generatedAt ?? new Date().toISOString() });
  rows.push({ section: 'meta', key: 'engagementId', value: ops.engagementId });

  // -- Ops profile (everything except nested objects)
  for (const [k, v] of Object.entries(ops)) {
    if (k === 'engagementId' || k === 'regionProfile') continue;
    if (
      v === null ||
      v === undefined ||
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'boolean'
    ) {
      rows.push({ section: 'ops', key: k, value: v ?? '' });
    }
  }

  // -- Forward DSOH days (per-velocity bucket)
  for (const bucket of ['A', 'B', 'C', 'D'] as const) {
    rows.push({
      section: 'forwardDsoh',
      key: bucket,
      value: ops.forwardFaceDsohDays[bucket],
    });
  }
  for (const bucket of ['A', 'B', 'C', 'D'] as const) {
    rows.push({
      section: 'dsohChange',
      key: bucket,
      value: ops.dsohChangeByVelocity[bucket],
    });
  }
  for (const bucket of ['A', 'B', 'C', 'D'] as const) {
    rows.push({
      section: 'pareto',
      key: bucket,
      value: ops.paretoBreakpoints[bucket],
    });
  }

  // -- Tornado weights
  rows.push({ section: 'tornado', key: 'wFootprint', value: ops.tornadoWeights.footprint });
  rows.push({ section: 'tornado', key: 'wFte', value: ops.tornadoWeights.fte });

  // CSV out
  const header = 'section,key,value';
  const body = rows.map((r) => `${csvCell(r.section)},${csvCell(r.key)},${csvCell(r.value)}`);
  return [header, ...body].join('\n') + '\n';
}

function csvCell(v: string | number | boolean): string {
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
