// Phase 8 chunk 1 — Schedule of Areas + Assumptions CSV tests.

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { runPipeline } from '../../src/engine/pipeline';
import {
  buildScheduleOfAreasWorkbook,
  workbookToArrayBuffer,
} from '../../src/exports/schedule-of-areas';
import { buildAssumptionsCsv } from '../../src/exports/assumptions-csv';
import {
  OPS,
  PALLETS,
  RACK,
  ENVELOPE,
  PRODUCTIVITY,
  MHE,
  REGIONAL,
  mkSku,
} from './fixtures';
import type { OpsProfile } from '../../src/schemas/scenario';

const baseInputs = {
  opsProfile: OPS,
  pallets: PALLETS,
  racks: [RACK],
  envelope: ENVELOPE,
  productivity: PRODUCTIVITY,
  mheLibrary: MHE,
  regional: REGIONAL,
  halalRequired: false,
};

describe('Phase 8 — Schedule of Areas Excel', () => {
  it('builds a workbook with all expected sheets', () => {
    const skus = [mkSku('A', 5000)];
    const result = runPipeline({ skus, ...baseInputs });
    const wb = buildScheduleOfAreasWorkbook({ result, engagementName: 'Test Eng', regionProfile: 'KR' });

    const expected = ['Summary', 'Storage Zones', 'Labour', 'MHE Fleet', 'Docks & Staging', 'Support Areas', 'Footprint Rollup', 'Feasibility'];
    for (const name of expected) expect(wb.SheetNames).toContain(name);
    // No automation sheet since step12 is null.
    expect(wb.SheetNames).not.toContain('Automation');
  });

  it('serialises to a non-empty xlsx ArrayBuffer that decodes back', () => {
    const skus = [mkSku('A', 1000)];
    const result = runPipeline({ skus, ...baseInputs });
    const wb = buildScheduleOfAreasWorkbook({ result });
    const buf = workbookToArrayBuffer(wb);
    expect(buf.byteLength).toBeGreaterThan(1000);
    const round = XLSX.read(buf, { type: 'array' });
    expect(round.SheetNames).toContain('Summary');
  });

  it('Summary sheet contains the engagement name and key totals', () => {
    const skus = [mkSku('A', 2000)];
    const result = runPipeline({ skus, ...baseInputs });
    const wb = buildScheduleOfAreasWorkbook({
      result,
      engagementName: 'Acme DC',
      regionProfile: 'MY',
    });
    const summary = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Summary, { header: 1 });
    const flat = summary.flat().filter((v) => v !== undefined && v !== null).map(String);
    expect(flat.some((v) => v.includes('Acme DC'))).toBe(true);
    expect(flat).toContain('MY');
    expect(flat).toContain('Building footprint GFA (m²)');
    expect(flat).toContain('Total peak FTE');
  });

  it('Storage Zones sheet has a header + one row per non-empty Step 5 zone + TOTAL', () => {
    const skus = [mkSku('A', 2000)];
    const result = runPipeline({ skus, ...baseInputs });
    const wb = buildScheduleOfAreasWorkbook({ result });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Storage Zones'], { header: 1 });
    // Header + zones + TOTAL
    expect(rows.length).toBeGreaterThanOrEqual(1 + result.step5.zones.length + 1);
    const lastRow = rows[rows.length - 1] as unknown[];
    expect(lastRow[0]).toBe('TOTAL');
  });

  it('Includes an Automation sheet when an automation system is selected', () => {
    const skus = [mkSku('A', 5000)];
    const result = runPipeline({
      skus,
      ...baseInputs,
      automationLibrary: [
        {
          system_id: 'autostore',
          category: 'g2p_cubic',
          densityUnit: 'cells/m²',
          densityValue: 26,
          throughputPerRobotPerHour: 30,
          defaultPackingEfficiency: 0.82,
        },
      ],
      automationConfig: {
        system_id: 'autostore',
        sizeToThroughputTarget: true,
        packingEfficiency: 0.82,
        motherChildMode: false,
      },
    });
    expect(result.step12).not.toBeNull();
    const wb = buildScheduleOfAreasWorkbook({ result });
    expect(wb.SheetNames).toContain('Automation');
  });
});

