// Phase 2.5 — runs Step 0 ValidationLayer against the active engagement
// without firing the rest of the pipeline. The Data Quality Dashboard
// calls this on mount + after every fix-application so the user sees
// fresh stats. Also exposes applyAutoFixesToEngagement, which takes the
// dashboard's chosen options and writes a corrected SKU set back into
// Dexie via the existing ingestion repo.

import { db } from '../db/schema';
import { useDataStore } from '../stores/data.store';
import {
  runValidationLayer,
  applyAutoFixes,
  type ValidationResult,
  type AutoFixOptions,
} from './validators/Step0ValidationLayer';
import type { EngineSku } from './models';
import type { SkuRecord } from '../schemas/sku';
import type { EngagementMeta } from '../schemas/engagement';
import type { ValidationSummary } from '../stores/engine.store';
import { replaceSkus } from '../ingestion';

/** Compute a stable hash over the current SKU set + halal flag, so the
 *  dashboard can tell when a stored validation result is stale. djb2. */
function hashInputs(skus: SkuRecord[], halalRequired: boolean): string {
  let h = 5381;
  // Fold in a marker for the halal flag, since MISSING_HALAL_STATUS is
  // gated by it — same SKUs should produce a different hash if the flag flips.
  h = ((h << 5) + h + (halalRequired ? 1 : 0)) >>> 0;
  for (const sku of skus) {
    // SKU id + sum of weekly demand + caseQty + channel mix is enough
    // to reflect every meaningful change without iterating 52 weeks.
    let weeklySum = 0;
    for (let i = 0; i < sku.weeklyUnits.length; i++) weeklySum += sku.weeklyUnits[i];
    const tag = `${sku.id}|${weeklySum}|${sku.caseQty}|${sku.channelMix.retailB2bPct}|${sku.channelMix.ecomDtcPct}`;
    for (let i = 0; i < tag.length; i++) h = ((h << 5) + h + tag.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

function skuRecordToEngine(sku: SkuRecord): EngineSku {
  return {
    id: sku.id,
    category: sku.category,
    subCategory: sku.subCategory,
    weeklyUnits: sku.weeklyUnits,
    weeksOnFile: sku.weeksOnFile,
    unitCubeCm3: sku.unitCubeCm3,
    unitWeightKg: sku.unitWeightKg,
    caseQty: sku.caseQty,
    inboundPalletId: sku.inboundPalletId,
    outboundPalletId: sku.outboundPalletId,
    palletTi: sku.palletTi,
    palletHi: sku.palletHi,
    stackable: sku.stackable,
    tempClass: sku.tempClass,
    halalStatus: sku.halalStatus,
    channelMix: sku.channelMix,
    slotTypeOverride: sku.slotTypeOverride,
    velocityOverride: sku.velocityOverride,
  };
}

function toSummary(result: ValidationResult, inputHash: string): ValidationSummary {
  return {
    fatalErrors: result.fatalErrors.map((e) => ({
      skuId: e.skuId,
      code: e.code,
      message: e.message,
      severity: e.severity,
    })),
    warnings: result.warnings.map((w) => ({
      skuId: w.skuId,
      code: w.code,
      message: w.message,
      severity: w.severity,
    })),
    suppressedSkus: Array.from(result.suppressedSkus),
    stats: result.stats,
    ranAt: result.ranAt,
    inputHash,
  };
}

export interface StandaloneValidationContext {
  engagement: Pick<EngagementMeta, 'id' | 'halalCertifiedRequired'>;
}

/**
 * Read every SKU for the engagement out of Dexie and run Step 0. Returns
 * the wire-friendly summary the dashboard renders + sticks into engine.store.
 */
export async function runStandaloneValidation(
  ctx: StandaloneValidationContext
): Promise<ValidationSummary> {
  const skus = await db.skus.where('engagementId').equals(ctx.engagement.id).toArray();
  const pallets = useDataStore.getState().libraries.pallets.map((p) => ({
    pallet_id: p.pallet_id,
    dimensionsMm: p.dimensionsMm,
    maxLoadKg: p.maxLoadKg,
  }));
  const engineSkus = skus.map(skuRecordToEngine);
  const result = runValidationLayer(engineSkus, {
    pallets,
    halalRequired: ctx.engagement.halalCertifiedRequired,
  });
  const inputHash = hashInputs(skus, ctx.engagement.halalCertifiedRequired);
  return toSummary(result, inputHash);
}

/**
 * Run the chosen auto-fixes against the engagement's SKU set in Dexie.
 * Returns the count of rows actually changed so the dashboard can show
 * a confirmation toast. Replaces the SKU table for the engagement
 * atomically (cheaper than diffing for ≤20k rows).
 */
export async function applyAutoFixesToEngagement(
  engagementId: string,
  opts: AutoFixOptions
): Promise<{ before: number; after: number; engineSkusChanged: number }> {
  const before = await db.skus.where('engagementId').equals(engagementId).toArray();
  const beforeEngine = before.map(skuRecordToEngine);
  const afterEngine = applyAutoFixes(beforeEngine, opts);

  // Re-hydrate to SkuRecord shape, preserving fields not touched by Step 0
  // auto-fixes (dgClass, isEventDrivenSeasonal, validation status etc).
  const beforeById = new Map(before.map((s) => [s.id, s]));
  const next: SkuRecord[] = afterEngine.map((eng) => {
    const original = beforeById.get(eng.id);
    if (!original) {
      throw new Error(`auto-fix produced an SKU id not in the original set: ${eng.id}`);
    }
    return {
      ...original,
      weeklyUnits: eng.weeklyUnits,
      channelMix: eng.channelMix,
      // The fix may have suppressed this SKU (it'd be missing from
      // afterEngine), but we already filter out missing entries via the
      // map iteration. Validation status will be recomputed next run.
      validationStatus: 'clean',
      validationIssues: [],
    };
  });

  await replaceSkus(engagementId, next);

  return {
    before: before.length,
    after: next.length,
    engineSkusChanged: next.length, // every surviving row was rewritten
  };
}
