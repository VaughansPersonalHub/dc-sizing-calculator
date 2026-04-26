// Phase 8 — Schedule of Areas (multi-sheet Excel via SheetJS).
//
// SPEC §12 deliverable: a single .xlsx that captures every facility-sizing
// number the engine produced. One sheet per major roll-up so a planner
// (or a quantity surveyor) can pivot off any of them without scrolling.
//
// Sheets (in order):
//   1. Summary           Key totals + feasibility verdict
//   2. Storage Zones     Step 5 — per-zone width / depth / aligned area / orientation
//   3. Labour            Step 7 — task list with FTE breakdown
//   4. MHE Fleet         Step 8 — per class with kVA + charging footprint
//   5. Docks & Staging   Step 9 — door budget + staging
//   6. Support Areas     Step 10 — full breakdown
//   7. Footprint Rollup  Step 11 — operational + amenities + canopy + site
//   8. Automation        Step 12 (only when an automation system was selected)
//   9. Feasibility       Gate flags + shortfall numbers
//
// Build is pure: PipelineOutputs → ArrayBuffer. The UI wraps the buffer in
// a Blob and triggers a download.

import * as XLSX from 'xlsx';
import type { PipelineOutputs } from '../engine/pipeline';

interface BuildScheduleInputs {
  result: PipelineOutputs;
  /** Engagement label written into the Summary sheet. Defaults to "Engagement". */
  engagementName?: string;
  /** Region (KR / TW / VN / MY / SG / ID). Written into the Summary sheet. */
  regionProfile?: string;
}

export function buildScheduleOfAreasWorkbook(inputs: BuildScheduleInputs): XLSX.WorkBook {
  const { result } = inputs;
  const wb = XLSX.utils.book_new();

  appendSheet(wb, 'Summary', summaryRows(inputs));
  appendSheet(wb, 'Storage Zones', storageZoneRows(result));
  appendSheet(wb, 'Labour', labourRows(result));
  appendSheet(wb, 'MHE Fleet', mheFleetRows(result));
  appendSheet(wb, 'Docks & Staging', dockRows(result));
  appendSheet(wb, 'Support Areas', supportAreaRows(result));
  appendSheet(wb, 'Footprint Rollup', footprintRollupRows(result));
  if (result.step12) appendSheet(wb, 'Automation', automationRows(result));
  appendSheet(wb, 'Feasibility', feasibilityRows(result));

  return wb;
}

