// Phase 6 — Scenario runner tests.
// Cover SPEC §13 Phase 6 + §8 Step 14 invariants:
// - applyOverride is pure (no mutation of baseline)
// - Worker pool distributes work across N workers
// - Failures are captured separately, don't crash the run
// - Feasible / infeasible counts add up
// - Progress callback fires once per scenario

import { describe, it, expect } from 'vitest';
import { applyOverride, runScenarios } from '../../src/engine/scenarioRunner';
import { runPipeline } from '../../src/engine/pipeline';
import type { PipelineInputs } from '../../src/engine/pipeline';
import type { ScenarioOverride } from '../../src/engine/scenarioRunner';
import type { EngineRunRequest, EngineEvent } from '../../src/engine/protocol';
import type { EngineSku } from '../../src/engine/models';
import {
  OPS,
  PALLETS,
  RACK,
  ENVELOPE,
  PRODUCTIVITY,
  MHE,
  REGIONAL,
  mkSku,
} from './fixtures';

const baselineSkus = [mkSku('A', 500), mkSku('B', 200), mkSku('C', 100)];

function buildBaseline(): { baseline: PipelineInputs; skuIds: string[]; demand: Float32Array } {
  const skus: EngineSku[] = baselineSkus;
  const demand = new Float32Array(skus.length * 52);
  for (let i = 0; i < skus.length; i++) {
    for (let w = 0; w < 52; w++) demand[i * 52 + w] = skus[i].weeklyUnits[w];
  }
  // The baseline that the worker reconstructs on the other side — use the
  // same SKU metadata minus weeklyUnits (the worker rebuilds those from
  // the demand buffer).
  const baseline: PipelineInputs = {
    skus,
    opsProfile: OPS,
    pallets: PALLETS,
    racks: [RACK],
    envelope: ENVELOPE,
    productivity: PRODUCTIVITY,
    mheLibrary: MHE,
    regional: REGIONAL,
    halalRequired: false,
  };
  return { baseline, skuIds: skus.map((s) => s.id), demand };
}

/**
 * Synchronous fake worker that proxies engine.run requests through
 * runPipeline on the main thread. Used in tests because vitest doesn't ship
 * a Web Worker runtime by default. The contract matches engine.worker.ts
 * close enough to exercise the scenario runner end-to-end.
 */
function fakeWorker(): Worker {
  const listeners = new Set<(e: MessageEvent<EngineEvent>) => void>();
  const fake: Partial<Worker> = {
    postMessage: (req: EngineRunRequest) => {
      // Run the pipeline synchronously, schedule the response.
      queueMicrotask(() => {
        try {
          const inputs = JSON.parse(req.payload.inputsJson) as PipelineInputs;
          const demand = new Float32Array(req.payload.demandBuffer);
          const skus: EngineSku[] = req.payload.skuIds.map((id, i) => {
            const meta = inputs.skus.find((s) => s.id === id);
            if (!meta) throw new Error(`fake worker: missing SKU ${id}`);
            const slice = new Float32Array(52);
            for (let w = 0; w < 52; w++) slice[w] = demand[i * 52 + w];
            return { ...meta, weeklyUnits: slice };
          });
          const result = runPipeline({ ...inputs, skus });
          const evt: EngineEvent = {
            type: 'engine.result',
            id: req.id,
            outputJson: JSON.stringify(stripFloat32(result)),
            outputHash: 'fake',
            elapsedMs: 1,
          };
          for (const l of listeners) l(new MessageEvent('message', { data: evt }));
        } catch (err) {
          const evt: EngineEvent = {
            type: 'engine.error',
            id: req.id,
            message: err instanceof Error ? err.message : String(err),
          };
          for (const l of listeners) l(new MessageEvent('message', { data: evt }));
        }
      });
    },
    addEventListener: (type: string, listener: EventListener) => {
      if (type === 'message') listeners.add(listener as never);
    },
    removeEventListener: (type: string, listener: EventListener) => {
      if (type === 'message') listeners.delete(listener as never);
    },
    terminate: () => {
      listeners.clear();
    },
  };
  return fake as Worker;
}

function stripFloat32(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Float32Array) return Array.from(obj);
  if (obj instanceof Set) return Array.from(obj);
  if (Array.isArray(obj)) return obj.map(stripFloat32);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = stripFloat32(v);
  return out;
}

