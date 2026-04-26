// Phase 2.5 — Data Quality Dashboard.
// SPEC §7. Surfaces Step 0 ValidationLayer output and lets the user run
// the four supported auto-fixes before acknowledging the SKU set as
// engine-ready. Lives below the CSV upload area on the Inputs tab.

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ShieldCheck,
  Loader2,
  ListChecks,
  Info,
  Gauge,
} from 'lucide-react';
import { useEngagementStore } from '../../../stores/engagement.store';
import { useDataStore } from '../../../stores/data.store';
import { useEngineStore } from '../../../stores/engine.store';
import {
  runStandaloneValidation,
  applyAutoFixesToEngagement,
} from '../../../engine/standaloneValidation';
import type { ValidationSummary } from '../../../stores/engine.store';
import { db } from '../../../db/schema';
import { cn } from '../../../utils/cn';
import { Tooltip } from '../Tooltip';
import { InfoTip } from '../InfoTip';
import {
  computeCalibrationWarnings,
  type CalibrationWarning,
} from '../../help/calibration-warnings';

interface FixToggles {
  clampNegativeDemand: boolean;
  suppressZeroDemand: boolean;
  capCv: boolean;
  normaliseChannelMix: boolean;
}

const ALL_OFF: FixToggles = {
  clampNegativeDemand: false,
  suppressZeroDemand: false,
  capCv: false,
  normaliseChannelMix: false,
};

const CODE_LABELS: Record<string, string> = {
  ZERO_DEMAND: 'All weekly demand zero',
  NEGATIVE_DEMAND: 'Negative weekly demand point(s)',
  ZERO_CASE_QTY: 'caseQty must be > 0',
  IMPOSSIBLE_PALLET_CONFIG: 'Pallet id missing from library',
  PALLET_WEIGHT_EXCEEDS_RACK: 'Computed pallet load exceeds pallet max',
  INBOUND_OUTBOUND_MISMATCH: 'Inbound and outbound pallets differ — repack',
  MISSING_CHANNEL_MIX: 'channelMix does not sum to 1.0',
  CV_OUTLIER: 'CV > 3 — likely data spike',
  UNIT_CUBE_IMPOSSIBLE: 'unitCubeCm3 must be > 0',
  MISSING_HALAL_STATUS: 'halalStatus unclassified on halal-certified engagement',
  PARTIAL_HISTORY: '<26 weeks of demand history',
  SEASONAL_TAG_MISSING: 'isEventDrivenSeasonal but no seasonalEventTag',
};

