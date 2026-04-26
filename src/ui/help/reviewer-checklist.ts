// Phase 10.7.8 — Pre-flight reviewer checklist.
//
// Ten gates a reviewer (or the operator preparing for review) walks
// through before clicking "share with reviewer". Some items are
// automatic (data acknowledgement, fatal flags, engine has run);
// some are manual (tornado top-3 reviewed, calibration warnings
// scanned). Manual acknowledgements persist to localStorage scoped
// per engagement so reloads don't reset reviewer progress.
//
// Pure module — accepts a snapshot of relevant state and returns the
// computed list. The Outputs-tab modal component renders the list
// and offers Mark-as-reviewed buttons for the manual items.

import type { ValidationSummary } from '../../stores/engine.store';

export type ChecklistStatus = 'pass' | 'warn' | 'fail' | 'manual';

export interface ChecklistItem {
  id: string;
  /** Short label rendered as the row title. */
  title: string;
  /** Plain-English explainer of the gate. */
  description: string;
  /** Computed status — pass / warn / fail are auto; manual needs a human tick. */
  status: ChecklistStatus;
  /**
   * For manual items: whether the user has marked it reviewed in this
   * engagement (consumed from localStorage by the caller).
   */
  reviewed?: boolean;
  /** Optional suggested action when not yet passing. */
  suggestedAction?: string;
}

export interface ChecklistInput {
  hasActiveEngagement: boolean;
  skuCount: number;
  validation: ValidationSummary | null;
  validationAcknowledged: boolean;
  hasResult: boolean;
  feasibility: { overall: boolean; clearHeightOk: boolean; seismicOk: boolean; slabOk: boolean; envelopeOk: boolean } | null;
  hasTornado: boolean;
  openCommentCount: number;
  /** Manual acknowledgement flags loaded from localStorage. */
  manualAcks: Record<string, boolean>;
  /** Engagement region — confirms regional defaults loaded. */
  regionProfile: string | null;
}

const MANUAL_IDS = [
  'region_flags',
  'tornado_top3',
  'calibration_warnings',
  'key_citations',
] as const;
export type ManualAckId = (typeof MANUAL_IDS)[number];

export function isManualAckId(id: string): id is ManualAckId {
  return (MANUAL_IDS as readonly string[]).includes(id);
}

export const MANUAL_ACK_IDS: readonly ManualAckId[] = MANUAL_IDS;

