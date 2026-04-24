/// <reference lib="webworker" />
import type { TornadoRunRequest } from '../src/engine/protocol';

/**
 * Tornado worker — placeholder. Phase 6 will run 30+ parameter variants
 * through the engine with a 4-worker pool in parallel.
 */
const ctx: DedicatedWorkerGlobalScope = self as never;

ctx.addEventListener('message', (event: MessageEvent<TornadoRunRequest>) => {
  const req = event.data;
  if (req.type !== 'tornado.run') return;
  ctx.postMessage({ type: 'tornado.result', id: req.id, placeholder: true });
});
