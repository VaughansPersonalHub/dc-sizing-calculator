/// <reference lib="webworker" />
import type { LayoutRunRequest } from '../src/engine/protocol';

/**
 * Layout worker — placeholder. Phase 5 (simple rectangle packing) and Phase 7
 * (Visio-grade) implement this.
 */
const ctx: DedicatedWorkerGlobalScope = self as never;

ctx.addEventListener('message', (event: MessageEvent<LayoutRunRequest>) => {
  const req = event.data;
  if (req.type !== 'layout.run') return;
  ctx.postMessage({ type: 'layout.result', id: req.id, placeholder: true });
});
