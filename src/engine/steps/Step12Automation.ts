// Step 12 — Automation Override (Density-Based).
// SPEC §8 Step 12.
//
// Each automation system replaces some portion of conventional storage with
// a denser configuration plus its own throughput capacity. The Step
// produces an *alternative* footprint and throughput envelope; downstream
// steps decide whether to use it. (Phase 6 wires this into Step 11 rollup
// when AutomationConfig is present on the engagement scenario.)
//
// Densities + throughput come from the library, with engagement-level
// overrides via AutomationConfig:
//   AutoStore       9 × stackHeight × 0.85 bins/m², 500 cycles/hr/robot
//   Exotec Skypod   150 compartments/m², 25/hr/robot
//   Geek+ P-series  140 compartments/m², 20/hr/robot
//   HAI HaiPick     180 cases/m², 300/hr/robot
//   Quicktron       120 cases/m², 250/hr/robot
//   Pallet shuttle  15-25 / 30-45 pal/m² (single / mother-child), 50 / 40 cycles/hr/aisle
//   Mini-load ASRS  60-80 totes/m², 100 cycles/hr/aisle
//   Pallet AGV      40 trips/hr/AGV
//   Libiao sorter   15,000 parcels/hr
//
// Output:
//   replacedZoneArea         (m² — automated zone footprint)
//   robotCount               (sized to throughput target unless overridden)
//   portCount                (G2P only, sized to lines/hour)
//   throughputCapacityPerHour (max system throughput)
//   meetsThroughput          (true when capacity ≥ required peak)
//   frontEndDepthM           (depot strip in front of the system)
//   replacedFootprintDelta   (saving vs the conventional zone — could be negative)

import type { EngineAutomationSystem, EngineAutomationConfig } from '../models';
import type { Step03Outputs } from './Step03SlotSizing';
import type { Step05Outputs } from './Step05Footprint';
import type { Step06Outputs } from './Step06Throughput';

export interface Step12Inputs {
  config: EngineAutomationConfig;
  library: EngineAutomationSystem[];
  step3: Step03Outputs;
  step5: Step05Outputs;
  step6: Step06Outputs;
}

export interface Step12Outputs {
  systemId: string;
  category: EngineAutomationSystem['category'];
  storageItems: number;
  /** The automated storage zone area (m²). */
  replacedZoneArea: number;
  /** Conventional area we're displacing (= the original step5 storage zones).
   *  Positive value = automation saves area; negative = automation costs area. */
  replacedFootprintDelta: number;
  /** Robot / shuttle / AGV count sized to throughput target. */
  robotCount: number;
  /** Port count for G2P systems; 0 for non-port systems. */
  portCount: number;
  /** System throughput capacity (units/hr). */
  throughputCapacityPerHour: number;
  /** Required peak throughput (units/hr) — pick lines for G2P, pallets/hr for shuttle. */
  requiredPeakPerHour: number;
  meetsThroughput: boolean;
  /** Front-end induction + port-area depth (m). */
  frontEndDepthM: number;
  /** Front-end area (m²) — depth × √(replacedZoneArea) as a planning proxy.
   *  Step 11 adds this to the automated zone when computing GFA. */
  frontEndAreaM2: number;
  /** kVA budget for the system (rough planning number). */
  estimatedKva: number;
  warnings: string[];
}

const FRONT_END_DEPTH_DEFAULTS: Record<EngineAutomationSystem['category'], number> = {
  g2p_cubic: 8,
  g2p_shelf: 6,
  acr_case: 6,
  case_picking: 6,
  pallet_shuttle: 5,
  mini_load_asrs: 8,
  pallet_agv: 4,
  sortation: 12,
};

const KVA_PER_ROBOT: Record<EngineAutomationSystem['category'], number> = {
  g2p_cubic: 0.6,
  g2p_shelf: 0.8,
  acr_case: 1.0,
  case_picking: 0.8,
  pallet_shuttle: 1.5,
  mini_load_asrs: 5.0,
  pallet_agv: 1.2,
  sortation: 50, // sorter is one big system — fixed kVA
};