export function workbookToArrayBuffer(wb: XLSX.WorkBook): ArrayBuffer {
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

// ---------------------------------------------------------------------------
// Sheet builders — each returns rows of [label, value] (or richer for tables)
// ---------------------------------------------------------------------------

type Cell = string | number | null;

function summaryRows(inputs: BuildScheduleInputs): Cell[][] {
  const { result } = inputs;
  const rows: Cell[][] = [
    ['DC Sizing Calculator — Schedule of Areas'],
    [],
    ['Engagement', inputs.engagementName ?? 'Engagement'],
    ['Region', inputs.regionProfile ?? '—'],
    ['Generated', result.meta.completedAt],
    ['Engine duration (ms)', round1(result.meta.durationMs)],
    ['SKUs in scope', result.meta.skuCount],
    ['SKUs suppressed (Step 0)', result.meta.suppressedCount],
    [],
    ['Building footprint GFA (m²)', round0(result.step11.rollup.buildingFootprintGfaM2)],
    ['Site coverage (m²)', round0(result.step11.rollup.siteCoverageM2)],
    ['Site area required (m²)', round0(result.step11.rollup.siteAreaM2)],
    ['Soft space — Phase 2 (m²)', round0(result.step11.rollup.softSpace.totalM2)],
    [],
    ['Total peak FTE', round1(result.step7.totalPeakFte)],
    ['Total base FTE', round1(result.step7.totalBaseFte)],
    ['Total MHE units', result.step8.totalUnits],
    ['Inbound doors', result.step9.inbound.doorsRequired],
    ['Outbound doors', result.step9.outbound.doorsRequired],
    [],
    ['Feasibility — overall', verdict(result.feasibility.overall)],
    ['Feasibility — clear height', verdict(result.feasibility.clearHeightOk)],
    ['Feasibility — seismic', verdict(result.feasibility.seismicOk)],
    ['Feasibility — slab UDL', verdict(result.feasibility.slabOk)],
    ['Feasibility — envelope', verdict(result.feasibility.envelopeOk)],
  ];
  return rows;
}

function storageZoneRows(result: PipelineOutputs): Cell[][] {
  const header: Cell[] = [
    'Zone',
    'Aligned bays',
    'Bays per row',
    'Rows',
    'Width (m)',
    'Depth (m)',
    'Raw area (m²)',
    'Aligned area (m²)',
    'Grid efficiency',
    'Orientation',
  ];
  const rows: Cell[][] = result.step5.zones.map((z) => [
    z.zone,
    z.alignedBays,
    z.baysPerRow,
    z.rows,
    round1(z.zoneWidthRawM),
    round1(z.zoneDepthRawM),
    round0(z.rawAreaM2),
    round0(z.alignedAreaM2),
    round3(z.gridEfficiency),
    z.orientation,
  ]);
  rows.push([
    'TOTAL',
    null,
    null,
    null,
    null,
    null,
    round0(result.step5.totalRawAreaM2),
    round0(result.step5.totalAlignedAreaM2),
    round3(result.step5.averageGridEfficiency),
    null,
  ]);
  return [header, ...rows];
}

function labourRows(result: PipelineOutputs): Cell[][] {
  const header: Cell[] = [
    'Task',
    'Method',
    'Unit type',
    'Travel model',
    'Zone area (m²)',
    'Volume / day',
    'Static time (s)',
    'Travel time (s)',
    'Rate / hr',
    'Base FTE',
    'Peak FTE',
  ];
  const rows: Cell[][] = result.step7.tasks.map((t) => [
    t.task,
    t.method,
    t.unitType,
    t.travelModel,
    round0(t.zoneAreaM2),
    round0(t.volumePerDay),
    round1(t.staticTimeSec),
    round1(t.travelTimeSec),
    round1(t.ratePerHour),
    round2(t.baseFte),
    round2(t.peakFte),
  ]);
  rows.push([
    'TOTAL',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    round2(result.step7.totalBaseFte),
    round2(result.step7.totalPeakFte),
  ]);
  rows.push([]);
  rows.push(['Availability factor', round3(result.step7.availability)]);
  rows.push(['Ramadan annual impact', round3(result.step7.ramadanAnnualImpact)]);
  return [header, ...rows];
}

function mheFleetRows(result: PipelineOutputs): Cell[][] {
  const header: Cell[] = [
    'MHE class',
    'Category',
    'Battery',
    'Task hours / yr',
    'Available hrs / unit',
    'Utilisation target',
    'Fleet count',
    'Charging footprint (m²)',
    'Charging kVA',
  ];
  const rows: Cell[][] = result.step8.fleets.map((f) => [
    f.mhe_id,
    f.category,
    f.batteryType,
    round0(f.totalTaskHoursPerYear),
    round0(f.availableHoursPerUnit),
    round2(f.utilisationTarget),
    f.fleetCount,
    round0(f.chargingFootprintM2),
    round0(f.chargingKvaTotal),
  ]);
  rows.push([
    'TOTAL',
    null,
    null,
    null,
    null,
    null,
    result.step8.totalUnits,
    round0(result.step8.totalChargingFootprintM2),
    round0(result.step8.totalChargingKva),
  ]);
  return [header, ...rows];
}

function dockRows(result: PipelineOutputs): Cell[][] {
  const inb = result.step9.inbound;
  const out = result.step9.outbound;
  const stg = result.step9.staging;
  const rows: Cell[][] = [
    ['Direction', 'Containers / day', 'Pallets / container', 'Cycle min', 'Doors required'],
    ['Inbound', round0(inb.containersPerDay), round1(inb.blendedPalletsPerContainer), round1(inb.blendedCycleMin), inb.doorsRequired],
    ['Outbound', round0(out.containersPerDay), round1(out.blendedPalletsPerContainer), round1(out.blendedCycleMin), out.doorsRequired],
    [],
    ['Total doors', null, null, null, result.step9.totalDoors],
    [],
    ['Staging — fast cross-dock (m²)', round0(stg.fastCrossDockM2)],
    ['Staging — QC / decant (m²)', round0(stg.qcDecantM2)],
    ['Staging — total (m²)', round0(stg.totalM2)],
    ['Staging — peak pallets (P95)', round0(stg.peakStagingPallets)],
  ];
  return rows;
}

function supportAreaRows(result: PipelineOutputs): Cell[][] {
  const a = result.step10.areas;
  const header: Cell[] = ['Item', 'Area (m²)'];
  const rows: Cell[][] = [
    ['Office', round0(a.office)],
    ['Amenities', round0(a.amenities)],
    ['Training', round0(a.training)],
    ['First aid', round0(a.firstAid)],
    ['Surau (worship)', round0(a.surau)],
    ['Surau ablution', round0(a.ablution)],
    ['Customs hold', round0(a.customs)],
    ['Customs cage', round0(a.customsCage)],
    ['VAS', round0(a.vas)],
    ['Returns', round0(a.returns)],
    ['QC hold', round0(a.qc)],
    ['DG cage', round0(a.dg)],
    ['Pack bench', round0(a.packBench)],
    ['Empty pallet store', round0(a.emptyPallet)],
    ['Waste', round0(a.waste)],
    ['Cold-chain antechamber', round0(a.tempAntechamber)],
    ['Battery / charging', round0(a.battery)],
    ['Lithium kVA buffer', round0(a.lithiumKvaBufferM2)],
    [],
    ['Operational support sub-total', round0(result.step10.operationalSupportM2)],
    ['Office + amenities cluster', round0(result.step10.officeAndAmenitiesM2)],
    ['Total support footprint', round0(result.step10.totalSupportM2)],
    ['Halal uplift factor', round3(result.step10.halalUpliftFactor)],
  ];
  return [header, ...rows];
}

function footprintRollupRows(result: PipelineOutputs): Cell[][] {
  const r = result.step11.rollup;
  const header: Cell[] = ['Item', 'Area (m²)'];
  const rows: Cell[][] = [
    ['Operational (incl. halal uplift)', round0(r.operationalM2)],
    ['Office + amenities', round0(r.officeAndAmenitiesM2)],
    ['Building GFA', round0(r.buildingFootprintGfaM2)],
    ['Canopy', round0(r.canopyAreaM2)],
    ['Canopy counted in coverage', r.canopyCountedInCoverage ? 'yes' : 'no'],
    ['Site coverage (incl. canopy if counted)', round0(r.siteCoverageM2)],
    ['Site area required', round0(r.siteAreaM2)],
    [],
    ['Soft space — phase 2 horizontal', round0(r.softSpace.phase2HorizontalM2)],
    ['Soft space — phase 2 vertical', round0(r.softSpace.phase2VerticalM2)],
    ['Soft space — total', round0(r.softSpace.totalM2)],
    [],
    ['Conventional racked area', round0(r.conventionalRackedM2)],
    ['Automation swap applied', r.automationSwapped ? 'yes' : 'no'],
    ['Automation savings (m²)', round0(r.automationSavingsM2)],
  ];
  return [header, ...rows];
}

function automationRows(result: PipelineOutputs): Cell[][] {
  const a = result.step12;
  if (!a) return [['No automation system selected']];
  return [
    ['Automation Item', 'Value'],
    ['System', a.systemId],
    ['Category', a.category],
    ['Storage items', round0(a.storageItems)],
    ['Automated zone area (m²)', round0(a.replacedZoneArea)],
    ['Replaced footprint delta (m²)', round0(a.replacedFootprintDelta)],
    ['Front-end induction (m²)', round0(a.frontEndAreaM2)],
    ['Front-end depth (m)', round1(a.frontEndDepthM)],
    ['Robots required', a.robotCount],
    ['Ports required', a.portCount],
    ['Throughput capacity (units / hr)', round0(a.throughputCapacityPerHour)],
    ['Required peak (units / hr)', round0(a.requiredPeakPerHour)],
    ['Throughput meets peak', a.meetsThroughput ? 'yes' : 'no'],
    ['Estimated kVA', round0(a.estimatedKva)],
  ];
}

function feasibilityRows(result: PipelineOutputs): Cell[][] {
  const f = result.feasibility;
  const s = result.step11.structural;
  return [
    ['Gate', 'Pass?', 'Detail'],
    ['Clear height (Step 4.5)', verdict(f.clearHeightOk), `required ${round0(result.step4_5.requiredRackHeightMm)} mm vs usable ${round0(result.step4_5.usableRackHeightMm)} mm`],
    ['Seismic mass (Step 4.6)', verdict(f.seismicOk), `${round0(result.step4_6.seismicMassT)} t vs allowable ${round0(result.step4_6.allowableMassT)} t`],
    ['Slab UDL (Step 11)', verdict(f.slabOk), `${round1(s.staticSlabUdlTPerM2)} t/m² vs capacity ${round1(s.slabLoadingTPerM2)} t/m²`],
    ['Envelope fit (Step 11)', verdict(f.envelopeOk), s.overEnvelope ? `over by ${round0(s.envelopeShortfallM2)} m²` : 'within envelope'],
    ['Overall', verdict(f.overall), null],
  ];
}

// ---------------------------------------------------------------------------

function appendSheet(wb: XLSX.WorkBook, name: string, rows: Cell[][]): void {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, name);
}

function verdict(ok: boolean): string {
  return ok ? 'pass' : 'fail';
}

function round0(n: number): number {
  return Math.round(n);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
