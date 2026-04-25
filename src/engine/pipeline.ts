// Engine pipeline orchestrator. Runs Steps 0–6 in order over a single
// worker tick. Pure: takes inputs, returns outputs + diagnostics. The
// worker thread (workers/engine.worker.ts) is the only call-site in
// production; tests import this module directly.

import { runValidationLayer, type ValidationResult } from './validators/Step0ValidationLayer';
import { runStep01Profiling, type Step01Outputs } from './steps/Step01Profiling';
import {
  runStep02ForwardGrowth,
  type Step02Outputs,
  type ForwardDriverCurve,
} from './steps/Step02ForwardGrowth';
import { runStep03SlotSizing, type Step03Outputs } from './steps/Step03SlotSizing';
import {
  runStep04Bays,
  runStep4_5ClearHeight,
  runStep4_6SeismicMass,
  type Step04Outputs,
  type ClearHeightResult,
  type SeismicMassResult,
} from './steps/Step04Bays';
import {
  runStep05Footprint,
  type Step05Outputs,
  type AisleOrientation,
} from './steps/Step05Footprint';
import { runStep06Throughput, type Step06Outputs } from './steps/Step06Throughput';
import type {
  EngineSku,
  EngineOpsProfile,
  EnginePallet,
  EngineRackSystem,
  EngineBuildingEnvelope,
} from './models';

export interface PipelineInputs {
  skus: EngineSku[];
  opsProfile: EngineOpsProfile;
  pallets: EnginePallet[];
  racks: EngineRackSystem[];
  envelope: EngineBuildingEnvelope;
  driverCurve?: ForwardDriverCurve;
  halalRequired: boolean;
  /** Engagement-level seismic Cs override (else derived from envelope category). */
  seismicCoefficient?: number;
  /** Pallet+load avg weight for Step 4.6. */
  avgPalletWeightKg?: number;
  /** Aisle orientation default for Step 5 zones. */
  aisleOrientation?: AisleOrientation;
  /** Allow caller to plug in pre-computed validation result (eg from
   *  Phase 2.5 dashboard, where the user has already auto-fixed). */
  preValidated?: ValidationResult;
}

export interface PipelineOutputs {
  validation: ValidationResult;
  step1: Step01Outputs;
  step2: Step02Outputs;
  step3: Step03Outputs;
  step4: Step04Outputs;
  step4_5: ClearHeightResult;
  step4_6: SeismicMassResult;
  step5: Step05Outputs;
  step6: Step06Outputs;
  feasibility: { clearHeightOk: boolean; seismicOk: boolean; overall: boolean };
  meta: {
    schemaVersion: number;
    completedAt: string;
    durationMs: number;
    skuCount: number;
    suppressedCount: number;
  };
}

export const PIPELINE_SCHEMA_VERSION = 1;

export function runPipeline(inputs: PipelineInputs): PipelineOutputs {
  const t0 = performance.now();

  const validation =
    inputs.preValidated ??
    runValidationLayer(inputs.skus, {
      pallets: inputs.pallets,
      halalRequired: inputs.halalRequired,
    });

  const step1 = runStep01Profiling({
    skus: inputs.skus,
    opsProfile: inputs.opsProfile,
    suppressed: validation.suppressedSkus,
  });

  const step2 = runStep02ForwardGrowth({
    skus: inputs.skus.filter((s) => !validation.suppressedSkus.has(s.id)),
    profiles: step1.profiles,
    opsProfile: inputs.opsProfile,
    driverCurve: inputs.driverCurve,
  });

  const survivingSkus = inputs.skus.filter((s) => !validation.suppressedSkus.has(s.id));
  const step3 = runStep03SlotSizing({
    skus: survivingSkus,
    profiles: step1.profiles,
    projection: step2.peakProjection,
    opsProfile: inputs.opsProfile,
    pallets: inputs.pallets,
    racks: inputs.racks,
  });

  const step4 = runStep04Bays({
    totals: step3.totals,
    rack: step3.rack,
    ops: inputs.opsProfile,
  });

  const inboundPallet =
    inputs.pallets.find((p) =>
      survivingSkus.some((s) => s.inboundPalletId === p.pallet_id)
    ) ?? inputs.pallets[0];

  const step4_5 = runStep4_5ClearHeight({
    bays: step4,
    rack: step3.rack,
    inboundPallet,
    envelope: inputs.envelope,
    ops: inputs.opsProfile,
  });

  const seismicCs =
    inputs.seismicCoefficient ?? deriveSeismicCs(inputs.envelope.seismic.designCategory);

  const step4_6 = runStep4_6SeismicMass({
    bays: step4,
    rack: step3.rack,
    envelope: inputs.envelope,
    avgPalletWeightKg: inputs.avgPalletWeightKg ?? 800,
    seismicCoefficient: seismicCs,
  });

  const step5 = runStep05Footprint({
    bays: step4,
    rack: step3.rack,
    envelope: inputs.envelope,
    ops: inputs.opsProfile,
    orientation: inputs.aisleOrientation,
  });

  const step6 = runStep06Throughput({
    skus: survivingSkus,
    profiles: step1.profiles,
    slotRows: step3.rows,
    projection: step2.peakProjection,
    opsProfile: inputs.opsProfile,
    pallets: inputs.pallets,
  });

  return {
    validation,
    step1,
    step2,
    step3,
    step4,
    step4_5,
    step4_6,
    step5,
    step6,
    feasibility: {
      clearHeightOk: step4_5.ok,
      seismicOk: step4_6.ok,
      overall: step4_5.ok && step4_6.ok && validation.fatalErrors.length === 0,
    },
    meta: {
      schemaVersion: PIPELINE_SCHEMA_VERSION,
      completedAt: new Date().toISOString(),
      durationMs: performance.now() - t0,
      skuCount: inputs.skus.length,
      suppressedCount: validation.suppressedSkus.size,
    },
  };
}

function deriveSeismicCs(designCategory: string): number {
  const c = designCategory.toUpperCase();
  if (c.startsWith('A')) return 0.05;
  if (c.startsWith('B')) return 0.1;
  if (c.startsWith('C')) return 0.2;
  if (c.startsWith('D-E') || c === 'DE') return 0.45;
  if (c.startsWith('D')) return 0.35;
  if (c.startsWith('E')) return 0.5;
  return 0.2;
}
