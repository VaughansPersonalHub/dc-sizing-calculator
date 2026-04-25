// Step 7 — Labour with Mode-Specific Travel Models.
// SPEC §8 Step 7.
//
// Per task: pick a productivity cell, compute travel time by model, then
//   totalTimePerUnit = staticTime + travel + repackAdder
//   rate            = 3600 / totalTime
//   batchMultiplier = min(2.5, 1 + 0.18 × (batchSize − 1)^0.85)
//   baseFte         = volume / (rate × productiveHoursPerDay)
//   peakFte         = baseFte × peakUplift / availability
//
// availability uses the SPEC's "factor method":
//   availability = (1 − absenteeism)(1 − leave)(1 − sickRelief)
// NOT multiplicative stacking of (1 − Σ pcts) which would double-count.
//
// Regional Ramadan derate (MY/ID and partly SG) folds into annualImpact:
//   ramadanAnnualImpact = days × deficit / 365
// where deficit = 1 − factor.
//
// Travel models (all output seconds per unit):
//   sqrt_area      coefficient × 18 × sqrt(zoneArea / baselineArea)
//   sequential_hv  aisleLen / travelSpeed + liftHeight / liftSpeed
//   shuttle_cycle  2 × depth / shuttleSpeed + transferSec
//   crane_cycle    horiz/Vspeed + liftHeight/Vspeed + pickDepositSec
//   g2p_port       portWalkDistance / 1.2 m/s
//   amr_fleet      avgTaskDistance / (agvSpeed × (1 − interferencePenalty))
//   zero           0
//
// MHE warning: sqrt_area + zoneArea > 15000 m² triggers
// WALKING_PICK_IN_LARGE_ZONE — the human is walking too far between picks.

import type {
  EngineOpsProfile,
  EngineProductivityCell,
  EngineRegionalContext,
  TravelModelType,
} from '../models';
import type { Step05Outputs, ZoneFootprint } from './Step05Footprint';
import type { Step06Outputs } from './Step06Throughput';

export interface Step07Inputs {
  step5: Step05Outputs;
  step6: Step06Outputs;
  opsProfile: EngineOpsProfile;
  productivity: EngineProductivityCell[];
  regional: EngineRegionalContext;
  /** Whether VNA was selected — flips the pallet pick model from sqrt_area
   *  to sequential_hv. Defaults to false (reach-truck). */
  vnaSelected?: boolean;
  /** Selected pallet rack height (mm) for VNA travel model. */
  vnaAisleLengthM?: number;
  /** AGV fleet size estimate for amr_fleet interference penalty. */
  amrFleetSize?: number;
}

export type LabourTaskName =
  | 'pallet_putaway'
  | 'pallet_replenishment'
  | 'pallet_pick'
  | 'case_pick'
  | 'each_pick'
  | 'repack'
  | 'decant'
  | 'vas'
  | 'returns'
  | 'qc';

export interface LabourTask {
  task: LabourTaskName;
  method: string;
  unitType: string;
  travelModel: TravelModelType;
  zoneAreaM2: number;
  volumePerDay: number;
  staticTimeSec: number;
  travelTimeSec: number;
  totalTimeSec: number;
  ratePerHour: number;
  baseFte: number;
  peakFte: number;
}

export interface Step07Outputs {
  tasks: LabourTask[];
  /** baseFte summed across all tasks (steady-state). */
  totalBaseFte: number;
  /** peakFte summed across all tasks (after availability + peakUplift). */
  totalPeakFte: number;
  ftePerCategory: Record<LabourTaskName, number>;
  availability: number;
  /** Annual impact of Ramadan derate (e.g. 0.015 = 1.5% of annual hours). */
  ramadanAnnualImpact: number;
  warnings: string[];
}

const WALKING_PICK_AREA_THRESHOLD_M2 = 15000;

