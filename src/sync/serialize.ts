// .scc blob serialization — Dexie engagement-scoped rows ↔ compressed bytes.
//
// Format: gzipped JSON with a small envelope. The envelope lets us evolve
// the on-disk schema later without breaking older blobs:
//
//   {
//     schemaVersion: 1,
//     exportedAt: '2026-04-24T...',
//     engagement: EngagementMeta,
//     skus: SkuRecordWire[],       // Float32Array encoded as base64
//     scenarios: Scenario[],
//   }
//
// Reference libraries (racks, mhe, productivity, buildings, pallets,
// automation) are intentionally NOT in the blob — they live in
// R2/shared/libraries and are seeded locally. Per-engagement library
// overrides will land in Phase 1 as a separate `libraryOverrides` field.

import { gzipSync, gunzipSync } from 'fflate';
import { db } from '../db/schema';
import type { EngagementMeta } from '../schemas/engagement';
import type { SkuRecord } from '../schemas/sku';
import type { Scenario } from '../schemas/scenario';

export const SCC_SCHEMA_VERSION = 1;

interface SkuRecordWire extends Omit<SkuRecord, 'weeklyUnits'> {
  weeklyUnitsB64: string;
  weeklyUnitsLen: number;
}

interface SccEnvelope {
  schemaVersion: number;
  exportedAt: string;
  engagement: EngagementMeta;
  skus: SkuRecordWire[];
  scenarios: Scenario[];
}

function float32ToBase64(arr: Float32Array): string {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  // btoa works on binary strings; chunked to avoid exceeding argument limits.
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function base64ToFloat32(b64: string, expectedLen: number): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const f32 = new Float32Array(bytes.buffer.slice(0), 0, bytes.byteLength / 4);
  if (f32.length !== expectedLen) {
    // Defensive — JSON shouldn't drift these. Throw so the caller surfaces
    // a corrupted-blob dialog rather than silently returning wrong data.
    throw new Error(
      `weeklyUnits length mismatch: expected ${expectedLen}, got ${f32.length}`
    );
  }
  return f32;
}

function skuToWire(sku: SkuRecord): SkuRecordWire {
  const { weeklyUnits, ...rest } = sku;
  return {
    ...rest,
    weeklyUnitsB64: float32ToBase64(weeklyUnits),
    weeklyUnitsLen: weeklyUnits.length,
  };
}

function wireToSku(wire: SkuRecordWire): SkuRecord {
  const { weeklyUnitsB64, weeklyUnitsLen, ...rest } = wire;
  return {
    ...rest,
    weeklyUnits: base64ToFloat32(weeklyUnitsB64, weeklyUnitsLen),
  };
}

/**
 * Read every table scoped to `engagementId` from Dexie, pack into a .scc
 * envelope, JSON-stringify, and gzip. Returns bytes ready to PUT to R2.
 */
export async function exportEngagement(engagementId: string): Promise<Uint8Array> {
  const [engagement, skus, scenarios] = await Promise.all([
    db.engagements.get(engagementId),
    db.skus.where('engagementId').equals(engagementId).toArray(),
    db.scenarios.where('engagementId').equals(engagementId).toArray(),
  ]);
  if (!engagement) throw new Error(`engagement ${engagementId} not found in Dexie`);

  const envelope: SccEnvelope = {
    schemaVersion: SCC_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    engagement,
    skus: skus.map(skuToWire),
    scenarios,
  };

  const json = JSON.stringify(envelope);
  const bytes = new TextEncoder().encode(json);
  return gzipSync(bytes, { level: 6 });
}

/**
 * Unpack bytes from R2 into an SccEnvelope. Does NOT write to Dexie — the
 * caller is responsible for a single transaction that clears + bulk-puts
 * so a failed import can't leave Dexie half-populated.
 */
export function decodeEngagementBlob(bytes: Uint8Array): {
  engagement: EngagementMeta;
  skus: SkuRecord[];
  scenarios: Scenario[];
  schemaVersion: number;
  exportedAt: string;
} {
  const json = new TextDecoder().decode(gunzipSync(bytes));
  const env = JSON.parse(json) as SccEnvelope;
  if (env.schemaVersion !== SCC_SCHEMA_VERSION) {
    throw new Error(
      `unsupported .scc schema version ${env.schemaVersion} (expected ${SCC_SCHEMA_VERSION})`
    );
  }
  return {
    engagement: env.engagement,
    skus: env.skus.map(wireToSku),
    scenarios: env.scenarios,
    schemaVersion: env.schemaVersion,
    exportedAt: env.exportedAt,
  };
}

/**
 * Transactionally replace every row scoped to `engagementId` with the
 * contents of `decoded`. Used after a pull from R2 or a restore.
 */
export async function importEngagementBlob(
  engagementId: string,
  decoded: ReturnType<typeof decodeEngagementBlob>
): Promise<void> {
  if (decoded.engagement.id !== engagementId) {
    throw new Error(
      `blob engagement id ${decoded.engagement.id} does not match target ${engagementId}`
    );
  }
  await db.transaction('rw', [db.engagements, db.skus, db.scenarios], async () => {
    await db.skus.where('engagementId').equals(engagementId).delete();
    await db.scenarios.where('engagementId').equals(engagementId).delete();
    await db.engagements.put(decoded.engagement);
    if (decoded.skus.length) await db.skus.bulkPut(decoded.skus);
    if (decoded.scenarios.length) await db.scenarios.bulkPut(decoded.scenarios);
  });
}