export function runStep12Automation(inputs: Step12Inputs): Step12Outputs {
  const sys = inputs.library.find((s) => s.system_id === inputs.config.system_id);
  if (!sys) {
    throw new Error(`Step 12: automation system '${inputs.config.system_id}' not in library`);
  }

  const cfg = inputs.config;
  const warnings: string[] = [];
  const peakPickLinesPerHour = inputs.step6.peak.pickLinesPerDay /
    Math.max(1, 18); // assume 18-hr productive day
  const peakInboundPerHour = inputs.step6.peak.inboundPallets / Math.max(1, 18);

  // ---------------------------------------------------------
  // Density and storage items
  // ---------------------------------------------------------
  const storageItems = computeStorageItems(sys, cfg, inputs.step3);

  // Cells / containers per m² — multiplied by stack height for AutoStore.
  let cellsPerM2 = cfg.cellsPerM2 ?? sys.densityValue;
  if (sys.category === 'g2p_cubic') {
    const stackH = cfg.stackHeight ?? 12;
    // SPEC: density = 9 × stackHeight × 0.85
    cellsPerM2 = (cfg.cellsPerM2 ?? 9) * stackH * 0.85;
  }

  const replacedZoneArea = cellsPerM2 > 0 ? storageItems / cellsPerM2 : 0;

  // ---------------------------------------------------------
  // Robot / shuttle count + throughput capacity
  // ---------------------------------------------------------
  let robotCount = 0;
  let throughputCapacity = 0;
  let portCount = 0;
  let requiredPeakPerHour = 0;

  if (sys.category === 'g2p_cubic' || sys.category === 'g2p_shelf' || sys.category === 'acr_case' || sys.category === 'case_picking') {
    requiredPeakPerHour = peakPickLinesPerHour;
    const throughputPerRobot = sys.throughputPerRobotPerHour ?? 0;
    if (cfg.sizeToThroughputTarget && throughputPerRobot > 0) {
      robotCount = Math.ceil(requiredPeakPerHour / throughputPerRobot);
    }
    if (cfg.robotsManual !== undefined) robotCount = cfg.robotsManual;
    throughputCapacity = robotCount * throughputPerRobot;

    // G2P ports (only for cubic / shelf G2P, not ACR/case picking)
    if (sys.category === 'g2p_cubic' || sys.category === 'g2p_shelf') {
      const linesPerPortPerHour = 600;
      portCount = cfg.portsManual ?? Math.ceil(requiredPeakPerHour / linesPerPortPerHour);
    }
  } else if (sys.category === 'pallet_shuttle') {
    requiredPeakPerHour = peakInboundPerHour + inputs.step6.peak.outboundPallets / 18;
    const perAisle = sys.throughputPerAislePerHour ?? 50;
    const aislesNeeded = Math.ceil(requiredPeakPerHour / perAisle);
    const shuttlesPerAisle = cfg.shuttlesPerAisle ?? (cfg.motherChildMode ? 2 : 1);
    robotCount = aislesNeeded * shuttlesPerAisle;
    if (cfg.robotsManual !== undefined) robotCount = cfg.robotsManual;
    throughputCapacity = aislesNeeded * perAisle;
  } else if (sys.category === 'mini_load_asrs') {
    requiredPeakPerHour = peakPickLinesPerHour;
    const perAisle = sys.throughputPerAislePerHour ?? 100;
    const aislesNeeded = Math.ceil(requiredPeakPerHour / perAisle);
    robotCount = aislesNeeded; // one crane per aisle
    if (cfg.robotsManual !== undefined) robotCount = cfg.robotsManual;
    throughputCapacity = aislesNeeded * perAisle;
  } else if (sys.category === 'pallet_agv') {
    requiredPeakPerHour = peakInboundPerHour + inputs.step6.peak.outboundPallets / 18;
    const tripsPerAgv = sys.densityValue; // trips/hr/AGV
    if (cfg.sizeToThroughputTarget && tripsPerAgv > 0) {
      robotCount = Math.ceil(requiredPeakPerHour / tripsPerAgv);
    }
    if (cfg.robotsManual !== undefined) robotCount = cfg.robotsManual;
    throughputCapacity = robotCount * tripsPerAgv;
  } else if (sys.category === 'sortation') {
    requiredPeakPerHour = peakPickLinesPerHour;
    throughputCapacity = sys.throughputPerHour ?? 15000;
    robotCount = 1;
  }

  if (throughputCapacity < requiredPeakPerHour && requiredPeakPerHour > 0) {
    warnings.push('AUTOMATION_THROUGHPUT_BELOW_PEAK');
  }

  // ---------------------------------------------------------
  // Footprint delta vs. conventional storage
  // ---------------------------------------------------------
  // Compare against the matching conventional zone area. AutoStore + ASRS
  // replace shelf + small CLS; pallet shuttle replaces PFP; sorter doesn't
  // replace storage at all.
  const conventionalArea = sumReplacedConventional(sys.category, inputs.step5);
  const replacedFootprintDelta = conventionalArea - replacedZoneArea;

  const frontEndDepthM = cfg.frontEndDepthM ?? FRONT_END_DEPTH_DEFAULTS[sys.category];
  const frontEndAreaM2 = frontEndDepthM * Math.sqrt(Math.max(0, replacedZoneArea));
  const estimatedKva = robotCount * KVA_PER_ROBOT[sys.category];

  if (cfg.packingEfficiency < 0.5 || cfg.packingEfficiency > 1) {
    warnings.push('AUTOMATION_PACKING_EFFICIENCY_OUT_OF_RANGE');
  }

  return {
    systemId: sys.system_id,
    category: sys.category,
    storageItems,
    replacedZoneArea,
    replacedFootprintDelta,
    robotCount,
    portCount,
    throughputCapacityPerHour: throughputCapacity,
    requiredPeakPerHour,
    meetsThroughput: throughputCapacity >= requiredPeakPerHour,
    frontEndDepthM,
    frontEndAreaM2,
    estimatedKva,
    warnings,
  };
}

