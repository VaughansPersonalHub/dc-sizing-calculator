// Phase 6 — Tornado runner (main-thread façade).
// Wraps runTornado from src/engine/tornado.ts in the same Dexie + Zustand
// plumbing the existing single-shot runner uses, so the UI can fire a
// tornado from one click on the Scenarios tab.

import { useEngineStore } from '../stores/engine.store';
import { runTornado, type TornadoResult, type TornadoWeights } from './tornado';
import { buildEngineInputs } from './inputsBuilder';
import type { PipelineOutputs } from './pipeline';

export interface RunTornadoOptions {
  engagementId: string;
  /** Required: the baseline pipeline result. Tornado deltas are measured
   *  against this — re-running it would be wasteful. */
  baselineResult: PipelineOutputs;
  weights?: TornadoWeights;
  buildingTemplateId?: string;
  poolSize?: number;
  onProgress?: (current: number, total: number, id: string) => void;
}

export interface RunTornadoResult {
  tornado: TornadoResult;
  hash: string;
  elapsedMs: number;
}

export async function runTornadoForEngagement(
  opts: RunTornadoOptions
): Promise<RunTornadoResult> {
  const engineStore = useEngineStore.getState();

  engineStore.setTornadoStatus('running');
  engineStore.setTornadoProgress(0, 34);

  try {
    const { inputs: baseline, skuIds, demand } = await buildEngineInputs({
      engagementId: opts.engagementId,
      buildingTemplateId: opts.buildingTemplateId,
    });

    const t0 = performance.now();
    const tornado = await runTornado(baseline, opts.baselineResult, skuIds, demand, {
      weights: opts.weights,
      poolSize: opts.poolSize,
      onProgress: (current, total, id) => {
        engineStore.setTornadoProgress(current, total);
        opts.onProgress?.(current, total, id);
      },
    });
    const elapsedMs = performance.now() - t0;
    const hash = hashString(JSON.stringify(tornado.rows.map((r) => [r.paramId, r.weightedDelta])));
    engineStore.setTornadoResult(tornado, hash);
    return { tornado, hash, elapsedMs };
  } catch (err) {
    engineStore.setTornadoStatus('error');
    throw err;
  }
}

function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
