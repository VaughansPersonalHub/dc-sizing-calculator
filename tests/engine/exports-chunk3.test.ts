// Phase 8 chunk 3 — Tornado PPT + .scc snapshot tests.

import { describe, it, expect } from 'vitest';
import { gzipSync, gunzipSync } from 'fflate';
import { buildTornadoPptBlob } from '../../src/exports/tornado-ppt';
import { decodeEngagementBlob } from '../../src/sync/serialize';
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

describe('Phase 8 — Tornado PPT', () => {
  it('builds a non-empty pptx Blob with the expected ZIP magic bytes', async () => {
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
        {
          paramId: 'productivity',
          label: 'Productivity',
          deltaLabel: '±15%',
          footprintDelta: { low: -50, high: 60 },
          fteDelta: { low: -5, high: 5 },
          feasibility: { low: true, high: false },
          weightedDelta: 55,
        },
      ],
      summary: {
        baseline: result,
        scenarios: [],
        elapsedMs: 12,
        feasibleCount: 3,
        infeasibleCount: 1,
        failures: [],
      },
      feasibleVariantCount: 3,
      infeasibleVariantCount: 1,
    };
    const blob = await buildTornadoPptBlob({
      tornado,
      engagementName: 'Acme DC',
      regionProfile: 'KR',
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(1000);
    // .pptx is a ZIP archive — first 4 bytes are 50 4B 03 04 ("PK\x03\x04").
    const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    expect(head[0]).toBe(0x50);
    expect(head[1]).toBe(0x4b);
  }, 20_000);
});

describe('Phase 8 — .scc snapshot decode (sniff + round-trip)', () => {
  // Dexie / IndexedDB isn't wired up in jsdom, so the export side is
  // exercised in tests/integration/sync-serialize.test.ts. Here we build
  // an envelope by hand and verify decodeEngagementBlob accepts it cleanly
  // (this is what the OutputsTab import handler relies on).
  it('decodes a hand-built v2 envelope, preserving Float32 demand', () => {
    const weekly = new Float32Array(52);
    for (let i = 0; i < 52; i++) weekly[i] = i * 7;
    const wireBytes = new Uint8Array(weekly.buffer);
    let bin = '';
    for (const b of wireBytes) bin += String.fromCharCode(b);
    const weeklyUnitsB64 = btoa(bin);

    const envelope = {
      schemaVersion: 2,
      exportedAt: '2026-04-26T00:00:00.000Z',
      engagement: {
        id: 'phase8-scc',
        name: 'Phase 8 round-trip',
        clientName: 'SCConnect',
        regionProfile: 'KR',
        createdAt: new Date('2026-04-26T00:00:00Z').toISOString(),
        createdBy: 'tester',
        lastModifiedAt: new Date('2026-04-26T00:00:00Z').toISOString(),
        lastModifiedBy: 'tester',
        etag: '',
        status: 'active',
        skuCount: 1,
        scenarioCount: 0,
        halalCertifiedRequired: false,
        isBonded: false,
      },
      skus: [
        {
          id: 'sku-1',
          engagementId: 'phase8-scc',
          skuId: 'sku-1',
          weeklyUnitsB64,
          weeklyUnitsLen: 52,
        },
      ],
      scenarios: [],
      opsProfile: null,
    };
    const bytes = gzipSync(new TextEncoder().encode(JSON.stringify(envelope)));
    expect(bytes[0]).toBe(0x1f);
    expect(bytes[1]).toBe(0x8b);

    const decoded = decodeEngagementBlob(bytes);
    expect(decoded.schemaVersion).toBe(2);
    expect(decoded.engagement.id).toBe('phase8-scc');
    expect(decoded.skus.length).toBe(1);
    expect(decoded.skus[0].weeklyUnits).toBeInstanceOf(Float32Array);
    expect(decoded.skus[0].weeklyUnits[10]).toBeCloseTo(70, 5);

    // Round-trip the gzip envelope back to JSON for an extra sanity hop.
    const json = JSON.parse(new TextDecoder().decode(gunzipSync(bytes)));
    expect(json.engagement.regionProfile).toBe('KR');
  });

  it('rejects an unsupported schema version', () => {
    const envelope = {
      schemaVersion: 99,
      exportedAt: '2026-04-26T00:00:00.000Z',
      engagement: {} as Record<string, unknown>,
      skus: [],
      scenarios: [],
      opsProfile: null,
    };
    const bytes = gzipSync(new TextEncoder().encode(JSON.stringify(envelope)));
    expect(() => decodeEngagementBlob(bytes)).toThrow(/unsupported \.scc schema/);
  });
});
