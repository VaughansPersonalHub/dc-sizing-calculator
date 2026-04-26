// Engine runner — main-thread façade. Reads Dexie + Zustand for the
// active engagement, packages the worker payload (skuIds + concatenated
// Float32 demand + JSON-safe inputs), invokes the worker, parses the
// result.
//
// Intentionally narrow: "given an engagement id, run the engine, write
// the result to engine.store, return it." The Scenarios tab UI doesn't
// need to think about pipeline plumbing.

import { useEngagementStore } from '../stores/engagement.store';
import { useEngineStore } from '../stores/engine.store';
import { runEngine } from './workerClient';
import { buildEngineInputs } from './inputsBuilder';
import type { EngineAutomationConfig } from './models';

export interface RunEngineOptions {
  engagementId: string;
  /** Optional building template id; falls back to the regional default. */
  buildingTemplateId?: string;
  /** Optional Step 12 automation override. When supplied, Step 11 swaps
   *  the conventional storage zones for the automated footprint. */
  automationConfig?: EngineAutomationConfig;
  onProgress?: (step: number, total: number, label: string) => void;
}

export interface RunEngineResult {
  outputJson: string;
  outputHash: string;
  elapsedMs: number;
  result: unknown;
}

export async function runEngineForEngagement(
  opts: RunEngineOptions
): Promise<RunEngineResult> {
  const engStore = useEngagementStore.getState();
  const engineStore = useEngineStore.getState();

  engineStore.setStatus('running');
  engineStore.setProgress(0, 8);

  try {
    const { inputs, skuIds, demand } = await buildEngineInputs({
      engagementId: opts.engagementId,
      buildingTemplateId: opts.buildingTemplateId,
    });

    // The worker reads weeklyUnits from the demand buffer, so we strip it
    // off the SKU list to keep the JSON payload small.
    const inputsForWorker = {
      ...inputs,
      automationConfig: opts.automationConfig,
      skus: inputs.skus.map(({ weeklyUnits: _w, ...rest }) => {
        void _w;
        return rest;
      }),
    };

    const t0 = performance.now();
    const result = await runEngine(skuIds, demand, inputsForWorker, {
      onProgress: (step, total, label) => {
        engineStore.setProgress(step, total);
        opts.onProgress?.(step, total, label);
      },
    });
    const parsed = JSON.parse(result.outputJson);
    engineStore.setResult(parsed, result.outputHash);
    void t0;
    return { ...result, result: parsed };
  } catch (err) {
    engineStore.setStatus('error');
    void engStore;
    throw err;
  }
}
