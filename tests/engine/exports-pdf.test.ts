// Phase 8 chunk 2 — Summary PDF tests.
//
// react-pdf renders fine in jsdom (it doesn't depend on browser APIs for
// the document tree), so we can do a real round-trip and inspect the
// resulting Blob.

import { describe, it, expect } from 'vitest';
import { renderSummaryPdf } from '../../src/exports/pdf-renderer';
import { runPipeline } from '../../src/engine/pipeline';
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
import type { TornadoResult } from '../../src/engine/tornado';

const baseInputs = {
  opsProfile: OPS,
  pallets: PALLETS,
  racks: [RACK],
  envelope: ENVELOPE,
  productivity: PRODUCTIVITY,
  mheLibrary: MHE,
  regional: REGIONAL,
  halalRequired: false,
};

describe('Phase 8 — Summary PDF', () => {
  it('returns a non-empty PDF blob from a baseline run', async () => {
    const skus = [mkSku('A', 5000)];
    const result = runPipeline({ skus, ...baseInputs });
    const blob = await renderSummaryPdf({
      result,
      engagementName: 'Acme DC',
      regionProfile: 'KR',
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(1000);
    // Sniff PDF magic bytes.
    const head = await blob.slice(0, 4).text();
    expect(head).toBe('%PDF');
  }, 20_000);

  it('appends a tornado page when a TornadoResult is supplied', async () => {
    const skus = [mkSku('A', 1000)];
    const result = runPipeline({ skus, ...baseInputs });
    const tornado: TornadoResult = {
      baseline: {
        footprintM2: result.step11.rollup.buildingFootprintGfaM2,
        peakFte: result.step7.totalPeakFte,
      },
      rows: [
        {
          paramId: 'peak_factor',
          label: 'Peak factor',
          deltaLabel: '±20%',
          footprintDelta: { low: -120, high: 180 },
          fteDelta: { low: -2, high: 3 },
          feasibility: { low: true, high: true },
          weightedDelta: 91,
        },
      ],
      summary: {
        baseline: result,
        scenarios: [],
        elapsedMs: 12,
        feasibleCount: 1,
        infeasibleCount: 0,
        failures: [],
      },
      feasibleVariantCount: 1,
      infeasibleVariantCount: 0,
    };
    const withT = await renderSummaryPdf({ result, tornado });
    const without = await renderSummaryPdf({ result });
    // Tornado page adds bytes — not a strict test of PDF structure but a
    // useful round-trip sanity check.
    expect(withT.size).toBeGreaterThan(without.size);
  }, 20_000);
});
