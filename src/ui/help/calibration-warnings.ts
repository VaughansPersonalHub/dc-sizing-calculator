// Phase 10.6b — Calibration warnings.
//
// Per-row Step 0 validation already flags individual SKUs that fail
// validation rules. Calibration warnings instead look at the SHAPE of
// the SKU set as a whole and flag distributional patterns that
// indicate data-quality issues even when individual rows pass — e.g.
// 30% of SKUs have CV > 3 (outlier group, not uniform noise), 15%
// have <26 weeks history (sizing relies on extrapolation), or the
// total SKU count is so small that slot-mix curves won't be
// representative.
//
// Pure function over ValidationSummary; consumed by the Calibration
// panel in src/ui/components/inputs/DataQualityDashboard.tsx.

import type { ValidationSummary } from '../../stores/engine.store';

export type CalibrationSeverity = 'info' | 'warn';

export interface CalibrationWarning {
  /** Stable identifier for tests + UI keys. */
  id: string;
  /** info = quiet flag for the reviewer; warn = data-quality concern. */
  severity: CalibrationSeverity;
  /** Short title rendered as the warning's label. */
  title: string;
  /** Body text — plain English with concrete numbers. */
  detail: string;
  /** Suggested next step the operator can take. */
  suggestedAction: string;
}

const CV_OUTLIER_THRESHOLD = 0.05;
const PARTIAL_HISTORY_THRESHOLD = 0.10;
const ZERO_DEMAND_THRESHOLD = 0.15;
const SUPPRESSION_THRESHOLD = 0.10;
const SMALL_SAMPLE_THRESHOLD = 200;

function pct(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

/**
 * Compute distributional / calibration warnings from a Step 0
 * ValidationSummary. Pure — no DB access, no engagement object needed
 * (halal context is inferred from the presence of
 * MISSING_HALAL_STATUS, which Step 0 only emits on halal-certified
 * engagements).
 */
export function computeCalibrationWarnings(
  validation: ValidationSummary
): CalibrationWarning[] {
  const out: CalibrationWarning[] = [];
  const { stats } = validation;
  const total = stats.totalSkus;
  if (total === 0) return out;

  const cv = stats.codesByCount.CV_OUTLIER ?? 0;
  if (cv / total > CV_OUTLIER_THRESHOLD) {
    out.push({
      id: 'high_cv_outliers',
      severity: 'warn',
      title: 'High CV outlier density',
      detail: `${cv.toLocaleString()} of ${total.toLocaleString()} SKUs (${pct(cv / total)}) have CV > 3 — that is an outlier group, not uniform noise. Peak uplift will be inflated by the spike weeks.`,
      suggestedAction:
        'Apply the cap-CV auto-fix to winsorise spikes, OR split the outlier group into a separate engagement and size it explicitly.',
    });
  }

  const partial = stats.codesByCount.PARTIAL_HISTORY ?? 0;
  if (partial / total > PARTIAL_HISTORY_THRESHOLD) {
    out.push({
      id: 'partial_history_density',
      severity: 'warn',
      title: 'Significant partial-history coverage',
      detail: `${partial.toLocaleString()} of ${total.toLocaleString()} SKUs (${pct(partial / total)}) have under 26 weeks of demand. The engine extrapolates the missing weeks — sizing variance on these SKUs is typically 10–20% wider than full-history SKUs.`,
      suggestedAction:
        'Verify the upstream WMS extract is actually 52 weeks. If the launch SKUs are genuinely new, document the extrapolation in the engagement notes.',
    });
  }

  const zero = stats.codesByCount.ZERO_DEMAND ?? 0;
  if (zero / total > ZERO_DEMAND_THRESHOLD) {
    out.push({
      id: 'high_zero_demand_rate',
      severity: 'warn',
      title: 'High zero-demand rate',
      detail: `${zero.toLocaleString()} of ${total.toLocaleString()} SKUs (${pct(zero / total)}) have all-zero 52-week demand. Either the SKU master includes obsolete codes the engine should ignore, or the extract window is too narrow to capture seasonal demand.`,
      suggestedAction:
        'Suppress zero-demand via the auto-fix, or trim the master in the source system before re-import.',
    });
  }

  const missingHalal = stats.codesByCount.MISSING_HALAL_STATUS ?? 0;
  if (missingHalal > 0) {
    out.push({
      id: 'missing_halal_status',
      severity: 'warn',
      title: 'Halal status not classified',
      detail: `${missingHalal.toLocaleString()} SKUs have no halalStatus on a halal-certified engagement. JAKIM segregation rules require every SKU classified — the engine cannot allocate Surau, segregation aisles, or duplicate dock lanes without it.`,
      suggestedAction:
        'Backfill the halalStatus column in the source CSV before sizing. Default to halal_safe only if you can audit every SKU.',
    });
  }

  if (total < SMALL_SAMPLE_THRESHOLD) {
    out.push({
      id: 'small_sample_size',
      severity: 'info',
      title: 'Small SKU sample',
      detail: `Only ${total.toLocaleString()} SKUs imported — well below typical DC sizing engagements (1,000 – 20,000 SKUs). Slot-mix curves and labour scaling are non-linear at small samples.`,
      suggestedAction:
        'Confirm the master is complete. Use small-sample results as a directional sanity-check rather than a precise sizing.',
    });
  }

  const suppressed = stats.suppressedSkus;
  if (suppressed / total > SUPPRESSION_THRESHOLD) {
    out.push({
      id: 'high_suppression_rate',
      severity: 'warn',
      title: 'High suppression rate',
      detail: `${suppressed.toLocaleString()} of ${total.toLocaleString()} SKUs (${pct(suppressed / total)}) are being suppressed from sizing. Final footprint, labour, and dock counts reflect only ${(total - suppressed).toLocaleString()} active SKUs.`,
      suggestedAction:
        'Scrutinise the suppressed list. The engine drops these from every downstream step — if obsolete codes are mixed with live SKUs, the active count may be misleading.',
    });
  }

  return out;
}
