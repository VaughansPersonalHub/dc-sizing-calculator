// Phase 2 gate: SKU CSV parse + validate + Float32Array build for 20k rows
// in under 3 seconds per SPEC §14 performance budget. This test bypasses
// Dexie (the Vitest env has no IndexedDB) and only measures the
// CPU-bound phases — parsing, validation, weekly-demand construction.

import { describe, it, expect } from 'vitest';
import { ingestSkuCsv, type IngestionStats } from '../../src/ingestion';

function synthCsv(rowCount: number): string {
  const headers = [
    'id',
    'name',
    'category',
    'subCategory',
    'unitCubeCm3',
    'unitWeightKg',
    'caseQty',
    'inboundPalletId',
    'outboundPalletId',
    'palletTi',
    'palletHi',
    'stackable',
    'tempClass',
    'dgClass',
    'halalStatus',
    'channel_retailB2b',
    'channel_ecomDtc',
    'channel_marketplace',
    'isEventDrivenSeasonal',
    'seasonalEventTag',
    ...Array.from({ length: 52 }, (_, i) => `week_${String(i + 1).padStart(2, '0')}`),
  ];

  const lines: string[] = [headers.join(',')];
  for (let r = 0; r < rowCount; r++) {
    const weekly: number[] = [];
    for (let w = 0; w < 52; w++) {
      // Pseudo-random demand curve with a light seasonality so Float32
      // encoding has some variety. Keep non-negative.
      const base = 50 + ((r * 13 + w * 7) % 200);
      const season = Math.max(0, Math.round(30 * Math.sin((w / 52) * Math.PI * 2)));
      weekly.push(base + season);
    }
    const row = [
      `SKU-${r}`,
      `Item ${r}`,
      'FMCG',
      '',
      '1200',
      '1.2',
      '24',
      'T11_1100x1100',
      'T11_1100x1100',
      '8',
      '6',
      'true',
      'ambient',
      'none',
      'halal',
      '0.6',
      '0.3',
      '0.1',
      'false',
      '',
      ...weekly,
    ];
    lines.push(row.join(','));
  }
  return lines.join('\n');
}

describe('Phase 2 gate — SKU ingestion perf budget', () => {
  it('parses + validates + constructs Float32Array for 20k SKUs in <3s', async () => {
    const csv = synthCsv(20_000);
    const t0 = performance.now();
    const stats: IngestionStats = await ingestSkuCsv(csv, {
      engagementId: 'perf-test',
      onBatch: async () => {
        // No-op: we're measuring CPU cost, not Dexie write cost.
      },
    });
    const elapsed = performance.now() - t0;

    expect(stats.acceptedRows).toBe(20_000);
    expect(stats.rejectedRows).toBe(0);
    expect(stats.totalRows).toBe(20_000);
    // Soft gate: warns in CI if we regress. Hard gate: <3s per SPEC §14.
    console.log(`ingest 20k rows: ${elapsed.toFixed(0)}ms`);
    expect(elapsed).toBeLessThan(3000);
  }, 15_000);

  it('rejects rows that fail Zod validation without blowing up the run', async () => {
    // Row 2 has a bad channel mix (doesn't sum to 1) — should be rejected.
    const headers = [
      'id,name,category,unitCubeCm3,unitWeightKg,caseQty,inboundPalletId,outboundPalletId,palletTi,palletHi,stackable,tempClass,channel_retailB2b,channel_ecomDtc,channel_marketplace',
      ...Array.from({ length: 52 }, (_, i) => `week_${String(i + 1).padStart(2, '0')}`),
    ];
    const weekly = Array(52).fill(100).join(',');
    const csv =
      `id,name,category,unitCubeCm3,unitWeightKg,caseQty,inboundPalletId,outboundPalletId,palletTi,palletHi,stackable,tempClass,channel_retailB2b,channel_ecomDtc,channel_marketplace,${Array.from(
        { length: 52 },
        (_, i) => `week_${String(i + 1).padStart(2, '0')}`
      ).join(',')}\n` +
      `SKU-1,Good,FMCG,1200,1.2,24,T11,T11,8,6,true,ambient,0.6,0.3,0.1,${weekly}\n` +
      `SKU-2,Bad,FMCG,1200,1.2,24,T11,T11,8,6,true,ambient,0.5,0.3,0.3,${weekly}\n`;

    void headers;

    const stats = await ingestSkuCsv(csv, {
      engagementId: 'perf-test',
      onBatch: async () => {},
    });
    expect(stats.totalRows).toBe(2);
    expect(stats.acceptedRows).toBe(1);
    expect(stats.rejectedRows).toBe(1);
    expect(stats.firstRejectedIds).toContain('SKU-2');
  });
});
