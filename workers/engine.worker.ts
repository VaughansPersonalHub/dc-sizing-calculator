/// <reference lib="webworker" />
import type { EngineRunRequest, EngineEvent } from '../src/engine/protocol';

/**
 * Engine worker — placeholder. Phase 3 fills in Steps 0–6 here, Phase 4 adds
 * 7–11. Contract: receive a single EngineRunRequest, stream progress events,
 * reply with a single result or error.
 */

const ctx: DedicatedWorkerGlobalScope = self as never;

ctx.addEventListener('message', (event: MessageEvent<EngineRunRequest>) => {
  const req = event.data;
  if (req.type !== 'engine.run') return;
  const t0 = performance.now();

  try {
    // Decode demand buffer (each row is 52 weeks)
    const skuCount = req.payload.skuIds.length;
    const demand = new Float32Array(req.payload.demandBuffer);
    const expectedLen = skuCount * 52;
    if (demand.length !== expectedLen) {
      throw new Error(
        `demandBuffer length ${demand.length} !== expected ${expectedLen} (skuCount ${skuCount} × 52 weeks)`
      );
    }

    progress('step_00_validation', 0, 14);

    // Phase 3+ will replace this placeholder with actual step implementations.
    // For now we compute per-SKU mean and total as a sanity check that the
    // transferable buffer round-trips correctly.
    let totalDemand = 0;
    const means = new Float32Array(skuCount);
    for (let i = 0; i < skuCount; i++) {
      let sum = 0;
      const base = i * 52;
      for (let w = 0; w < 52; w++) sum += demand[base + w];
      means[i] = sum / 52;
      totalDemand += sum;
    }

    progress('engine_placeholder_done', 14, 14);

    const output = {
      placeholder: true,
      skuCount,
      totalDemand,
      meanSampleFirst: Array.from(means.slice(0, Math.min(5, skuCount))),
      inputsEcho: JSON.parse(req.payload.inputsJson) as unknown,
    };

    const done: EngineEvent = {
      type: 'engine.result',
      id: req.id,
      outputJson: JSON.stringify(output),
      outputHash: hashString(JSON.stringify(output)),
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

function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
