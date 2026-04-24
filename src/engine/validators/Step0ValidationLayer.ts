// Step 0 — ValidationLayer. Runs BEFORE any calc step. Blocks division
// by zero, impossible configs, negative inventory. Callers (Phase 2.5
// Data Quality Dashboard, the engine pipeline itself) consume the
// ValidationResult to decide what runs through vs what gets suppressed.
//
// SPEC §7.
//
// Input:   the SKU set + the pallet library + the current ops profile
// Output:  { fatalErrors, warnings, suppressedSkus, stats }
//
// Fatal errors block the engine run entirely. Warnings pass through but
// are surfaced to the user. `suppressedSkus` is the set of IDs the
// engine should skip for this run (eg. zero-demand SKUs that would
// divide-by-zero elsewhere). The auto-fix helpers mutate a *copy* of
// the SKU set — we never silently modify user data.

import type { EngineSku, EnginePallet } from '../models';

export type ValidationCode =
  | 'ZERO_DEMAND'
  | 'NEGATIVE_DEMAND'
  | 'ZERO_CASE_QTY'
  | 'IMPOSSIBLE_PALLET_CONFIG'
  | 'PALLET_WEIGHT_EXCEEDS_RACK'
  | 'INBOUND_OUTBOUND_MISMATCH'
  | 'MISSING_CHANNEL_MIX'
  | 'CV_OUTLIER'
  | 'UNIT_CUBE_IMPOSSIBLE'
  | 'MISSING_HALAL_STATUS'
  | 'PARTIAL_HISTORY'
  | 'SEASONAL_TAG_MISSING';

export type ValidationSeverity = 'fatal' | 'warning';

export interface ValidationIssue {
  skuId: string;
  code: ValidationCode;
  severity: ValidationSeverity;
  message: string;
  field?: string;
  value?: unknown;
  autoFixable: boolean;
  suggestedFix?: string;
}

export interface ValidationStats {
  totalSkus: number;
  cleanSkus: number;
  warningSkus: number;
  fatalSkus: number;
  suppressedSkus: number;
  codesByCount: Record<string, number>;
}

export interface ValidationResult {
  fatalErrors: ValidationIssue[];
  warnings: ValidationIssue[];
  suppressedSkus: Set<string>;
  stats: ValidationStats;
  // Run timestamp — useful for the dashboard to know when it's stale.
  ranAt: string;
}

export interface ValidationContext {
  pallets: EnginePallet[];
  halalRequired: boolean;
  /** Engagement-level halal flag controls whether MISSING_HALAL_STATUS fires. */
}

// Tunable thresholds; hard-coded here because they're engine invariants,
// not knobs users should twist per-engagement. If that changes, lift to
// OpsProfile.
const CV_OUTLIER_THRESHOLD = 3.0;
const PARTIAL_HISTORY_WEEKS = 26;

