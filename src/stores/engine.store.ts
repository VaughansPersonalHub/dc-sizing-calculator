import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export type EngineStatus = 'idle' | 'running' | 'error';

// Serialisable shape of a Step 0 ValidationResult — the live ValidationResult
// uses Set<string> for suppressedSkus, which doesn't survive postMessage or
// JSON round-trip. The dashboard converts before storing.
export interface ValidationSummary {
  fatalErrors: { skuId: string; code: string; message: string; severity: string }[];
  warnings: { skuId: string; code: string; message: string; severity: string }[];
  suppressedSkus: string[];
  stats: {
    totalSkus: number;
    cleanSkus: number;
    warningSkus: number;
    fatalSkus: number;
    suppressedSkus: number;
    codesByCount: Record<string, number>;
  };
  ranAt: string;
  /** Hash over the SKU set when the validation was computed. */
  inputHash: string;
}

interface EngineState {
  status: EngineStatus;
  progress: { current: number; total: number };
  lastResult: unknown | null;
  lastResultHash: string | null;
  cacheHits: number;
  _inputHash: string;

  // Phase 2.5 — Data Quality Dashboard state
  lastValidation: ValidationSummary | null;
  /** When the user clicks "Acknowledge", we snapshot lastValidation.inputHash
   *  here. Engine runs gated by validationAcknowledgedHash === lastValidation.inputHash. */
  validationAcknowledgedHash: string | null;

  // Phase 6 — Tornado state
  tornadoStatus: EngineStatus;
  tornadoProgress: { current: number; total: number };
  /** Last tornado run output. Stored as `unknown` to keep the store JSON
   *  round-trip safe (avoid leaking class instances). */
  lastTornado: unknown | null;
  lastTornadoHash: string | null;

  setStatus: (status: EngineStatus) => void;
  setProgress: (current: number, total: number) => void;
  setResult: (result: unknown, hash: string) => void;
  invalidate: (newInputHash: string) => void;
  recordCacheHit: () => void;

  setValidation: (summary: ValidationSummary | null) => void;
  acknowledgeValidation: () => void;

  setTornadoStatus: (status: EngineStatus) => void;
  setTornadoProgress: (current: number, total: number) => void;
  setTornadoResult: (result: unknown, hash: string) => void;
}

export const useEngineStore = create<EngineState>()(
  immer((set) => ({
    status: 'idle',
    progress: { current: 0, total: 0 },
    lastResult: null,
    lastResultHash: null,
    cacheHits: 0,
    _inputHash: '',

    lastValidation: null,
    validationAcknowledgedHash: null,

    tornadoStatus: 'idle',
    tornadoProgress: { current: 0, total: 0 },
    lastTornado: null,
    lastTornadoHash: null,

    setStatus: (status) =>
      set((s) => {
        s.status = status;
      }),
    setProgress: (current, total) =>
      set((s) => {
        s.progress = { current, total };
      }),
    setResult: (result, hash) =>
      set((s) => {
        s.lastResult = result;
        s.lastResultHash = hash;
        s.status = 'idle';
      }),
    invalidate: (newInputHash) =>
      set((s) => {
        s._inputHash = newInputHash;
        s.lastResult = null;
        s.lastResultHash = null;
        // Library or scenario change invalidates the validation
        // acknowledgement. Same logic as the engine cache.
        s.lastValidation = null;
        s.validationAcknowledgedHash = null;
        // Tornado is downstream of the baseline result — invalidate too.
        s.lastTornado = null;
        s.lastTornadoHash = null;
      }),
    recordCacheHit: () =>
      set((s) => {
        s.cacheHits += 1;
      }),

    setValidation: (summary) =>
      set((s) => {
        s.lastValidation = summary;
        // If the inputs changed since the last acknowledgement, drop it.
        if (
          s.validationAcknowledgedHash !== null &&
          summary !== null &&
          summary.inputHash !== s.validationAcknowledgedHash
        ) {
          s.validationAcknowledgedHash = null;
        }
      }),
    acknowledgeValidation: () =>
      set((s) => {
        if (s.lastValidation) s.validationAcknowledgedHash = s.lastValidation.inputHash;
      }),

    setTornadoStatus: (status) =>
      set((s) => {
        s.tornadoStatus = status;
      }),
    setTornadoProgress: (current, total) =>
      set((s) => {
        s.tornadoProgress = { current, total };
      }),
    setTornadoResult: (result, hash) =>
      set((s) => {
        s.lastTornado = result;
        s.lastTornadoHash = hash;
        s.tornadoStatus = 'idle';
      }),
  }))
);
