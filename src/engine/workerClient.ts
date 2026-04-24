import type { EngineEvent, EngineRunRequest } from './protocol';

/**
 * Thin client for dispatching work to engine.worker. Vite's `?worker`
 * import spins up a dedicated Worker module with type: 'module'.
 *
 * Phase 3+ will wrap this in a pool of 4 workers. For now, one instance
 * per call is sufficient.
 */
export function createEngineWorker(): Worker {
  return new Worker(new URL('../../workers/engine.worker.ts', import.meta.url), {
    type: 'module',
  });
}

export interface EngineRunOptions {
  onProgress?: (step: number, total: number, label: string) => void;
}

export async function runEngine(
  skuIds: string[],
  demand: Float32Array,
  inputs: unknown,
  opts: EngineRunOptions = {}
): Promise<{ outputJson: string; outputHash: string; elapsedMs: number }> {
  const id = crypto.randomUUID();
  const worker = createEngineWorker();

  try {
    return await new Promise((resolve, reject) => {
      worker.addEventListener('message', (event: MessageEvent<EngineEvent>) => {
        const evt = event.data;
        if (evt.id !== id) return;
        if (evt.type === 'engine.progress') {
          opts.onProgress?.(evt.step, evt.totalSteps, evt.label);
        } else if (evt.type === 'engine.result') {
          resolve({
            outputJson: evt.outputJson,
            outputHash: evt.outputHash,
            elapsedMs: evt.elapsedMs,
          });
        } else {
          reject(new Error(evt.message));
        }
      });
      worker.addEventListener('error', (e) => reject(new Error(e.message)));

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
  } finally {
    worker.terminate();
  }
}