export function runValidationLayer(
  skus: EngineSku[],
  ctx: ValidationContext
): ValidationResult {
  const fatalErrors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const suppressed = new Set<string>();
  const codesByCount: Record<string, number> = {};
  const palletById = new Map(ctx.pallets.map((p) => [p.pallet_id, p]));

  let cleanSkus = 0;
  let warningSkus = 0;
  let fatalSkus = 0;

  const bump = (code: ValidationCode) => {
    codesByCount[code] = (codesByCount[code] ?? 0) + 1;
  };

  for (const sku of skus) {
    const skuIssues: ValidationIssue[] = [];
    let hadFatal = false;
    let shouldSuppress = false;

    // --- Demand integrity ---
    const weekly = sku.weeklyUnits;
    let negCount = 0;
    let total = 0;
    for (let i = 0; i < weekly.length; i++) {
      const v = weekly[i];
      if (v < 0) negCount++;
      total += Math.max(0, v);
    }
    if (negCount > 0) {
      skuIssues.push({
        skuId: sku.id,
        code: 'NEGATIVE_DEMAND',
        severity: 'fatal',
        field: 'weeklyUnits',
        value: negCount,
        autoFixable: true,
        message: `${negCount} weekly demand point(s) are negative`,
        suggestedFix: 'clamp to zero',
      });
      bump('NEGATIVE_DEMAND');
      hadFatal = true;
    }
    if (total === 0) {
      skuIssues.push({
        skuId: sku.id,
        code: 'ZERO_DEMAND',
        severity: 'warning',
        field: 'weeklyUnits',
        autoFixable: true,
        message: 'All 52 weekly demand points are zero — SKU will be suppressed',
        suggestedFix: 'suppress from engine run',
      });
      bump('ZERO_DEMAND');
      shouldSuppress = true;
    }
    if (sku.weeksOnFile > 0 && sku.weeksOnFile < PARTIAL_HISTORY_WEEKS) {
      skuIssues.push({
        skuId: sku.id,
        code: 'PARTIAL_HISTORY',
        severity: 'warning',
        field: 'weeksOnFile',
        value: sku.weeksOnFile,
        autoFixable: true,
        message: `Only ${sku.weeksOnFile} weeks of history (<${PARTIAL_HISTORY_WEEKS})`,
        suggestedFix: 'pad with category median',
      });
      bump('PARTIAL_HISTORY');
    }

    // --- Unit / case / pallet geometry ---
    if (sku.caseQty <= 0) {
      skuIssues.push({
        skuId: sku.id,
        code: 'ZERO_CASE_QTY',
        severity: 'fatal',
        field: 'caseQty',
        value: sku.caseQty,
        autoFixable: false,
        message: 'caseQty must be > 0',
      });
      bump('ZERO_CASE_QTY');
      hadFatal = true;
    }
    if (sku.unitCubeCm3 <= 0) {
      skuIssues.push({
        skuId: sku.id,
        code: 'UNIT_CUBE_IMPOSSIBLE',
        severity: 'fatal',
        field: 'unitCubeCm3',
        value: sku.unitCubeCm3,
        autoFixable: false,
        message: 'unitCubeCm3 must be > 0',
      });
      bump('UNIT_CUBE_IMPOSSIBLE');
      hadFatal = true;
    }

    // --- Pallet config sanity ---
    const inboundPal = palletById.get(sku.inboundPalletId);
    const outboundPal = palletById.get(sku.outboundPalletId);
    if (!inboundPal) {
      skuIssues.push({
        skuId: sku.id,
        code: 'IMPOSSIBLE_PALLET_CONFIG',
        severity: 'fatal',
        field: 'inboundPalletId',
        value: sku.inboundPalletId,
        autoFixable: false,
        message: `inboundPalletId "${sku.inboundPalletId}" not in pallet library`,
      });
      bump('IMPOSSIBLE_PALLET_CONFIG');
      hadFatal = true;
    }
    if (!outboundPal) {
      skuIssues.push({
        skuId: sku.id,
        code: 'IMPOSSIBLE_PALLET_CONFIG',
        severity: 'fatal',
        field: 'outboundPalletId',
        value: sku.outboundPalletId,
        autoFixable: false,
        message: `outboundPalletId "${sku.outboundPalletId}" not in pallet library`,
      });
      bump('IMPOSSIBLE_PALLET_CONFIG');
      hadFatal = true;
    }
    if (
      inboundPal &&
      sku.unitWeightKg > 0 &&
      sku.caseQty > 0 &&
      sku.palletTi > 0 &&
      sku.palletHi > 0
    ) {
      const casesPerPallet = sku.palletTi * sku.palletHi;
      const palletLoadKg =
        casesPerPallet * sku.caseQty * sku.unitWeightKg;
      if (palletLoadKg > inboundPal.maxLoadKg * 1.05) {
        skuIssues.push({
          skuId: sku.id,
          code: 'PALLET_WEIGHT_EXCEEDS_RACK',
          severity: 'warning',
          field: 'palletTi×palletHi×unitWeightKg',
          value: palletLoadKg,
          autoFixable: false,
          message: `Computed pallet load ${palletLoadKg.toFixed(0)} kg exceeds pallet max ${inboundPal.maxLoadKg} kg`,
        });
        bump('PALLET_WEIGHT_EXCEEDS_RACK');
      }
    }
    if (inboundPal && outboundPal && inboundPal.pallet_id !== outboundPal.pallet_id) {
      skuIssues.push({
        skuId: sku.id,
        code: 'INBOUND_OUTBOUND_MISMATCH',
        severity: 'warning',
        field: 'inboundPalletId/outboundPalletId',
        value: `${inboundPal.pallet_id}→${outboundPal.pallet_id}`,
        autoFixable: false,
        message: 'Inbound pallet differs from outbound — repack labour will apply',
      });
      bump('INBOUND_OUTBOUND_MISMATCH');
    }

    // --- Channel mix: must sum to 1.0 (Zod already enforces at CSV, but
    //     warn if a legacy import drifted a tiny amount) ---
    const cm = sku.channelMix;
    const cmSum = cm.retailB2bPct + cm.ecomDtcPct + cm.marketplacePct;
    if (Math.abs(cmSum - 1) > 0.01) {
      skuIssues.push({
        skuId: sku.id,
        code: 'MISSING_CHANNEL_MIX',
        severity: 'fatal',
        field: 'channelMix',
        value: cmSum,
        autoFixable: true,
        message: `channelMix sums to ${cmSum.toFixed(3)}, expected 1.0`,
        suggestedFix: 'normalise channel mix to sum to 1.0',
      });
      bump('MISSING_CHANNEL_MIX');
      hadFatal = true;
    }

    // --- CV outlier (only when we have non-trivial history) ---
    if (sku.weeksOnFile >= 4 && total > 0) {
      const mean = total / 52;
      if (mean > 0) {
        let variance = 0;
        for (let i = 0; i < 52; i++) {
          const d = Math.max(0, weekly[i]) - mean;
          variance += d * d;
        }
        const sigma = Math.sqrt(variance / 52);
        const cv = sigma / mean;
        if (cv > CV_OUTLIER_THRESHOLD) {
          skuIssues.push({
            skuId: sku.id,
            code: 'CV_OUTLIER',
            severity: 'warning',
            field: 'weeklyUnits',
            value: cv,
            autoFixable: true,
            message: `CV ${cv.toFixed(2)} > ${CV_OUTLIER_THRESHOLD} — likely data spike`,
            suggestedFix: `cap CV at ${CV_OUTLIER_THRESHOLD}`,
          });
          bump('CV_OUTLIER');
        }
      }
    }

    // --- Halal classification (only when engagement requires halal) ---
    if (ctx.halalRequired && sku.halalStatus === 'unclassified') {
      skuIssues.push({
        skuId: sku.id,
        code: 'MISSING_HALAL_STATUS',
        severity: 'warning',
        field: 'halalStatus',
        autoFixable: true,
        message: 'halalStatus unclassified on a halal-certified engagement',
        suggestedFix: 'auto-classify from category (requires category→halal map)',
      });
      bump('MISSING_HALAL_STATUS');
    }

    // --- Classify this SKU ---
    if (hadFatal) {
      fatalSkus += 1;
      shouldSuppress = true;
    } else if (skuIssues.some((i) => i.severity === 'warning')) {
      warningSkus += 1;
    } else {
      cleanSkus += 1;
    }
    if (shouldSuppress) suppressed.add(sku.id);

    for (const issue of skuIssues) {
      if (issue.severity === 'fatal') fatalErrors.push(issue);
      else warnings.push(issue);
    }
  }

  return {
    fatalErrors,
    warnings,
    suppressedSkus: suppressed,
    stats: {
      totalSkus: skus.length,
      cleanSkus,
      warningSkus,
      fatalSkus,
      suppressedSkus: suppressed.size,
      codesByCount,
    },
    ranAt: new Date().toISOString(),
  };
}