export function computeChecklist(input: ChecklistInput): ChecklistItem[] {
  const out: ChecklistItem[] = [];

  // 1. Active engagement
  out.push({
    id: 'active_engagement',
    title: 'Active engagement open',
    description: 'A specific engagement must be selected so all subsequent gates are scoped.',
    status: input.hasActiveEngagement ? 'pass' : 'fail',
    suggestedAction: input.hasActiveEngagement
      ? undefined
      : 'Open an engagement on the Engagements tab.',
  });

  // 2. SKUs imported
  out.push({
    id: 'skus_imported',
    title: 'SKU master imported',
    description: 'CSV import has populated the SKU table for sizing.',
    status: input.skuCount > 0 ? 'pass' : 'fail',
    suggestedAction:
      input.skuCount > 0 ? undefined : 'Upload a CSV on the Inputs tab.',
  });

  // 3. Data quality acknowledged
  out.push({
    id: 'data_quality_ack',
    title: 'Data quality acknowledged',
    description:
      'Step 0 ValidationLayer reviewed and the acknowledgement hash locked to the current SKU set + halal flag.',
    status: input.validationAcknowledged ? 'pass' : 'fail',
    suggestedAction: input.validationAcknowledged
      ? undefined
      : 'Open the Inputs tab → Data Quality Dashboard, fix or suppress, then Acknowledge.',
  });

  // 4. Region flags confirmed (manual)
  out.push({
    id: 'region_flags',
    title: 'Region flags confirmed',
    description: `Regional profile ${input.regionProfile ? `(${input.regionProfile.toUpperCase()})` : ''} loads default Surau, halal, Ramadan, seismic, and SCDF rules. Confirm the wizard-set flags are right for this engagement.`,
    status: input.manualAcks.region_flags
      ? 'pass'
      : input.regionProfile
        ? 'manual'
        : 'fail',
    reviewed: !!input.manualAcks.region_flags,
    suggestedAction: input.manualAcks.region_flags
      ? undefined
      : 'Open the Engagements tab and review the regional flags. Then mark this item reviewed.',
  });

  // 5. Engine has run
  out.push({
    id: 'engine_ran',
    title: 'Engine ran on baseline',
    description: 'A baseline pipeline result is available — Steps 0–12 returned without error.',
    status: input.hasResult ? 'pass' : 'fail',
    suggestedAction: input.hasResult
      ? undefined
      : 'Click "Run engine on baseline" on the Scenarios tab.',
  });

  // 6. No fatal feasibility flags
  if (input.feasibility) {
    const failing: string[] = [];
    if (!input.feasibility.clearHeightOk) failing.push('clear height');
    if (!input.feasibility.seismicOk) failing.push('seismic mass');
    if (!input.feasibility.slabOk) failing.push('slab UDL');
    if (!input.feasibility.envelopeOk) failing.push('envelope fit');
    out.push({
      id: 'no_fatal_flags',
      title: 'No fatal feasibility flags',
      description: 'Steps 4.5, 4.6, 11 (slab + envelope) all pass.',
      status: input.feasibility.overall ? 'pass' : 'warn',
      suggestedAction: input.feasibility.overall
        ? undefined
        : `Failing: ${failing.join(', ')}. Address remediation in the Step 4.5 / 4.6 / 11 cards before sharing.`,
    });
  } else {
    out.push({
      id: 'no_fatal_flags',
      title: 'No fatal feasibility flags',
      description: 'Steps 4.5, 4.6, 11 (slab + envelope) all pass.',
      status: 'fail',
      suggestedAction: 'Run the engine first.',
    });
  }

  // 7. Tornado run + top-3 reviewed (manual)
  out.push({
    id: 'tornado_top3',
    title: 'Top 3 tornado sensitivities reviewed',
    description:
      'Tornado has been run AND the operator has eyeballed the top three footprint / FTE sensitivities. They are the parameters most likely to flip the conclusion.',
    status: !input.hasTornado
      ? 'fail'
      : input.manualAcks.tornado_top3
        ? 'pass'
        : 'manual',
    reviewed: !!input.manualAcks.tornado_top3,
    suggestedAction: !input.hasTornado
      ? 'Run the tornado from the Scenarios tab, then mark this item reviewed.'
      : input.manualAcks.tornado_top3
        ? undefined
        : 'Open the Scenarios tab, scan the top-3 tornado bars, then mark this item reviewed.',
  });

  // 8. Calibration warnings reviewed (manual)
  out.push({
    id: 'calibration_warnings',
    title: 'Calibration warnings reviewed',
    description:
      'The Inputs-tab Data Quality calibration panel has been read top-to-bottom. Distributional flags (CV outliers, partial history, suppression) have known explanations.',
    status: input.manualAcks.calibration_warnings ? 'pass' : 'manual',
    reviewed: !!input.manualAcks.calibration_warnings,
    suggestedAction: input.manualAcks.calibration_warnings
      ? undefined
      : 'Open the Inputs tab, read the Calibration panel, then mark this item reviewed.',
  });

  // 9. Comments triaged
  out.push({
    id: 'comments_triaged',
    title: 'Reviewer comments triaged',
    description: 'No open reviewer comments — every thread is resolved or marked won\'t-fix.',
    status: input.openCommentCount === 0 ? 'pass' : 'warn',
    suggestedAction:
      input.openCommentCount === 0
        ? undefined
        : `${input.openCommentCount} open thread${input.openCommentCount === 1 ? '' : 's'}. Resolve or mark won't-fix from the Comments panel.`,
  });

  // 10. Key citations read (manual)
  out.push({
    id: 'key_citations',
    title: 'Key citations and assumptions read',
    description:
      'Help dialog → Sources & citations + Calibration sections read once for this engagement; per-screen Assumptions drawer scanned on Inputs / Scenarios / Layout.',
    status: input.manualAcks.key_citations ? 'pass' : 'manual',
    reviewed: !!input.manualAcks.key_citations,
    suggestedAction: input.manualAcks.key_citations
      ? undefined
      : 'Open Help → Sources & citations + Calibration, then mark this item reviewed.',
  });

  return out;
}

/**
 * Convenience: percentage of pass-status rows.
 */
export function checklistProgress(items: ChecklistItem[]): {
  pass: number;
  total: number;
  pct: number;
  ready: boolean;
} {
  const pass = items.filter((i) => i.status === 'pass').length;
  const total = items.length;
  const pct = total > 0 ? Math.round((pass / total) * 100) : 0;
  // "ready" = every item is pass; warn / fail / manual still gates the share.
  const ready = items.every((i) => i.status === 'pass');
  return { pass, total, pct, ready };
}
