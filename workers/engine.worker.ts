/// <reference lib="webworker" />
import type { EngineRunRequest, EngineEvent } from '../src/engine/protocol';
import { runPipeline, type PipelineInputs } from '../src/engine/pipeline';
import type { EngineSku } from '../src/engine/models';

/**
 * Engine worker — Phase 3 implementation. Receives a single
 * EngineRunRequest, decodes the transferred Float32 demand buffer back
 * into per-SKU 52-week vectors, runs Steps 0–6 via the pipeline, and
 * posts the resulting JSON. Errors fall through to engine.error events
 * with the original stack so the main thread can surface them.
 */

const ctx: DedicatedWorkerGlobalScope = self as never;
const TOTAL_STEPS = 8;

ctx.addEventListener('message', (event: MessageEvent<EngineRunRequest>) => {
  const req = event.data;
  if (req.type !== 'engine.run') return;
  const t0 = performance.now();

  try {
    const skuCount = req.payload.skuIds.length;
    const demand = new Float32Array(req.payload.demandBuffer);
    const expectedLen = skuCount * 52;
    if (demand.length !== expectedLen) {
      throw new Error(
        `demandBuffer length ${demand.length} !== expected ${expectedLen} (skuCount ${skuCount} × 52 weeks)`
      );
    }

    progress('decoding_inputs', 0, TOTAL_STEPS);

    const pipelineInputs = decodeInputs(req.payload.inputsJson, req.payload.skuIds, demand);

    progress('step_00_validation', 1, TOTAL_STEPS);
    const result = runPipeline(pipelineInputs);
    progress('step_06_throughput', TOTAL_STEPS, TOTAL_STEPS);

    // Strip Float32Array fields from the worker output — JSON.stringify
    // emits them as {0: 1.5, 1: 2.7, ...} objects, which is wasteful. The
    // main thread can recompute peak vectors if it ever needs them.
    const safeResult = stripFloat32(result);
    const outputJson = JSON.stringify(safeResult);
    const outputHash = hashString(outputJson);

    const done: EngineEvent = {
      type: 'engine.result',
      id: req.id,
      outputJson,
      outputHash,
      elapsedMs: performance.now() - t0,
    };
    ctx.postMessage(done);
  } catch (err) {
    const errEvent: EngineEvent = {
      type: 'engine.error',
      id: req.id,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    };
    ctx.postMessage(errEvent);
  }

  function progress(label: string, step: number, total: number) {
    const evt: EngineEvent = {
      type: 'engine.progress',
      id: req.id,
      step,
      totalSteps: total,
      label,
    };
    ctx.postMessage(evt);
  }
});

interface WorkerInputsJson {
  skus: Omit<EngineSku, 'weeklyUnits'>[]; // weeklyUnits comes via demandBuffer
  opsProfile: PipelineInputs['opsProfile'];
  pallets: PipelineInputs['pallets'];
  racks: PipelineInputs['racks'];
  envelope: PipelineInputs['envelope'];
  productivity: PipelineInputs['productivity'];
  mheLibrary: PipelineInputs['mheLibrary'];
  automationLibrary?: PipelineInputs['automationLibrary'];
  automationConfig?: PipelineInputs['automationConfig'];
  regional: PipelineInputs['regional'];
  driverCurve?: PipelineInputs['driverCurve'];
  halalRequired: boolean;
  isBonded?: boolean;
  vnaSelected?: boolean;
  seismicCoefficient?: number;
  avgPalletWeightKg?: number;
  aisleOrientation?: PipelineInputs['aisleOrientation'];
}

function decodeInputs(
  inputsJson: string,
  skuIds: string[],
  demand: Float32Array
): PipelineInputs {
  const parsed = JSON.parse(inputsJson) as WorkerInputsJson;
  const skuById = new Map(parsed.skus.map((s) => [s.id, s]));

  const skus: EngineSku[] = [];
  for (let i = 0; i < skuIds.length; i++) {
    const id = skuIds[i];
    const meta = skuById.get(id);
    if (!meta) throw new Error(`SKU id ${id} present in skuIds but missing from inputsJson.skus`);
    const slice = new Float32Array(52);
    for (let w = 0; w < 52; w++) slice[w] = demand[i * 52 + w];
    skus.push({ ...meta, weeklyUnits: slice });
  }

  return {
    skus,
    opsProfile: parsed.opsProfile,
    pallets: parsed.pallets,
    racks: parsed.racks,
    envelope: parsed.envelope,
    productivity: parsed.productivity,
    mheLibrary: parsed.mheLibrary,
    automationLibrary: parsed.automationLibrary,
    automationConfig: parsed.automationConfig,
    regional: parsed.regional,
    driverCurve: parsed.driverCurve,
    halalRequired: parsed.halalRequired,
    isBonded: parsed.isBonded,
    vnaSelected: parsed.vnaSelected,
    seismicCoefficient: parsed.seismicCoefficient,
    avgPalletWeightKg: parsed.avgPalletWeightKg,
    aisleOrientation: parsed.aisleOrientation,
  };
}

function stripFloat32(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Float32Array) return Array.from(obj);
  if (obj instanceof Set) return Array.from(obj);
  if (Array.isArray(obj)) return obj.map(stripFloat32);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = stripFloat32(v);
  return out;
}

function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