/**
 * Auto-fix applier. Returns a new array — never mutates input. Only
 * applies the fixes the caller asked for; leaves the rest alone so the
 * dashboard can present them as warnings.
 *
 * Supported fixes:
 *   clampNegativeDemand       NEGATIVE_DEMAND    → max(0, weekly[i])
 *   suppressZeroDemand        ZERO_DEMAND        → drop the SKU
 *   capCv                     CV_OUTLIER         → winsorise weekly to mean + CV_OUTLIER_THRESHOLD × mean
 *   normaliseChannelMix       MISSING_CHANNEL_MIX→ rescale so sum === 1
 */
export interface AutoFixOptions {
  clampNegativeDemand?: boolean;
  suppressZeroDemand?: boolean;
  capCv?: boolean;
  normaliseChannelMix?: boolean;
}

export function applyAutoFixes(
  skus: EngineSku[],
  opts: AutoFixOptions
): EngineSku[] {
  const out: EngineSku[] = [];
  for (const sku of skus) {
    let weekly = sku.weeklyUnits;
    let total = 0;
    let needCopy = false;

    if (opts.clampNegativeDemand) {
      for (let i = 0; i < weekly.length; i++) {
        if (weekly[i] < 0) {
          needCopy = true;
          break;
        }
      }
      if (needCopy) {
        const copy = new Float32Array(52);
        for (let i = 0; i < 52; i++) copy[i] = Math.max(0, weekly[i]);
        weekly = copy;
      }
    }

    for (let i = 0; i < weekly.length; i++) total += weekly[i];

    if (opts.suppressZeroDemand && total === 0) continue;

    if (opts.capCv && total > 0) {
      const mean = total / 52;
      if (mean > 0) {
        let variance = 0;
        for (let i = 0; i < 52; i++) variance += (weekly[i] - mean) ** 2;
        const sigma = Math.sqrt(variance / 52);
        const cv = sigma / mean;
        if (cv > CV_OUTLIER_THRESHOLD) {
          const cap = mean + CV_OUTLIER_THRESHOLD * mean;
          const copy = weekly === sku.weeklyUnits ? new Float32Array(weekly) : weekly;
          for (let i = 0; i < 52; i++) if (copy[i] > cap) copy[i] = cap;
          weekly = copy;
        }
      }
    }

    let channelMix = sku.channelMix;
    if (opts.normaliseChannelMix) {
      const s =
        channelMix.retailB2bPct + channelMix.ecomDtcPct + channelMix.marketplacePct;
      if (s > 0 && Math.abs(s - 1) > 0.001) {
        channelMix = {
          retailB2bPct: channelMix.retailB2bPct / s,
          ecomDtcPct: channelMix.ecomDtcPct / s,
          marketplacePct: channelMix.marketplacePct / s,
        };
      }
    }

    out.push({
      ...sku,
      weeklyUnits: weekly,
      channelMix,
    });
  }
  return out;
}
