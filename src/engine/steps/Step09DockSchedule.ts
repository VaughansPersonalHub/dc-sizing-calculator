// Step 9 — Dock Schedule.
// SPEC §8 Step 9.
//
// Door cycle times (minutes per container):
//   40HC palletised        25
//   40HC floor-loaded      60
//   20ft palletised        18
//   20ft floor-loaded      45
//   curtain-sider          30
//   cross-dock pallet      12
//   van                     8
//
// Staging is bimodal:
//   fast cross-dock        0.5 h dwell
//   QC / decant            4   h dwell
//
// Doors required = ceil(blendedCycleMin × containersPerDay
//                       / (operatingHoursPerDay × 60 × percentileDocks))
//
// Default container mix is balanced ASEAN / NEA assumption; the engagement
// or scenario can override via opsProfile.

import type { EngineOpsProfile, EngineBuildingEnvelope } from '../models';
import type { Step06Outputs } from './Step06Throughput';

export interface ContainerCycleMin {
  forty_hc_pal: number;
  forty_hc_floor: number;
  twenty_pal: number;
  twenty_floor: number;
  curtain_sider: number;
  cross_dock_pal: number;
  van: number;
}

export interface ContainerCapacityPallets {
  forty_hc_pal: number;
  forty_hc_floor: number;
  twenty_pal: number;
  twenty_floor: number;
  curtain_sider: number;
  cross_dock_pal: number;
  van: number;
}

export interface ContainerMix {
  forty_hc_pal: number;
  forty_hc_floor: number;
  twenty_pal: number;
  twenty_floor: number;
  curtain_sider: number;
  cross_dock_pal: number;
  van: number;
}

export interface Step09Inputs {
  step6: Step06Outputs;
  opsProfile: EngineOpsProfile;
  envelope: EngineBuildingEnvelope;
  /** Inbound mix override; sums to 1.0. */
  inboundMix?: ContainerMix;
  /** Outbound mix override (van-heavy DTC, palletised retail, etc.). */
  outboundMix?: ContainerMix;
  /** Cross-dock share of throughput (defaults to 0). */
  crossDockPct?: number;
  /** QC sample share that occupies the slow staging lane (default 0.10). */
  qcStagingShare?: number;
  /** Pallet footprint m² (incl. clearance), defaults to opsProfile.palletFootprintM2 × 1.5. */
  stagingFootprintPerPalletM2?: number;
}

export interface DoorBudget {
  /** Containers per day across all types. */
  containersPerDay: number;
  /** Pallets per container, weighted by mix. */
  blendedPalletsPerContainer: number;
  /** Cycle minutes weighted by mix. */
  blendedCycleMin: number;
  /** Doors required at the configured percentile. */
  doorsRequired: number;
}

export interface Step09Outputs {
  inbound: DoorBudget;
  outbound: DoorBudget;
  totalDoors: number;
  staging: {
    fastCrossDockM2: number;
    qcDecantM2: number;
    totalM2: number;
    /** P95-equivalent pallets present in staging at peak hour. */
    peakStagingPallets: number;
  };
  inboundMix: ContainerMix;
  outboundMix: ContainerMix;
  warnings: string[];
}

const CYCLE_MIN: ContainerCycleMin = {
  forty_hc_pal: 25,
  forty_hc_floor: 60,
  twenty_pal: 18,
  twenty_floor: 45,
  curtain_sider: 30,
  cross_dock_pal: 12,
  van: 8,
};

const CAPACITY_PALLETS: ContainerCapacityPallets = {
  // pallet equivalents per container — floor-loaded converted via 0.88 yield
  forty_hc_pal: 24,
  forty_hc_floor: 26, // ~30 floor → 26 pallet-equiv at 0.88 yield
  twenty_pal: 12,
  twenty_floor: 13,
  curtain_sider: 24,
  cross_dock_pal: 24,
  van: 4,
};

const DEFAULT_INBOUND_MIX: ContainerMix = {
  forty_hc_pal: 0.40,
  forty_hc_floor: 0.05,
  twenty_pal: 0.15,
  twenty_floor: 0.05,
  curtain_sider: 0.15,
  cross_dock_pal: 0.10,
  van: 0.10,
};