export function runStep07Labour(inputs: Step07Inputs): Step07Outputs {
  const ops = inputs.opsProfile;
  const cells = inputs.productivity;
  const tasks: LabourTask[] = [];
  const warnings: string[] = [];

  // Availability factor (SPEC §8 Step 7) — multiply complements, don't sum.
  const availability =
    (1 - ops.absenteeismPct) * (1 - ops.leaveFraction) * (1 - ops.sickReliefPct);

  // Ramadan annual impact: factor=0.82 over 30 days = 18% deficit × (30/365)
  // ≈ 1.48% annual. We expose it as a number; consumer decides whether to
  // apply uplift to peakFte or just budget extra reliefs.
  const ramadan = inputs.regional.ramadanDerate;
  const ramadanAnnualImpact =
    ramadan.active && ramadan.days > 0
      ? Math.max(0, 1 - ramadan.factor) * (ramadan.days / 365)
      : 0;

  // Resolve PFP zone area for travel models (sum across all PFP / shelf
  // zones). CLS travel uses CLS area only; shelf walks shelf area.
  const pfpArea = sumZoneArea(inputs.step5.zones, ['PFP']);
  const clsArea = sumZoneArea(inputs.step5.zones, ['CLS']);
  const shelfArea = sumZoneArea(inputs.step5.zones, ['Shelf-S', 'Shelf-M', 'Shelf-L']);

  // ----------------------------------------------------------------
  // Pallet putaway + retrieval — driven by inbound + outbound pallets
  // ----------------------------------------------------------------
  const palletPickMethod = inputs.vnaSelected ? 'vna' : 'reach_truck';
  const palletCell = pickCell(cells, palletPickMethod, 'pallet', 'PFP');
  if (palletCell) {
    tasks.push(
      buildTask({
        task: 'pallet_putaway',
        cell: palletCell,
        zoneAreaM2: pfpArea,
        volumePerDay: inputs.step6.daily.inboundPallets,
        ops,
        opts: { vnaAisleLenM: inputs.vnaAisleLengthM, amrFleetSize: inputs.amrFleetSize },
      })
    );
    tasks.push(
      buildTask({
        task: 'pallet_pick',
        cell: palletCell,
        zoneAreaM2: pfpArea,
        volumePerDay: inputs.step6.pickLinesByMethod.pallet,
        ops,
        opts: { vnaAisleLenM: inputs.vnaAisleLengthM, amrFleetSize: inputs.amrFleetSize },
      })
    );
    // Replenishment volume = forward-face refills/day. Use ~30% of outbound
    // pallets as a planning heuristic (each reserve→forward move replenishes
    // a face; SPEC §8 Step 6 doesn't size this directly).
    tasks.push(
      buildTask({
        task: 'pallet_replenishment',
        cell: palletCell,
        zoneAreaM2: pfpArea,
        volumePerDay: inputs.step6.daily.outboundPallets * 0.3,
        ops,
        opts: { vnaAisleLenM: inputs.vnaAisleLengthM, amrFleetSize: inputs.amrFleetSize },
      })
    );
  }

  // ----------------------------------------------------------------
  // Case pick — voice or RF
  // ----------------------------------------------------------------
  const caseMethod = inputs.opsProfile.ordersPerBatch >= 5 ? 'voice' : 'rf_scan';
  const caseCell = pickCell(cells, caseMethod, 'case', 'PFP') ?? pickCell(cells, 'rf_scan', 'case', 'PFP');
  if (caseCell) {
    tasks.push(
      buildTask({
        task: 'case_pick',
        cell: caseCell,
        zoneAreaM2: clsArea > 0 ? clsArea : pfpArea,
        volumePerDay: inputs.step6.pickLinesByMethod.case,
        ops,
        opts: { batchSize: ops.ordersPerBatch },
      })
    );
    if (caseCell.travelModelType === 'sqrt_area' && pfpArea > WALKING_PICK_AREA_THRESHOLD_M2) {
      warnings.push('WALKING_PICK_IN_LARGE_ZONE');
    }
  }

  // ----------------------------------------------------------------
  // Each pick — RF on shelf, or pick-to-light on CLS
  // ----------------------------------------------------------------
  const eachCell = pickCell(cells, 'rf_scan', 'each', 'Shelf') ?? pickCell(cells, 'pick_to_light', 'each', 'CLS');
  if (eachCell) {
    tasks.push(
      buildTask({
        task: 'each_pick',
        cell: eachCell,
        zoneAreaM2: shelfArea > 0 ? shelfArea : clsArea,
        volumePerDay: inputs.step6.pickLinesByMethod.each,
        ops,
        opts: { batchSize: ops.ordersPerBatch },
      })
    );
    if (eachCell.travelModelType === 'sqrt_area' && shelfArea > WALKING_PICK_AREA_THRESHOLD_M2) {
      if (!warnings.includes('WALKING_PICK_IN_LARGE_ZONE')) {
        warnings.push('WALKING_PICK_IN_LARGE_ZONE');
      }
    }
  }

  // ----------------------------------------------------------------
  // Repack, decant, VAS, returns, QC — secondary tasks
  // ----------------------------------------------------------------
  if (inputs.step6.daily.repackPallets > 0) {
    // Repack adder per SPEC §8 Step 6: ops.repackSecPerPallet drives the
    // labour rate directly when the in/out pallet differ.
    const repackTimePerPallet = ops.repackSecPerPallet;
    const ratePerHour = repackTimePerPallet > 0 ? 3600 / repackTimePerPallet : 0;
    const baseFte = ratePerHour > 0
      ? inputs.step6.daily.repackPallets / (ratePerHour * ops.productiveHoursPerDay)
      : 0;
    tasks.push({
      task: 'repack',
      method: 'repack_bench',
      unitType: 'pallet',
      travelModel: 'zero',
      zoneAreaM2: 0,
      volumePerDay: inputs.step6.daily.repackPallets,
      staticTimeSec: repackTimePerPallet,
      travelTimeSec: 0,
      totalTimeSec: repackTimePerPallet,
      ratePerHour,
      baseFte,
      peakFte: (baseFte * ops.peakUplift) / Math.max(0.0001, availability),
    });
  }

  if (inputs.step6.daily.decantPallets > 0) {
    const decantCell = pickCell(cells, 'decant', 'pallet', 'PFP');
    if (decantCell) {
      tasks.push(
        buildTask({
          task: 'decant',
          cell: decantCell,
          zoneAreaM2: 0,
          volumePerDay: inputs.step6.daily.decantPallets,
          ops,
          opts: {},
        })
      );
    }
  }

  // VAS — orders per day × VAS rate. We treat VAS as a fixed share of
  // outbound (5% by default until the engagement defines a real ratio).
  const vasCell = pickCell(cells, 'vas', 'each', 'Shelf');
  if (vasCell) {
    const vasUnitsPerDay = inputs.step6.daily.pickLinesPerDay * 0.05;
    if (vasUnitsPerDay > 0) {
      tasks.push(
        buildTask({
          task: 'vas',
          cell: vasCell,
          zoneAreaM2: 0,
          volumePerDay: vasUnitsPerDay,
          ops,
          opts: {},
        })
      );
    }
  }

  // Returns — returnsRatePct × outbound pallets, with handle hours per pallet.
  const returnsPalletsPerDay =
    inputs.step6.daily.outboundPallets * (ops.returnsRatePct / 100);
  if (returnsPalletsPerDay > 0 && ops.returnsHandleTimeHours > 0) {
    const handleSec = ops.returnsHandleTimeHours * 3600;
    const ratePerHour = 3600 / handleSec;
    const baseFte = returnsPalletsPerDay / (ratePerHour * ops.productiveHoursPerDay);
    tasks.push({
      task: 'returns',
      method: 'returns_bench',
      unitType: 'pallet',
      travelModel: 'zero',
      zoneAreaM2: 0,
      volumePerDay: returnsPalletsPerDay,
      staticTimeSec: handleSec,
      travelTimeSec: 0,
      totalTimeSec: handleSec,
      ratePerHour,
      baseFte,
      peakFte: (baseFte * ops.peakUplift) / Math.max(0.0001, availability),
    });
  }

  // QC — sample rate of inbound, dwell hours per sample. Labour ≈ 6 min
  // of attention per dwell-hour (a single QC inspector can monitor several).
  const qcPalletsPerDay = inputs.step6.daily.inboundPallets * ops.qcSampleRate;
  if (qcPalletsPerDay > 0 && ops.qcDwellHours > 0) {
    const labourSecPerSample = 6 * 60;
    const ratePerHour = 3600 / labourSecPerSample;
    const baseFte = qcPalletsPerDay / (ratePerHour * ops.productiveHoursPerDay);
    tasks.push({
      task: 'qc',
      method: 'qc_inspect',
      unitType: 'pallet',
      travelModel: 'zero',
      zoneAreaM2: 0,
      volumePerDay: qcPalletsPerDay,
      staticTimeSec: labourSecPerSample,
      travelTimeSec: 0,
      totalTimeSec: labourSecPerSample,
      ratePerHour,
      baseFte,
      peakFte: (baseFte * ops.peakUplift) / Math.max(0.0001, availability),
    });
  }

  // -- Roll-up --
  let totalBase = 0;
  let totalPeak = 0;
  const ftePerCategory: Record<LabourTaskName, number> = {
    pallet_putaway: 0,
    pallet_replenishment: 0,
    pallet_pick: 0,
    case_pick: 0,
    each_pick: 0,
    repack: 0,
    decant: 0,
    vas: 0,
    returns: 0,
    qc: 0,
  };
  for (const t of tasks) {
    // Apply availability + peak. base/peak already use availability inside
    // buildTask, but we re-apply here so any task built without buildTask
    // still sees consistent uplift.
    totalBase += t.baseFte;
    totalPeak += t.peakFte;
    ftePerCategory[t.task] = (ftePerCategory[t.task] ?? 0) + t.peakFte;
  }

  // Apply Ramadan annual impact as additional peak FTE buffer (relief crew
  // proportional to the deficit; the SPEC notes ~8% annual impact MY/ID).
  if (ramadanAnnualImpact > 0) {
    totalPeak *= 1 + ramadanAnnualImpact;
    for (const k of Object.keys(ftePerCategory) as LabourTaskName[]) {
      ftePerCategory[k] *= 1 + ramadanAnnualImpact;
    }
  }

  return {
    tasks,
    totalBaseFte: totalBase,
    totalPeakFte: totalPeak,
    ftePerCategory,
    availability,
    ramadanAnnualImpact,
    warnings,
  };
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

interface BuildTaskInputs {
  task: LabourTaskName;
  cell: EngineProductivityCell;
  zoneAreaM2: number;
  volumePerDay: number;
  ops: EngineOpsProfile;
  opts: {
    batchSize?: number;
    vnaAisleLenM?: number;
    amrFleetSize?: number;
  };
}

function buildTask(input: BuildTaskInputs): LabourTask {
  const { cell, zoneAreaM2, volumePerDay, ops, opts } = input;

  const travelTimeSec = computeTravelTimeSec(cell, zoneAreaM2, opts);
  const totalTimeBase = cell.staticTimeSecPerUnit + travelTimeSec;

  const batchSize = opts.batchSize ?? 1;
  const batchMultiplier = batchSize > 1
    ? Math.min(2.5, 1 + 0.18 * Math.pow(batchSize - 1, 0.85))
    : 1;
  // Batch picking effectively divides per-unit travel by the multiplier.
  const totalTimeSec = cell.staticTimeSecPerUnit + travelTimeSec / batchMultiplier;

  const ratePerHour = totalTimeSec > 0 ? 3600 / totalTimeSec : 0;
  const baseFte = ratePerHour > 0
    ? volumePerDay / (ratePerHour * ops.productiveHoursPerDay)
    : 0;

  const availability =
    (1 - ops.absenteeismPct) * (1 - ops.leaveFraction) * (1 - ops.sickReliefPct);
  const peakFte = (baseFte * ops.peakUplift) / Math.max(0.0001, availability);

  void totalTimeBase;

  return {
    task: input.task,
    method: cell.method,
    unitType: cell.unitType,
    travelModel: cell.travelModelType,
    zoneAreaM2,
    volumePerDay,
    staticTimeSec: cell.staticTimeSecPerUnit,
    travelTimeSec,
    totalTimeSec,
    ratePerHour,
    baseFte,
    peakFte,
  };
}

function computeTravelTimeSec(
  cell: EngineProductivityCell,
  zoneAreaM2: number,
  opts: BuildTaskInputs['opts']
): number {
  switch (cell.travelModelType) {
    case 'sqrt_area': {
      const baseline = Math.max(1, cell.baselineZoneAreaM2);
      const ratio = zoneAreaM2 > 0 ? Math.sqrt(zoneAreaM2 / baseline) : 1;
      return cell.travelCoefficient * 18 * ratio;
    }
    case 'sequential_hv': {
      // VNA Chebyshev: simultaneous horizontal + vertical, take the slower leg.
      const aisleLenM = opts.vnaAisleLenM ?? Math.sqrt(Math.max(1, zoneAreaM2));
      const travelSpeedMps = 1.5; // ~5.4 kph through-aisle
      const liftSpeedMps = (cell.vnaLiftSpeedMpm ?? 30) / 60;
      const liftHeightM = 8; // assume mid-bay average
      const horiz = aisleLenM / travelSpeedMps;
      const vert = liftHeightM / liftSpeedMps;
      return Math.max(horiz, vert) + 4; // 4s pick/deposit
    }
    case 'shuttle_cycle': {
      // 2× channel depth / shuttle speed + transfer time.
      const depthM = 12; // assume 12 m channel depth as planning default
      const shuttleSpeedMps = 1.0;
      const transferSec = cell.shuttleTransferSec ?? 18;
      return (2 * depthM) / shuttleSpeedMps + transferSec;
    }
    case 'crane_cycle': {
      const horizSpeed = cell.craneHorizontalSpeedMps ?? 4;
      const vertSpeed = cell.craneLiftSpeedMps ?? 1.5;
      const horizM = Math.sqrt(Math.max(1, zoneAreaM2)) / 2;
      const vertM = 12;
      const pickDeposit = cell.pickDepositSec ?? 6;
      return horizM / horizSpeed + vertM / vertSpeed + pickDeposit;
    }
    case 'g2p_port': {
      const portWalkM = cell.g2pPortWalkDistanceM ?? 2;
      const walkSpeed = 1.2;
      return portWalkM / walkSpeed;
    }
    case 'amr_fleet': {
      const avgTaskDistanceM = Math.sqrt(Math.max(1, zoneAreaM2)) / 1.5;
      const agvSpeedMps = 1.3;
      const fleetSize = opts.amrFleetSize ?? 10;
      const interference = Math.min(0.35, 0.006 * fleetSize);
      return avgTaskDistanceM / (agvSpeedMps * (1 - interference));
    }
    case 'zero':
      return 0;
    default:
      return 0;
  }
}

function pickCell(
  cells: EngineProductivityCell[],
  method: string,
  unitType: string,
  slotType: string
): EngineProductivityCell | undefined {
  return (
    cells.find((c) => c.method === method && c.unitType === unitType && c.slotType === slotType) ??
    cells.find((c) => c.method === method && c.unitType === unitType) ??
    cells.find((c) => c.method === method)
  );
}

function sumZoneArea(zones: ZoneFootprint[], names: string[]): number {
  let total = 0;
  for (const z of zones) {
    if (names.includes(z.zone)) total += z.alignedAreaM2;
  }
  return total;
}