function computeStorageItems(
  sys: EngineAutomationSystem,
  cfg: EngineAutomationConfig,
  step3: Step03Outputs
): number {
  // What "items" mean depends on the system:
  //   G2P cubic       → bins (each storing N SKUs)
  //   G2P shelf / ACR → compartments (~1 SKU each)
  //   Pallet shuttle  → pallets (PFP positions)
  //   Mini-load       → totes
  //   Pallet AGV      → pallets
  //   Sorter          → 0 (no storage)
  switch (sys.category) {
    case 'g2p_cubic': {
      // Bins ≈ shelf positions / 6 (typical bin holds ~6 SKUs at modest velocity)
      const shelfTotal =
        step3.totals.shelfPositionsSmall + step3.totals.shelfPositionsMedium + step3.totals.shelfPositionsLarge;
      return Math.ceil(shelfTotal / 6) / cfg.packingEfficiency;
    }
    case 'g2p_shelf':
    case 'acr_case':
    case 'case_picking':
      return (
        (step3.totals.shelfPositionsSmall +
          step3.totals.shelfPositionsMedium +
          step3.totals.shelfPositionsLarge +
          step3.totals.clsLanes) /
        cfg.packingEfficiency
      );
    case 'pallet_shuttle':
    case 'pallet_agv':
      return step3.totals.pfpPositions / cfg.packingEfficiency;
    case 'mini_load_asrs':
      return (step3.totals.shelfPositionsSmall + step3.totals.shelfPositionsMedium) / cfg.packingEfficiency;
    case 'sortation':
      return 0;
    default:
      return 0;
  }
}

function sumReplacedConventional(
  category: EngineAutomationSystem['category'],
  step5: Step05Outputs
): number {
  let area = 0;
  for (const z of step5.zones) {
    if (
      (category === 'g2p_cubic' || category === 'g2p_shelf' || category === 'acr_case' || category === 'mini_load_asrs') &&
      z.zone.startsWith('Shelf')
    ) {
      area += z.alignedAreaM2;
    }
    if (category === 'pallet_shuttle' || category === 'pallet_agv') {
      if (z.zone === 'PFP') area += z.alignedAreaM2;
    }
    if (category === 'case_picking' && z.zone === 'CLS') {
      area += z.alignedAreaM2;
    }
  }
  return area;
}
