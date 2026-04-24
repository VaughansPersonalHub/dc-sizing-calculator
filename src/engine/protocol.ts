/**
 * Main-thread ↔ Worker message protocol.
 *
 * Inputs and outputs use structured-clone for non-array fields and
 * `Transferable` ArrayBuffers for large numeric arrays (per-SKU demand).
 * Each worker responds to one of three commands and echoes the request id.
 */

export interface EngineRunRequest {
  type: 'engine.run';
  id: string;
  payload: {
    skuIds: string[];
    // 52-week demand for each SKU, concatenated Float32Array of length skuIds.length * 52
    demandBuffer: ArrayBufferLike;
    // Opaque serialized inputs — Ops Profile, libraries, scenario overrides.
    // Kept as JSON so the worker doesn't need Zustand.
    inputsJson: string;
  };
}

export interface EngineProgressEvent {
  type: 'engine.progress';
  id: string;
  step: number;
  totalSteps: number;
  label: string;
}

export interface EngineResultEvent {
  type: 'engine.result';
  id: string;
  outputJson: string;
  outputHash: string;
  elapsedMs: number;
}

export interface EngineErrorEvent {
  type: 'engine.error';
  id: string;
  message: string;
  stack?: string;
}

export type EngineEvent = EngineProgressEvent | EngineResultEvent | EngineErrorEvent;

export interface TornadoRunRequest {
  type: 'tornado.run';
  id: string;
  payload: {
    baselineJson: string;
    variantsJson: string;
  };
}

export interface LayoutRunRequest {
  type: 'layout.run';
  id: string;
  payload: {
    zonesJson: string;
    envelopeJson: string;
  };
}

export type WorkerRequest = EngineRunRequest | TornadoRunRequest | LayoutRunRequest;