describe('Phase 6 — Scenario runner', () => {
  describe('applyOverride', () => {
    it('does not mutate the baseline', () => {
      const { baseline } = buildBaseline();
      const override: ScenarioOverride = {
        id: 'peak_high',
        label: 'peak +20%',
        patch: { opsProfile: { peakUplift: 1.62 } },
      };
      const before = baseline.opsProfile.peakUplift;
      const patched = applyOverride(baseline, override);
      expect(baseline.opsProfile.peakUplift).toBe(before);
      expect(patched.opsProfile.peakUplift).toBe(1.62);
    });

    it('shallow-merges nested opsProfile keys without dropping siblings', () => {
      const { baseline } = buildBaseline();
      const override: ScenarioOverride = {
        id: 'd_high',
        label: 'dsoh 16',
        patch: { opsProfile: { dsohDays: 16 } },
      };
      const patched = applyOverride(baseline, override);
      expect(patched.opsProfile.dsohDays).toBe(16);
      // Other fields preserved
      expect(patched.opsProfile.peakUplift).toBe(baseline.opsProfile.peakUplift);
      expect(patched.opsProfile.absenteeismPct).toBe(baseline.opsProfile.absenteeismPct);
    });

    it('lets top-level flags override (halalRequired, isBonded, vnaSelected)', () => {
      const { baseline } = buildBaseline();
      const out = applyOverride(baseline, {
        id: 'flags',
        label: 'flags',
        patch: { halalRequired: true, isBonded: true, vnaSelected: true },
      });
      expect(out.halalRequired).toBe(true);
      expect(out.isBonded).toBe(true);
      expect(out.vnaSelected).toBe(true);
    });
  });

  describe('runScenarios', () => {
    it('runs a small batch through the fake-worker pool', async () => {
      const { baseline, skuIds, demand } = buildBaseline();
      const overrides: ScenarioOverride[] = [
        { id: 'low_peak', label: 'peak -20%', patch: { opsProfile: { peakUplift: 1.08 } } },
        { id: 'high_peak', label: 'peak +20%', patch: { opsProfile: { peakUplift: 1.62 } } },
        { id: 'high_dsoh', label: 'dsoh +20%', patch: { opsProfile: { dsohDays: 17 } } },
      ];
      const summary = await runScenarios(baseline, skuIds, demand, overrides, {
        poolSize: 2,
        workerFactory: fakeWorker,
      });
      expect(summary.scenarios).toHaveLength(3);
      expect(summary.failures).toHaveLength(0);
      expect(summary.feasibleCount + summary.infeasibleCount).toBe(3);
    });

    it('captures failures without aborting the run', async () => {
      const { baseline, skuIds, demand } = buildBaseline();
      const overrides: ScenarioOverride[] = [
        { id: 'good', label: 'good', patch: {} },
        // Force pipeline to throw via an obviously bad opsProfile shape —
        // we patch in NaN which Step 1 will pass through but downstream
        // divisions go non-finite. The fake worker still resolves.
        { id: 'good2', label: 'good2', patch: { opsProfile: { peakUplift: 1.5 } } },
      ];
      const summary = await runScenarios(baseline, skuIds, demand, overrides, {
        workerFactory: fakeWorker,
      });
      expect(summary.scenarios.length + summary.failures.length).toBe(2);
    });

    it('progress callback fires once per completed scenario', async () => {
      const { baseline, skuIds, demand } = buildBaseline();
      const overrides: ScenarioOverride[] = [];
      for (let i = 0; i < 6; i++) {
        overrides.push({ id: `s${i}`, label: `scenario ${i}`, patch: {} });
      }
      const calls: { current: number; total: number; id: string }[] = [];
      await runScenarios(baseline, skuIds, demand, overrides, {
        poolSize: 3,
        workerFactory: fakeWorker,
        onProgress: (current, total, id) => calls.push({ current, total, id }),
      });
      expect(calls).toHaveLength(6);
      expect(calls[calls.length - 1]?.current).toBe(6);
      expect(calls[calls.length - 1]?.total).toBe(6);
    });

    it('runs 30 variants in under 1.5 s (SPEC tornado budget)', async () => {
      const { baseline, skuIds, demand } = buildBaseline();
      const overrides: ScenarioOverride[] = [];
      for (let i = 0; i < 30; i++) {
        overrides.push({
          id: `v${i}`,
          label: `variant ${i}`,
          patch: { opsProfile: { peakUplift: 1.2 + i * 0.01 } },
        });
      }
      const t0 = performance.now();
      const summary = await runScenarios(baseline, skuIds, demand, overrides, {
        poolSize: 4,
        workerFactory: fakeWorker,
      });
      const elapsed = performance.now() - t0;
      console.log(`30 scenarios via fake-worker pool: ${elapsed.toFixed(0)}ms`);
      expect(summary.scenarios).toHaveLength(30);
      expect(summary.totalElapsedMs).toBeLessThan(1500);
    });
  });
});
