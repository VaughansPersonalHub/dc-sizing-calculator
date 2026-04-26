// Phase 10.7.7 — Per-step confidence score.
//
// Combines three signals into one 0-100 score:
//   1. Data quality (clean SKUs / total SKUs from Step 0)
//   2. Library confidence (1.0 = SPEC default, lower if the library
//      defaults are overridden in ways the engine hasn't been tested
//      against — placeholder hook for the cost / WMS / multi-region
//      future work)
//   3. Per-step sensitivity (HIGH = noisy output, LOW = stable output)
//
// Surfaced as a ConfidenceChip beside each step's benchmark chips, so
// a reviewer sees at a glance which numbers to trust.

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ConfidenceScore {
  /** 0-100 — exposed for tests + the chip tooltip. */
  score: number;
  /** Bucketed label rendered on the chip. */
  level: ConfidenceLevel;
  /** Plain-English breakdown for the tooltip. */
  detail: {
    dataQualityPct: number;
    libraryConfidencePct: number;
    sensitivityFactor: number;
    sensitivityLabel: string;
  };
}

/**
 * Map a step explainer's free-text sensitivity field to a numeric
 * factor in the [0.65, 1.0] range. The label is fuzzy-matched against
 * the start of the sentence so wording tweaks don't break the
 * mapping.
 */
function sensitivityFactor(sensitivity: string): { factor: number; label: string } {
  const head = sensitivity.trim().toUpperCase();
  if (head.startsWith('HIGH')) return { factor: 0.7, label: 'HIGH' };
  if (head.startsWith('MODERATE')) return { factor: 0.85, label: 'MODERATE' };
  if (head.startsWith('LOW')) return { factor: 1.0, label: 'LOW' };
  if (head.startsWith('BINARY')) return { factor: 0.95, label: 'BINARY' };
  if (head.startsWith('META')) return { factor: 0.95, label: 'META' };
  // Unknown header → treat as moderate, the safest middle ground.
  return { factor: 0.85, label: 'MODERATE' };
}

export interface ComputeConfidenceInput {
  /** Step explainer sensitivity sentence. */
  sensitivity: string;
  /** Step 0 stats — clean / total = base data-quality fraction. */
  totalSkus: number;
  cleanSkus: number;
  /**
   * Library confidence override. Defaults to 1.0 (SPEC defaults). Drop
   * below 1.0 when the engagement has overridden libraries in ways the
   * engine has not been calibrated against (placeholder for X.1 cost
   * libraries / X.5 WMS imports).
   */
  libraryConfidence?: number;
}

export function computeConfidence(input: ComputeConfidenceInput): ConfidenceScore {
  const dataQ = input.totalSkus > 0 ? input.cleanSkus / input.totalSkus : 1;
  const libraryConfidence = input.libraryConfidence ?? 1;
  const { factor, label } = sensitivityFactor(input.sensitivity);
  const score01 = Math.max(0, Math.min(1, dataQ * libraryConfidence * factor));
  const score = Math.round(score01 * 100);
  const level: ConfidenceLevel = score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low';
  return {
    score,
    level,
    detail: {
      dataQualityPct: Math.round(dataQ * 100),
      libraryConfidencePct: Math.round(libraryConfidence * 100),
      sensitivityFactor: factor,
      sensitivityLabel: label,
    },
  };
}