describe('Phase 8 — Assumptions CSV', () => {
  // Ops profile for the CSV doesn't need every field — the live OpsProfile
  // schema is rich, this fixture mirrors enough to round-trip the writer.
  const opsProfile: OpsProfile = {
    engagementId: 'eng-1',
    regionProfile: 'KR',
    operatingDaysPerYear: 300,
    shiftsPerDay: 2,
    hoursPerShift: 10,
    breakAllowanceMinutesPerDay: 40,
    productivityFactor: 0.82,
    absenteeismPct: 0.08,
    leaveFraction: 0.12,
    sickReliefPct: 0.05,
    productiveHoursPerDay: 18,
    peakUplift: 1.35,
    sigmaStorage: 1.0,
    percentileDocks: 0.95,
    percentileStaging: 0.95,
    horizontalHoneycombingFactor: 0.88,
    gridEfficiencyThreshold: 0.88,
    preferredAspectRatio: 1.6,
    skuPeakCorrelationCoefficient: 0.3,
    floorloadPalletisationYield: 0.88,
    dsohDays: 14,
    forwardFaceDsohDays: { A: 1.0, B: 2.5, C: 0, D: 0 },
    discontinuationLagMonths: 3,
    dsohChangeByVelocity: { A: 0, B: 0, C: 0, D: 0 },
    paretoBreakpoints: { A: 0.2, B: 0.5, C: 0.8, D: 1 },
    replenTriggerDays: 0.5,
    clsLaneFillFactor: 0.9,
    crossAisleSpacingM: 22,
    crossAisleWidthM: 2.4,
    canopyAllowancePct: 0.11,
    canopyType: 'cantilever',
    canopyOverhangM: 1.2,
    canopyCoverageExemptMaxM: 1.2,
    maxSiteCoverage: 0.55,
    phase2HorizontalPct: 0.2,
    phase2VerticalPct: 0.1,
    softSpacePct: 0.2,
    clearHeightMm: 12500,
    ordersPerBatch: 5,
    repackSecPerPallet: 90,
    repackSecPerUnit: 2,
    adminFte: 5,
    supervisorFte: 4,
    totalStaff: 85,
    vasBenches: 4,
    returnsRatePct: 2,
    returnsHandleTimeHours: 0.3,
    qcSampleRate: 0.1,
    qcDwellHours: 8,
    avgDgSkuFootprintM2: 0.5,
    dgMultiplier: 2.5,
    palletFootprintM2: 1.44,
    packerThroughput: 60,
    amenitiesArea: 80,
    trainingAreaM2: 40,
    firstAidAreaM2: 15,
    tornadoWeights: { footprint: 0.5, fte: 0.5 },
  };

  it('emits a CSV with sections (meta / ops / forwardDsoh / dsohChange / pareto / tornado)', () => {
    const csv = buildAssumptionsCsv({
      opsProfile,
      engagementName: 'Acme DC',
      regionProfile: 'KR',
    });
    expect(csv.startsWith('section,key,value\n')).toBe(true);
    expect(csv).toContain('meta,engagementName,Acme DC');
    expect(csv).toContain('ops,productivityFactor,0.82');
    expect(csv).toContain('forwardDsoh,A,1');
    expect(csv).toContain('forwardDsoh,B,2.5');
    expect(csv).toContain('dsohChange,A,0');
    expect(csv).toContain('pareto,A,0.2');
    expect(csv).toContain('tornado,wFootprint,0.5');
    expect(csv).toContain('tornado,wFte,0.5');
  });

  it('quotes commas and newlines in field values', () => {
    const opsWithCommas: OpsProfile = { ...opsProfile, regionProfile: 'KR, special' };
    const csv = buildAssumptionsCsv({
      opsProfile: opsWithCommas,
      engagementName: 'A "tricky" name, with commas',
    });
    expect(csv).toContain('meta,engagementName,"A ""tricky"" name, with commas"');
    expect(csv).toContain('"KR, special"');
  });
});