export function DataQualityDashboard() {
  const activeEngagementId = useEngagementStore((s) => s.activeEngagementId);
  const skuCount = useDataStore((s) => s.skuCount);
  const validation = useEngineStore((s) => s.lastValidation);
  const acknowledgedHash = useEngineStore((s) => s.validationAcknowledgedHash);
  const setValidation = useEngineStore((s) => s.setValidation);
  const acknowledge = useEngineStore((s) => s.acknowledgeValidation);

  const [running, setRunning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggles, setToggles] = useState<FixToggles>({ ...ALL_OFF });
  const [lastFixSummary, setLastFixSummary] = useState<{ before: number; after: number } | null>(null);

  // Auto-run on mount + whenever the SKU count changes (eg after a CSV
  // import or a fix application).
  useEffect(() => {
    if (!activeEngagementId || skuCount === 0) {
      setValidation(null);
      return;
    }
    void runValidation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEngagementId, skuCount]);

  async function runValidation() {
    if (!activeEngagementId) return;
    setRunning(true);
    setError(null);
    try {
      const engagement = await db.engagements.get(activeEngagementId);
      if (!engagement) throw new Error('engagement not found in Dexie');
      const summary = await runStandaloneValidation({ engagement });
      setValidation(summary);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function applyFixes() {
    if (!activeEngagementId) return;
    if (!Object.values(toggles).some(Boolean)) return;
    setApplying(true);
    setError(null);
    try {
      const result = await applyAutoFixesToEngagement(activeEngagementId, toggles);
      setLastFixSummary({ before: result.before, after: result.after });
      // Re-run validation so the dashboard reflects the post-fix state.
      await runValidation();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setApplying(false);
    }
  }

  if (!activeEngagementId) return null;

  if (skuCount === 0) {
    return (
      <div className="mt-6 rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
        <ListChecks className="h-4 w-4 mx-auto mb-1 opacity-60" />
        Data Quality Dashboard activates once a CSV is imported.
      </div>
    );
  }

  const acknowledged =
    validation !== null && validation.inputHash === acknowledgedHash;

  return (
    <section className="mt-8">
      <div className="flex items-baseline gap-2 mb-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Data Quality Dashboard</h3>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground ml-2">
          Phase 2.5 · Step 0 ValidationLayer
        </span>
        <div className="flex-1" />
        <Tooltip
          content="Re-runs Step 0 ValidationLayer over the current SKU set in Dexie. Useful after editing SKUs in the Reference tab or fixing data outside the app."
          side="left"
        >
          <button
            type="button"
            onClick={runValidation}
            disabled={running}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded hover:bg-accent disabled:opacity-40"
          >
            <RefreshCw className={cn('h-3 w-3', running && 'animate-spin')} />
            Re-run
          </button>
        </Tooltip>
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-xs">
          {error}
        </div>
      )}

      {!validation && running && (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 mx-auto animate-spin mb-2" />
          Running Step 0…
        </div>
      )}

      {validation && (
        <>
          <div
            className={cn(
              'rounded-md border px-4 py-3 mb-3 flex items-start gap-2 text-xs',
              acknowledged
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : validation.fatalErrors.length > 0
                  ? 'border-destructive/30 bg-destructive/10 text-destructive'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
            )}
          >
            {acknowledged ? (
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            ) : validation.fatalErrors.length > 0 ? (
              <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            )}
            <div className="flex-1">
              <div className="font-medium">
                {acknowledged
                  ? 'Acknowledged — engine ready to run on this SKU set'
                  : validation.fatalErrors.length > 0
                    ? `${validation.fatalErrors.length} fatal error(s) — fix or suppress before running engine`
                    : 'Warnings only — review and acknowledge to enable the engine'}
              </div>
              <div className="text-[11px] mt-1 opacity-80">
                {validation.stats.totalSkus.toLocaleString()} SKUs · {validation.stats.cleanSkus.toLocaleString()} clean ·{' '}
                {validation.stats.warningSkus.toLocaleString()} warning ·{' '}
                {validation.stats.fatalSkus.toLocaleString()} fatal · {validation.stats.suppressedSkus.toLocaleString()} suppressed
              </div>
            </div>
            {!acknowledged && (
              <Tooltip
                content="Locks the Step 0 result hash to the current SKU set + halal flag. The engine refuses to run until acknowledged. Re-imports or auto-fix applications drop the lock."
                side="left"
              >
                <button
                  type="button"
                  onClick={acknowledge}
                  disabled={validation.fatalErrors.length > 0}
                  className="ml-3 px-3 py-1.5 rounded-md text-[11px] bg-scc-charcoal text-scc-gold disabled:opacity-40"
                >
                  Acknowledge
                </button>
              </Tooltip>
            )}
          </div>

          <CalibrationPanel validation={validation} />

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border bg-card p-4">
              <h4 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Issues by code
              </h4>
              {Object.keys(validation.stats.codesByCount).length === 0 ? (
                <p className="text-xs text-muted-foreground">No issues found.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {Object.entries(validation.stats.codesByCount)
                    .sort((a, b) => b[1] - a[1])
                    .map(([code, count]) => (
                      <li key={code} className="flex items-baseline justify-between gap-3">
                        <div className="flex flex-col">
                          <span className="font-mono text-[11px] tracking-tight">{code}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {CODE_LABELS[code] ?? code}
                          </span>
                        </div>
                        <span className="font-mono tabular-nums">{count}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>

            <div className="rounded-md border border-border bg-card p-4">
              <h4 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Auto-fix actions
              </h4>
              <div className="space-y-1.5 text-xs">
                <FixToggle
                  label="Clamp negative weekly demand to zero"
                  hint={`${countByCode(validation, 'NEGATIVE_DEMAND')} SKUs affected`}
                  tooltip="Replaces negative weekly demand points with 0. Common cause: returns net-out errors in the source WMS, or extract-time arithmetic on shipped-vs-returned units."
                  checked={toggles.clampNegativeDemand}
                  onChange={(v) => setToggles((t) => ({ ...t, clampNegativeDemand: v }))}
                />
                <FixToggle
                  label="Suppress zero-demand SKUs"
                  hint={`${countByCode(validation, 'ZERO_DEMAND')} SKUs would be dropped`}
                  tooltip="Skips SKUs with all-zero 52-week demand from engine sizing. They still appear in the SKU master and counts; the engine just won't allocate space or labour for them."
                  checked={toggles.suppressZeroDemand}
                  onChange={(v) => setToggles((t) => ({ ...t, suppressZeroDemand: v }))}
                />
                <FixToggle
                  label="Cap CV outliers at 3.0 (winsorise)"
                  hint={`${countByCode(validation, 'CV_OUTLIER')} SKUs above threshold`}
                  tooltip="Winsorises the demand series so a single spike week (e.g. event launch, data error) doesn't blow out peak uplift. Soft cap — magnitude is preserved up to CV=3."
                  checked={toggles.capCv}
                  onChange={(v) => setToggles((t) => ({ ...t, capCv: v }))}
                />
                <FixToggle
                  label="Normalise channel mix to sum to 1.0"
                  hint={`${countByCode(validation, 'MISSING_CHANNEL_MIX')} SKUs need rescale`}
                  tooltip="Rescales channelMix when the input sums to ~0.95-1.05 (rounding-error band). Hard mismatches (sum < 0.5 or > 1.5) still error — don't silently fix bad data."
                  checked={toggles.normaliseChannelMix}
                  onChange={(v) => setToggles((t) => ({ ...t, normaliseChannelMix: v }))}
                />
              </div>

              <div className="mt-3 flex items-center gap-2">
                <Tooltip
                  content="Applies the checked fixes to the SKU set in Dexie via the repository (engine cache invalidates). Drops the acknowledgement lock; re-validates after."
                  side="top"
                >
                  <button
                    type="button"
                    onClick={applyFixes}
                    disabled={
                      applying || !Object.values(toggles).some(Boolean) || running
                    }
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-scc-charcoal text-scc-gold disabled:opacity-40"
                  >
                    {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Apply selected fixes
                  </button>
                </Tooltip>
                {lastFixSummary && (
                  <span className="text-[10px] text-muted-foreground">
                    Last apply: {lastFixSummary.before.toLocaleString()} → {lastFixSummary.after.toLocaleString()} SKUs
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function countByCode(v: ValidationSummary, code: string): number {
  return v.stats.codesByCount[code] ?? 0;
}

function CalibrationPanel({ validation }: { validation: ValidationSummary }) {
  const warnings = computeCalibrationWarnings(validation);
  const warnCount = warnings.filter((w) => w.severity === 'warn').length;
  const infoCount = warnings.filter((w) => w.severity === 'info').length;

  return (
    <div className="rounded-md border border-border bg-card p-4 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          Calibration
        </h4>
        <InfoTip
          content="Distributional checks over the SKU set as a whole — not individual rows. Looks for outlier groups, partial-history density, small-sample sizing, and other patterns that affect how confident a reviewer should be in the engine output."
          side="right"
        />
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground">
          {warnings.length === 0
            ? 'No flags'
            : `${warnCount} warn · ${infoCount} info`}
        </span>
      </div>

      {warnings.length === 0 ? (
        <p className="text-xs text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          SKU set passes distributional checks — outputs are within calibration range.
        </p>
      ) : (
        <ul className="space-y-2 text-xs">
          {warnings.map((w) => (
            <CalibrationWarningRow key={w.id} warning={w} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CalibrationWarningRow({ warning }: { warning: CalibrationWarning }) {
  const Icon = warning.severity === 'warn' ? AlertTriangle : Info;
  const colourClass =
    warning.severity === 'warn'
      ? 'text-amber-700 dark:text-amber-400'
      : 'text-sky-700 dark:text-sky-400';
  return (
    <li className="flex items-start gap-2">
      <Icon className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', colourClass)} />
      <div className="flex-1 leading-snug">
        <div className={cn('font-medium', colourClass)}>{warning.title}</div>
        <div className="text-foreground/90 mt-0.5">{warning.detail}</div>
        <div className="text-muted-foreground mt-0.5 italic">
          → {warning.suggestedAction}
        </div>
      </div>
    </li>
  );
}

function FixToggle({
  label,
  hint,
  tooltip,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  tooltip?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-scc-gold"
      />
      <div className="flex-1 leading-tight">
        <div className="flex items-center gap-1.5">
          <span>{label}</span>
          {tooltip && <InfoTip content={tooltip} side="top" label={`About: ${label}`} />}
        </div>
        <div className="text-[10px] text-muted-foreground">{hint}</div>
      </div>
    </label>
  );
}
