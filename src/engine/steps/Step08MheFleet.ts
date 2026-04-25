// Step 8 — MHE Fleet.
// SPEC §8 Step 8.
//
// Per MHE class:
//   totalTaskHours = sum of (task.volume / task.rate) across tasks routed
//                    to this class
//   availableHoursPerUnit:
//     • AMR / lithium_opportunity        22 × 7 × 50  ≈ 7700 hr/yr
//     • Lithium opportunity (forklift)   productiveHours × operatingDays
//     • Lead-acid swap                   (shiftHours − 15min×shiftsPerDay) × ops days
//   fleetCount = ceil(totalTaskHours / (availableHoursPerUnit × utilisationTarget))
//
// Routing rules (default; engagement may override):
//   pallet_putaway / pallet_pick / pallet_replenishment → reach truck
//                                                          (or VNA if vnaSelected)
//   case_pick                                            → llop
//   each_pick                                            → llop (or none for shelf)
//   decant                                               → walkie pallet
//   repack / vas / returns / qc                          → none (bench work)

import type { EngineMheClass, EngineOpsProfile } from '../models';
import type { LabourTask, LabourTaskName } from './Step07Labour';

export interface Step08Inputs {
  step7Tasks: LabourTask[];
  mheLibrary: EngineMheClass[];
  opsProfile: EngineOpsProfile;
  vnaSelected?: boolean;
}

export interface MheFleet {
  mhe_id: string;
  category: string;
  batteryType: EngineMheClass['battery']['type'];
  totalTaskHoursPerYear: number;
  availableHoursPerUnit: number;
  utilisationTarget: number;
  fleetCount: number;
  chargingFootprintM2: number;
  chargingKvaTotal: number;
}

export interface Step08Outputs {
  fleets: MheFleet[];
  totalUnits: number;
  totalChargingFootprintM2: number;
  totalChargingKva: number;
  /** Map of which MHE class served which labour task — useful for the UI. */
  taskRouting: Record<LabourTaskName, string | null>;
}

const DEFAULT_ROUTING: Record<LabourTaskName, string | null> = {
  pallet_putaway: 'reach_truck_single',
  pallet_pick: 'reach_truck_single',
  pallet_replenishment: 'reach_truck_single',
  case_pick: 'llop',
  each_pick: 'llop',
  decant: 'walkie_pallet',
  repack: null,
  vas: null,
  returns: null,
  qc: null,
};

const VNA_ROUTING: Partial<Record<LabourTaskName, string>> = {
  pallet_putaway: 'vna_turret',
  pallet_pick: 'vna_turret',
  pallet_replenishment: 'vna_turret',
};

export function runStep08MheFleet(inputs: Step08Inputs): Step08Outputs {
  const ops = inputs.opsProfile;
  const mheById = new Map(inputs.mheLibrary.map((m) => [m.mhe_id, m]));

  const taskRouting: Record<LabourTaskName, string | null> = { ...DEFAULT_ROUTING };
  if (inputs.vnaSelected) {
    for (const k of Object.keys(VNA_ROUTING) as LabourTaskName[]) {
      taskRouting[k] = VNA_ROUTING[k] ?? taskRouting[k];
    }
  }

  // Aggregate annual task hours per MHE class.
  const hoursByClass = new Map<string, number>();
  for (const task of inputs.step7Tasks) {
    const mheId = taskRouting[task.task];
    if (!mheId) continue;
    if (task.ratePerHour <= 0) continue;
    const dailyHours = task.volumePerDay / task.ratePerHour;
    const annualHours = dailyHours * ops.operatingDaysPerYear;
    hoursByClass.set(mheId, (hoursByClass.get(mheId) ?? 0) + annualHours);
  }

  const fleets: MheFleet[] = [];
  for (const [mheId, taskHours] of hoursByClass) {
    const cls = mheById.get(mheId);
    if (!cls) continue;
    const available = availableHoursPerUnit(cls, ops);
    const target = cls.utilisationTargetDefault;
    const fleetCount = available > 0 ? Math.ceil(taskHours / (available * target)) : 0;

    fleets.push({
      mhe_id: cls.mhe_id,
      category: cls.category,
      batteryType: cls.battery.type,
      totalTaskHoursPerYear: taskHours,
      availableHoursPerUnit: available,
      utilisationTarget: target,
      fleetCount,
      chargingFootprintM2: fleetCount * cls.battery.chargingFootprintM2PerUnit,
      chargingKvaTotal: fleetCount * cls.battery.chargingKva,
    });
  }

  let totalUnits = 0;
  let totalCharge = 0;
  let totalKva = 0;
  for (const f of fleets) {
    totalUnits += f.fleetCount;
    totalCharge += f.chargingFootprintM2;
    totalKva += f.chargingKvaTotal;
  }

  return {
    fleets,
    totalUnits,
    totalChargingFootprintM2: totalCharge,
    totalChargingKva: totalKva,
    taskRouting,
  };
}

function availableHoursPerUnit(cls: EngineMheClass, ops: EngineOpsProfile): number {
  switch (cls.battery.type) {
    case 'lithium_opportunity': {
      // AMRs / AGVs run 22h × 7d × 50wk on opportunity charging.
      if (cls.category === 'amr_agv') return 22 * 7 * 50;
      // Conventional lithium forklift: productive hours × operating days.
      return ops.productiveHoursPerDay * ops.operatingDaysPerYear;
    }
    case 'lead_acid_swap': {
      // Productive hours minus 15min swap × shifts/day. Lead-acid can't
      // opportunity-charge during breaks the way lithium can, so the truck
      // loses one 15-minute swap window per shift on top of break time.
      const swapPenaltyHours = (15 / 60) * ops.shiftsPerDay;
      const productivePerDay = Math.max(0, ops.productiveHoursPerDay - swapPenaltyHours);
      return productivePerDay * ops.operatingDaysPerYear;
    }
    case 'fuel_cell':
      // Fuel cells refuel in 3 minutes, near-continuous availability.
      return ops.productiveHoursPerDay * ops.operatingDaysPerYear * 1.05;
    case 'none':
    default:
      return ops.productiveHoursPerDay * ops.operatingDaysPerYear;
  }
}
