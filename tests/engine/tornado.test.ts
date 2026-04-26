// Phase 6 Step 14 — Tornado generator tests.
// Cover SPEC §8 Step 14 invariants:
// - 17 params × {low, high} = 34 variants
// - Ranking by weighted delta (default 0.5/0.5)
// - Feasibility filter on each variant
// - 30+ variants in <1.5s SPEC budget

import { describe, it, expect } from 'vitest';
import {
  TORNADO_PARAMS,
  generateTornadoVariants,
  runTornado,
} from '../../src/engine/tornado';
import { runPipeline } from '../../src/engine/pipeline';
import type { PipelineInputs } from '../../src/engine/pipeline';
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

function buildBaseline() {
  const skus: EngineSku[] = [mkSku('A', 1000), mkSku('B', 500), mkSku('C', 200)];
  const demand = new Float32Array(skus.length * 52);
  for (let i = 0; i < skus.length; i++) {
    for (let w = 0; w < 52; w++) demand[i * 52 + w] = skus[i].weeklyUnits[w];
  }
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

function fakeWorker(): Worker {
  const listeners = new Set<(e: MessageEvent<EngineEvent>) => void>();
  const fake: Partial<Worker> = {
    postMessage: (req: EngineRunRequest) => {
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
    terminate: () => listeners.clear(),
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

describe('Phase 6 Step 14 — Tornado', () => {
  it('TORNADO_PARAMS has exactly 17 entries (SPEC §8 Step 14)', () => {
    expect(TORNADO_PARAMS).toHaveLength(17);
  });

  it('generateTornadoVariants emits 34 overrides (17 × {low, high})', () => {
    const { baseline } = buildBaseline();
    const set = generateTornadoVariants(baseline);
    expect(set.overrides).toHaveLength(34);
    expect(set.pairs).toHaveLength(17);
    // Each pair stitches a low + high override id.
    for (const pair of set.pairs) {
      expect(set.overrides.some((o) => o.id === pair.lowId)).toBe(true);
      expect(set.overrides.some((o) => o.id === pair.highId)).toBe(true);
    }
  });

  it('low and high are distinct for each param', () => {
    const { baseline } = buildBaseline();
    const set = generateTornadoVariants(baseline);
    for (const pair of set.pairs) {
      const lo = set.overrides.find((o) => o.id === pair.lowId)!;
      const hi = set.overrides.find((o) => o.id === pair.highId)!;
      expect(JSON.stringify(lo.patch)).not.toBe(JSON.stringify(hi.patch));
    }
  });

  it('runs the tornado, ranks rows by weighted delta (descending)', async () => {
    const { baseline, skuIds, demand } = buildBaseline();
    const baselineResult = runPipeline(baseline);
    const tornado = await runTornado(baseline, baselineResult, skuIds, demand, {
      workerFactory: fakeWorker,
    });
    expect(tornado.rows).toHaveLength(17);
    for (let i = 0; i < tornado.rows.length - 1; i++) {
      expect(tornado.rows[i].weightedDelta).toBeGreaterThanOrEqual(tornado.rows[i + 1].weightedDelta);
    }
  });

  it('respects custom tornado weights', async () => {
    const { baseline, skuIds, demand } = buildBaseline();
    const baselineResult = runPipeline(baseline);
    const fteHeavy = await runTornado(baseline, baselineResult, skuIds, demand, {
      workerFactory: fakeWorker,
      weights: { footprint: 0.0, fte: 1.0 },
    });
    const footprintHeavy = await runTornado(baseline, baselineResult, skuIds, demand, {
      workerFactory: fakeWorker,
      weights: { footprint: 1.0, fte: 0.0 },
    });
    // Top row under fte-heavy weights should generally differ from the
    // top row under footprint-heavy weights — at least the weighted deltas
    // should not all match.
    expect(fteHeavy.rows[0].weightedDelta).not.toBe(footprintHeavy.rows[0].weightedDelta);
  });

  it('runs 34 variants in under 1.5 s (SPEC §13 Phase 6 gate)', async () => {
    const { baseline, skuIds, demand } = buildBaseline();
    const baselineResult = runPipeline(baseline);
    const t0 = performance.now();
    const tornado = await runTornado(baseline, baselineResult, skuIds, demand, {
      workerFactory: fakeWorker,
    });
    const elapsed = performance.now() - t0;
    console.log(`tornado 34 variants: ${elapsed.toFixed(0)}ms`);
    expect(tornado.summary.scenarios).toHaveLength(34);
    expect(tornado.summary.totalElapsedMs).toBeLessThan(1500);
  });

  it('feasibility filter separates feasible from infeasible variants', async () => {
    const { baseline, skuIds, demand } = buildBaseline();
    const baselineResult = runPipeline(baseline);
    const tornado = await runTornado(baseline, baselineResult, skuIds, demand, {
      workerFactory: fakeWorker,
    });
    expect(tornado.feasibleVariantCount + tornado.infeasibleVariantCount).toBe(34);
  });
});
