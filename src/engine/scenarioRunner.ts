// Phase 6 — Scenario engine.
// SPEC §13 Phase 6 + SPEC §8 Step 14: "Run scenarios in 4-worker pool.
// Tornado = 17 curated params × {low, high}. Feasibility filter separates
// feasible from infeasible. Ranked by weighted delta."
//
// The scenario runner is the orchestrator. It takes a baseline pipeline
// payload, an array of overrides (one per variant), and pushes them
// through a pool of engine workers. Each variant emits a tagged result;
// callers aggregate, filter for feasibility, and rank.
//
// Pool sizing: 4 workers per SPEC. We don't bother with a worker pool when
// the variant count is ≤ 1 — the existing single-shot runEngine path is
// fine. For 2+ variants, the pool spreads work in FIFO order.

import { createEngineWorker } from './workerClient';
import type { EngineEvent, EngineRunRequest } from './protocol';
import type { PipelineInputs, PipelineOutputs } from './pipeline';

export const DEFAULT_POOL_SIZE = 4;

export interface ScenarioOverride {
  /** Stable identifier — appears on the result and in tornado output. */
  id: string;
  /** Human-readable label (e.g. "peakUplift +20%"). */
  label: string;
  /** Optional grouping label — e.g. "tornado-peak-factor" so the UI can
   *  group low/high pairs. */
  group?: string;
  /** Patch applied on top of the baseline. Inner objects are spread one
   *  level deep — so { opsProfile: { peakUplift: 1.62 } } only changes
   *  peakUplift, leaving other ops fields alone. */
  patch: Partial<{
    opsProfile: Partial<PipelineInputs['opsProfile']>;
    halalRequired: boolean;
    isBonded: boolean;
    vnaSelected: boolean;
    automationConfig: PipelineInputs['automationConfig'];
    seismicCoefficient: number;
    avgPalletWeightKg: number;
    aisleOrientation: PipelineInputs['aisleOrientation'];
  }>;
}

export interface ScenarioResult {
  id: string;
  label: string;
  group?: string;
  /** Engine output, typed loosely so the worker JSON round-trip stays cheap. */
  result: PipelineOutputs;
  /** Wall-clock for this scenario's worker run. */
  elapsedMs: number;
  /** True when overall feasibility passes. */
  feasible: boolean;
}

export interface ScenarioFailure {
  id: string;
  label: string;
  group?: string;
  message: string;
}

export interface RunScenariosOptions {
  /** Pool size; defaults to 4 (SPEC). */
  poolSize?: number;
  /** Progress callback (current / total / id). */
  onProgress?: (current: number, total: number, id: string) => void;
  /** Worker factory override — used by tests to inject a fake worker. */
  workerFactory?: () => Worker;
}

export interface ScenarioRunSummary {
  scenarios: ScenarioResult[];
  failures: ScenarioFailure[];
  feasibleCount: number;
  infeasibleCount: number;
  totalElapsedMs: number;
}

/**
 * Apply a ScenarioOverride patch to a baseline PipelineInputs payload.
 * Used by both the tornado generator and the scenario UI when packaging
 * variants. Pure — does not mutate the baseline.
 */
export function applyOverride(
  baseline: PipelineInputs,
  override: ScenarioOverride
): PipelineInputs {
  const { patch } = override;
  return {
    ...baseline,
    opsProfile: patch.opsProfile
      ? { ...baseline.opsProfile, ...patch.opsProfile }
      : baseline.opsProfile,
    halalRequired: patch.halalRequired ?? baseline.halalRequired,
    isBonded: patch.isBonded ?? baseline.isBonded,
    vnaSelected: patch.vnaSelected ?? baseline.vnaSelected,
    automationConfig: patch.automationConfig ?? baseline.automationConfig,
    seismicCoefficient: patch.seismicCoefficient ?? baseline.seismicCoefficient,
    avgPalletWeightKg: patch.avgPalletWeightKg ?? baseline.avgPalletWeightKg,
    aisleOrientation: patch.aisleOrientation ?? baseline.aisleOrientation,
  };
}

/**
 * Run a list of scenarios through a worker pool. Returns a summary tagged
 * with feasibility. The baseline payload is reused — only the overrideable
 * inputs change between variants. Demand Float32Array is cloned per variant
 * since transferable buffers are consumed on postMessage.
 */
export async function runScenarios(
  baseline: PipelineInputs,
  skuIds: string[],
  baselineDemand: Float32Array,
  overrides: ScenarioOverride[],
  opts: RunScenariosOptions = {}
): Promise<ScenarioRunSummary> {
  const t0 = performance.now();
  const poolSize = Math.max(1, Math.min(opts.poolSize ?? DEFAULT_POOL_SIZE, overrides.length));
  const factory = opts.workerFactory ?? createEngineWorker;

  const scenarios: ScenarioResult[] = [];
  const failures: ScenarioFailure[] = [];
  let completed = 0;

  // Worker pool — each worker repeatedly pulls the next task off the queue.
  const queue: ScenarioOverride[] = [...overrides];
  const workers: Worker[] = [];
  for (let i = 0; i < poolSize; i++) workers.push(factory());

  try {
    await Promise.all(
      workers.map((w) =>
        (async () => {
          while (queue.length > 0) {
            const override = queue.shift();
            if (!override) break;
            try {
              const inputs = applyOverride(baseline, override);
              const demand = baselineDemand.slice(); // fresh buffer per task
              const variantResult = await runOnce(w, skuIds, demand, inputs);
              const feasible = variantResult.result.feasibility.overall;
              scenarios.push({
                id: override.id,
                label: override.label,
                group: override.group,
                result: variantResult.result,
                elapsedMs: variantResult.elapsedMs,
                feasible,
              });
            } catch (err) {
              failures.push({
                id: override.id,
                label: override.label,
                group: override.group,
                message: err instanceof Error ? err.message : String(err),
              });
            } finally {
              completed += 1;
              opts.onProgress?.(completed, overrides.length, override.id);
            }
          }
        })()
      )
    );
  } finally {
    for (const w of workers) w.terminate();
  }

  const feasibleCount = scenarios.filter((s) => s.feasible).length;
  return {
    scenarios,
    failures,
    feasibleCount,
    infeasibleCount: scenarios.length - feasibleCount,
    totalElapsedMs: performance.now() - t0,
  };
}

interface RunOnceResult {
  result: PipelineOutputs;
  elapsedMs: number;
}

function runOnce(
  worker: Worker,
  skuIds: string[],
  demand: Float32Array,
  inputs: PipelineInputs
): Promise<RunOnceResult> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const onMessage = (event: MessageEvent<EngineEvent>) => {
      const evt = event.data;
      if (evt.id !== id) return;
      if (evt.type === 'engine.result') {
        worker.removeEventListener('message', onMessage);
        try {
          resolve({
            result: JSON.parse(evt.outputJson) as PipelineOutputs,
            elapsedMs: evt.elapsedMs,
          });
        } catch (err) {
          reject(err);
        }
      } else if (evt.type === 'engine.error') {
        worker.removeEventListener('message', onMessage);
        reject(new Error(evt.message));
      }
    };
    worker.addEventListener('message', onMessage);
    const req: EngineRunRequest = {
      type: 'engine.run',
      id,
      payload: {
        skuIds,
        demandBuffer: demand.buffer,
        inputsJson: JSON.stringify(inputs),
      },
    };
    worker.postMessage(req, [demand.buffer as ArrayBuffer]);
  });
}
