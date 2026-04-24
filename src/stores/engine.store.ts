import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export type EngineStatus = 'idle' | 'running' | 'error';

interface EngineState {
  status: EngineStatus;
  progress: { current: number; total: number };
  lastResult: unknown | null;
  lastResultHash: string | null;
  cacheHits: number;
  _inputHash: string;
  setStatus: (status: EngineStatus) => void;
  setProgress: (current: number, total: number) => void;
  setResult: (result: unknown, hash: string) => void;
  invalidate: (newInputHash: string) => void;
  recordCacheHit: () => void;
}

export const useEngineStore = create<EngineState>()(
  immer((set) => ({
    status: 'idle',
    progress: { current: 0, total: 0 },
    lastResult: null,
    lastResultHash: null,
    cacheHits: 0,
    _inputHash: '',
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
      }),
    recordCacheHit: () =>
      set((s) => {
        s.cacheHits += 1;
      }),
  }))
);
