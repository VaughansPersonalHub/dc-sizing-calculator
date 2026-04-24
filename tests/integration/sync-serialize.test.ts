// Round-trip test for the .scc blob serializer. Runs in isolation from
// the rest of the sync layer (no network, no Zustand) — it just asserts
// that pack → unpack preserves every field, including the Float32Array
// demand vectors and UTF-8 fields.

import { describe, it, expect } from 'vitest';
import {
  SCC_SCHEMA_VERSION,
  decodeEngagementBlob,
} from '../../src/sync/serialize';
import { gzipSync } from 'fflate';
import type { EngagementMeta } from '../../src/schemas/engagement';
import type { SkuRecord } from '../../src/schemas/sku';

// We can't call exportEngagement() in jsdom (Dexie / IndexedDB isn't set
// up in the vitest env), so we build an envelope directly and decode it
// — which exercises the b64 → Float32Array path + gzip round-trip.

interface SkuWire {
  [k: string]: unknown;
}

function float32ToB64(arr: Float32Array): string {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

describe('sync/serialize — .scc envelope round-trip', () => {
  it('decodes a freshly packed blob and preserves the Float32 demand vector', () => {
    const weekly = new Float32Array(52);
    for (let i = 0; i < 52; i++) weekly[i] = Math.sin(i / 2) * 100 + 500;

    const engagement: EngagementMeta = {
      id: 'eng-test-1',
      name: 'Test engagement — 한국',
      clientName: 'Widget Co',
      regionProfile: 'KR',
      createdAt: new Date('2026-04-24T00:00:00Z'),
      createdBy: 'test@scconnect.co.nz',
      lastModifiedAt: new Date('2026-04-24T00:00:00Z'),
      lastModifiedBy: 'test@scconnect.co.nz',
      etag: '',
      status: 'active',
      skuCount: 1,
      scenarioCount: 1,
      halalCertifiedRequired: false,
      isBonded: false,
    };

    const sku: SkuWire = {
      id: 'SKU-1',
      engagementId: 'eng-test-1',
      name: '유니콘 위젯',
      category: 'FMCG',
      weeklyUnitsB64: float32ToB64(weekly),
      weeklyUnitsLen: 52,
      weeksOnFile: 52,
      unitCubeCm3: 1000,
      unitWeightKg: 1.2,
      caseQty: 24,
      inboundPalletId: 'T11_1100x1100',
      outboundPalletId: 'T11_1100x1100',
      palletTi: 8,
      palletHi: 6,
      stackable: true,
      tempClass: 'ambient',
      dgClass: 'none',
      halalStatus: 'unclassified',
      channelMix: { retailB2bPct: 0.6, ecomDtcPct: 0.3, marketplacePct: 0.1 },
      isEventDrivenSeasonal: false,
      validationStatus: 'clean',
      validationIssues: [],
    };

    const envelope = {
      schemaVersion: SCC_SCHEMA_VERSION,
      exportedAt: '2026-04-24T10:00:00Z',
      engagement,
      skus: [sku],
      scenarios: [],
    };

    const json = JSON.stringify(envelope);
    const gz = gzipSync(new TextEncoder().encode(json), { level: 6 });
    const decoded = decodeEngagementBlob(gz);

    expect(decoded.schemaVersion).toBe(SCC_SCHEMA_VERSION);
    expect(decoded.engagement.id).toBe('eng-test-1');
    expect(decoded.engagement.name).toBe('Test engagement — 한국');
    expect(decoded.skus).toHaveLength(1);

    const roundTripped = decoded.skus[0] as SkuRecord;
    expect(roundTripped.weeklyUnits).toBeInstanceOf(Float32Array);
    expect(roundTripped.weeklyUnits.length).toBe(52);
    for (let i = 0; i < 52; i++) {
      expect(roundTripped.weeklyUnits[i]).toBeCloseTo(weekly[i], 5);
    }
    expect(roundTripped.name).toBe('유니콘 위젯');
  });

  it('rejects a blob with a mismatched schema version', () => {
    const envelope = {
      schemaVersion: 99,
      exportedAt: '2026-04-24T10:00:00Z',
      engagement: {},
      skus: [],
      scenarios: [],
      opsProfile: null,
    };
    const gz = gzipSync(new TextEncoder().encode(JSON.stringify(envelope)), { level: 6 });
    expect(() => decodeEngagementBlob(gz)).toThrow(/schema version 99/);
  });

  it('accepts a legacy v1 blob (no opsProfile) and returns null for it', () => {
    const envelope = {
      schemaVersion: 1,
      exportedAt: '2026-04-20T10:00:00Z',
      engagement: { id: 'eng-legacy' },
      skus: [],
      scenarios: [],
    };
    const gz = gzipSync(new TextEncoder().encode(JSON.stringify(envelope)), { level: 6 });
    const decoded = decodeEngagementBlob(gz);
    expect(decoded.schemaVersion).toBe(1);
    expect(decoded.opsProfile).toBeNull();
  });
});
