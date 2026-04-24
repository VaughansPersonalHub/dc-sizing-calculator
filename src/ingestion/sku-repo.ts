// SKU repository — the Dexie-writing half of the ingestion pipeline.
// Separate from csv.ts so unit tests can run the parser without a live
// IndexedDB and so Playwright e2e can mock this layer.

import { db } from '../db/schema';
import { useDataStore } from '../stores/data.store';
import type { SkuRecord } from '../schemas/sku';

/** Replaces every SKU row scoped to `engagementId` with the given set. */
export async function replaceSkus(
  engagementId: string,
  rows: SkuRecord[]
): Promise<void> {
  await db.transaction('rw', db.skus, async () => {
    await db.skus.where('engagementId').equals(engagementId).delete();
    if (rows.length) await db.skus.bulkPut(rows);
  });
  useDataStore.getState().setSkuCount(rows.length);
  useDataStore.getState().markImport();
}

/** Streams batches into Dexie, scoped by engagementId. Does not truncate
 *  up-front — call `clearSkus` first if the caller wants replace-semantics.
 */
export async function appendSkuBatch(rows: SkuRecord[]): Promise<void> {
  if (!rows.length) return;
  await db.skus.bulkPut(rows);
}

export async function clearSkus(engagementId: string): Promise<void> {
  await db.skus.where('engagementId').equals(engagementId).delete();
  useDataStore.getState().setSkuCount(0);
}

export async function countSkus(engagementId: string): Promise<number> {
  return db.skus.where('engagementId').equals(engagementId).count();
}