const DEFAULT_OUTBOUND_MIX: ContainerMix = {
  forty_hc_pal: 0.20,
  forty_hc_floor: 0.0,
  twenty_pal: 0.10,
  twenty_floor: 0.0,
  curtain_sider: 0.30,
  cross_dock_pal: 0.10,
  van: 0.30,
};

export function runStep09DockSchedule(inputs: Step09Inputs): Step09Outputs {
  const ops = inputs.opsProfile;
  const inboundMix = inputs.inboundMix ?? DEFAULT_INBOUND_MIX;
  const outboundMix = inputs.outboundMix ?? DEFAULT_OUTBOUND_MIX;
  const crossDockPct = Math.max(0, Math.min(1, inputs.crossDockPct ?? 0));
  const qcShare = inputs.qcStagingShare ?? Math.min(0.5, ops.qcSampleRate * 4);

  // Peak rather than daily for door sizing — SPEC says percentileDocks=0.95.
  const peakInboundPal = Math.max(
    inputs.step6.daily.inboundPallets,
    inputs.step6.peak.inboundPallets * ops.percentileDocks
  );
  const peakOutboundPal = Math.max(
    inputs.step6.daily.outboundPallets,
    inputs.step6.peak.outboundPallets * ops.percentileDocks
  );

  const operatingMinPerDay = ops.productiveHoursPerDay * 60;

  const inbound = sizeBudget(peakInboundPal, inboundMix, operatingMinPerDay);
  const outbound = sizeBudget(peakOutboundPal, outboundMix, operatingMinPerDay);

  // Staging area (m²): peak pallets in dwell × footprint per pallet.
  const stagingPalletFootprint =
    inputs.stagingFootprintPerPalletM2 ?? ops.palletFootprintM2 * 1.5;

  const fastCrossDockPallets =
    inputs.step6.daily.outboundPallets * crossDockPct * (0.5 / 24);
  const qcDecantPallets =
    inputs.step6.daily.inboundPallets * qcShare * (4 / 24) +
    inputs.step6.daily.decantPallets * (4 / 24);

  const fastM2 = fastCrossDockPallets * stagingPalletFootprint;
  const qcM2 = qcDecantPallets * stagingPalletFootprint;
  const peakStagingPallets =
    (fastCrossDockPallets + qcDecantPallets) * ops.peakUplift;

  const warnings: string[] = [];
  if (inbound.doorsRequired === 0 && peakInboundPal > 0) {
    warnings.push('INBOUND_DOORS_ZERO_DESPITE_VOLUME');
  }
  if (outbound.doorsRequired === 0 && peakOutboundPal > 0) {
    warnings.push('OUTBOUND_DOORS_ZERO_DESPITE_VOLUME');
  }
  // Sanity: existing doors in envelope vs. required
  // (envelope dock counts come via building seed; we don't enforce here, but
  // do warn when the implied total exceeds 80 — typical big-box DC ceiling).
  if (inbound.doorsRequired + outbound.doorsRequired > 80) {
    warnings.push('DOORS_EXCEED_TYPICAL_FACILITY_LIMIT');
  }

  void inputs.envelope;

  return {
    inbound,
    outbound,
    totalDoors: inbound.doorsRequired + outbound.doorsRequired,
    staging: {
      fastCrossDockM2: fastM2,
      qcDecantM2: qcM2,
      totalM2: fastM2 + qcM2,
      peakStagingPallets,
    },
    inboundMix,
    outboundMix,
    warnings,
  };
}

function sizeBudget(
  palletsPerDay: number,
  mix: ContainerMix,
  operatingMinPerDay: number
): DoorBudget {
  let blendedPallets = 0;
  let blendedCycle = 0;
  for (const k of Object.keys(mix) as (keyof ContainerMix)[]) {
    blendedPallets += mix[k] * CAPACITY_PALLETS[k];
    blendedCycle += mix[k] * CYCLE_MIN[k];
  }
  const containersPerDay = blendedPallets > 0 ? palletsPerDay / blendedPallets : 0;
  const doorMinutesPerDay = containersPerDay * blendedCycle;
  const doorsRequired = operatingMinPerDay > 0
    ? Math.ceil(doorMinutesPerDay / operatingMinPerDay)
    : 0;

  return {
    containersPerDay,
    blendedPalletsPerContainer: blendedPallets,
    blendedCycleMin: blendedCycle,
    doorsRequired,
  };
}
