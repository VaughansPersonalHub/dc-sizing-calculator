import { useEffect, useState } from 'react';
import { Play, AlertTriangle, CheckCircle2, Loader2, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEngagementStore } from '../../stores/engagement.store';
import { useEngineStore } from '../../stores/engine.store';
import { useDataStore } from '../../stores/data.store';
import { runEngineForEngagement } from '../../engine/runner';
import { runTornadoForEngagement } from '../../engine/tornadoRunner';
import { TornadoChart, type TornadoMetric } from '../components/TornadoChart';
import type { TornadoResult } from '../../engine/tornado';
import {
  SHORTCUT_RUN_ENGINE_EVENT,
  SHORTCUT_RUN_TORNADO_EVENT,
} from '../hooks/useKeyboardShortcuts';
import { Tooltip } from '../components/Tooltip';
import { InfoTip } from '../components/InfoTip';
import { cn } from '../../utils/cn';

export function ScenariosTab() {
  const activeEngagementId = useEngagementStore((s) => s.activeEngagementId);
  const skuCount = useDataStore((s) => s.skuCount);
  const status = useEngineStore((s) => s.status);
  const progress = useEngineStore((s) => s.progress);
  const lastResult = useEngineStore((s) => s.lastResult) as EngineResultShape | null;
  const validation = useEngineStore((s) => s.lastValidation);
  const acknowledgedHash = useEngineStore((s) => s.validationAcknowledgedHash);

  const tornadoStatus = useEngineStore((s) => s.tornadoStatus);
  const tornadoProgress = useEngineStore((s) => s.tornadoProgress);
  const lastTornado = useEngineStore((s) => s.lastTornado) as TornadoResult | null;

  const automationLibrary = useDataStore((s) => s.libraries.automation);
  const [automationSystemId, setAutomationSystemId] = useState<string>('');

  const [error, setError] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState<string>('');
  const [tornadoMetric, setTornadoMetric] = useState<TornadoMetric>('footprint');

  const validationAcknowledged =
    validation !== null && validation.inputHash === acknowledgedHash;
  const canRun =
    !!activeEngagementId &&
    skuCount > 0 &&
    status !== 'running' &&
    validationAcknowledged;
  const canRunTornado =
    !!activeEngagementId && lastResult !== null && tornadoStatus !== 'running';

  async function onRun() {
    if (!activeEngagementId) return;
    setError(null);
    try {
      await runEngineForEngagement({
        engagementId: activeEngagementId,
        automationConfig: automationSystemId
          ? {
              system_id: automationSystemId,
              sizeToThroughputTarget: true,
              packingEfficiency: 0.82,
              motherChildMode: automationSystemId === 'pallet_shuttle_mother_child',
            }
          : undefined,
        onProgress: (_step, _total, label) => setProgressLabel(label),
      });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onRunTornado() {
    if (!activeEngagementId || !lastResult) return;
    setError(null);
    try {
      await runTornadoForEngagement({
        engagementId: activeEngagementId,
        // The pipeline result lives on the store as an unknown; we cast it
        // back to the typed shape that runTornado expects.
        baselineResult: lastResult as never,
      });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // Phase 9 — keyboard shortcuts. R fires the engine, T fires the tornado;
  // both ignored when the relevant guard rails (canRun / canRunTornado)
  // aren't met so the shortcut never crashes.
  useEffect(() => {
    function onRunShortcut() {
      if (canRun) void onRun();
    }
    function onTornadoShortcut() {
      if (canRunTornado) void onRunTornado();
    }
    document.addEventListener(SHORTCUT_RUN_ENGINE_EVENT, onRunShortcut);
    document.addEventListener(SHORTCUT_RUN_TORNADO_EVENT, onTornadoShortcut);
    return () => {
      document.removeEventListener(SHORTCUT_RUN_ENGINE_EVENT, onRunShortcut);
      document.removeEventListener(SHORTCUT_RUN_TORNADO_EVENT, onTornadoShortcut);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRun, canRunTornado, activeEngagementId, automationSystemId, lastResult]);

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-2xl font-semibold tracking-tight">Scenarios & Engine</h2>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Phase 4 · engine Steps 0–11
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Baseline scenario only for now. Steps 0–11 (validation → labour →
        MHE → docks → support areas → footprint roll-up) run in a Web
        Worker. Structural gates 4.5 (clear height), 4.6 (seismic mass)
        and 11 (slab UDL + envelope fit) determine feasibility. Tornado +
        scenario compare arrive in Phase 6.
      </p>

      {!activeEngagementId && (
        <Banner kind="warning">
          No engagement open. Pick one on the Engagements tab first.
        </Banner>
      )}
      {activeEngagementId && skuCount === 0 && (
        <Banner kind="warning">
          Engagement open but no SKUs imported. Use the Inputs tab to upload a CSV.
        </Banner>
      )}
      {activeEngagementId && skuCount > 0 && !validationAcknowledged && (
        <Banner kind="warning">
          Data Quality not yet acknowledged. Open the Inputs tab → Data Quality Dashboard,
          review issues, optionally apply auto-fixes, then click <strong>Acknowledge</strong>.{' '}
          <Link to="/inputs" className="underline">Go to Inputs</Link>.
        </Banner>
      )}

      <div className="rounded-md border border-border bg-card p-5 mt-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Tooltip
            content={
              <span>
                Runs Steps 0-12 of the engine pipeline against this engagement&apos;s SKU set, ops profile,
                and selected automation. Output drives the Layout tab and every export.{' '}
                <kbd className="font-mono">R</kbd>
              </span>
            }
            side="bottom"
          >
            <button
              type="button"
              disabled={!canRun}
              onClick={onRun}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-scc-charcoal text-scc-gold disabled:opacity-40"
            >
              {status === 'running' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Run engine on baseline
            </button>
          </Tooltip>

          <label className="text-xs flex items-center gap-1.5">
            <span className="text-muted-foreground">Automation:</span>
            <InfoTip
              content="Automation system that replaces conventional racking in Step 12. Each option has its own density, robot/port count, and throughput model. Conventional means no override — Steps 1-11 run as a standard pallet-rack DC."
              side="bottom"
            />
            <select
              className="text-xs bg-background border border-border rounded-md px-2 py-1"
              value={automationSystemId}
              onChange={(e) => setAutomationSystemId(e.target.value)}
              disabled={status === 'running'}
            >
              <option value="">Conventional (none)</option>
              {automationLibrary.map((a) => (
                <option key={a.system_id} value={a.system_id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          <div className="text-xs text-muted-foreground">
            {skuCount.toLocaleString()} SKUs · status {status}
            {status === 'running' && progress.total > 0 && (
              <> · step {progress.current}/{progress.total} {progressLabel && `(${progressLabel})`}</>
            )}
          </div>
        </div>
      </div>

      {error && (
        <Banner kind="error" className="mt-3">
          Engine error: {error}
        </Banner>
      )}

      {lastResult && (
        <ResultSummary result={lastResult} />
      )}

      {lastResult && (
        <div className="mt-6 rounded-md border border-border bg-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <Tooltip
              content={
                <span>
                  17-parameter sensitivity (SPEC §13). Each parameter swings ±25% (or its calibrated band);
                  the tool ranks impact on footprint or peak FTE. Use to find the most leverage-y design
                  decisions. <kbd className="font-mono">T</kbd>
                </span>
              }
              side="bottom"
            >
              <button
                type="button"
                disabled={!canRunTornado}
                onClick={onRunTornado}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-scc-charcoal text-scc-gold disabled:opacity-40"
              >
                {tornadoStatus === 'running' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <BarChart3 className="h-4 w-4" />
                )}
                Run tornado (17 params × low/high)
              </button>
            </Tooltip>
            <div className="text-xs text-muted-foreground">
              {tornadoStatus === 'running' && tornadoProgress.total > 0 && (
                <>
                  {tornadoProgress.current}/{tornadoProgress.total} variants
                </>
              )}
              {tornadoStatus === 'idle' && lastTornado && (
                <>
                  {lastTornado.summary.scenarios.length} variants ·{' '}
                  {lastTornado.summary.totalElapsedMs.toFixed(0)} ms ·{' '}
                  {lastTornado.feasibleVariantCount} feasible /{' '}
                  {lastTornado.infeasibleVariantCount} infeasible
                </>
              )}
            </div>
          </div>

          {lastTornado && (
            <>
              <div className="flex items-center gap-2 mb-2 text-xs">
                <span className="text-muted-foreground">Metric:</span>
                <Tooltip
                  content="Difference in total building GFA (m²) between baseline and each variant. Positive bars push the footprint up; negative bars pull it down."
                  side="top"
                >
                  <button
                    type="button"
                    className={cn(
                      'px-2 py-0.5 rounded',
                      tornadoMetric === 'footprint'
                        ? 'bg-scc-charcoal text-scc-gold'
                        : 'bg-card border border-border'
                    )}
                    onClick={() => setTornadoMetric('footprint')}
                  >
                    Footprint Δ (m²)
                  </button>
                </Tooltip>
                <Tooltip
                  content="Difference in peak-week labour headcount between baseline and each variant. Useful to find the parameters that most affect operating cost."
                  side="top"
                >
                  <button
                    type="button"
                    className={cn(
                      'px-2 py-0.5 rounded',
                      tornadoMetric === 'fte'
                        ? 'bg-scc-charcoal text-scc-gold'
                        : 'bg-card border border-border'
                    )}
                    onClick={() => setTornadoMetric('fte')}
                  >
                    Peak FTE Δ
                  </button>
                </Tooltip>
              </div>
              <div className="overflow-auto">
                <TornadoChart tornado={lastTornado} metric={tornadoMetric} />
              </div>
              <div className="mt-2 text-[10px] text-muted-foreground">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#0ea5e9] mr-1" />
                Low variant
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#f97316] ml-3 mr-1" />
                High variant
                <span className="ml-3">Hatched = infeasible</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface EngineResultShape {
  validation: {
    fatalErrors: { skuId: string; code: string; message: string }[];
    warnings: { skuId: string; code: string; message: string }[];
    suppressedSkus: string[];
    stats: {
      totalSkus: number;
      cleanSkus: number;
      warningSkus: number;
      fatalSkus: number;
      suppressedSkus: number;
      codesByCount: Record<string, number>;
    };
  };
  step1: { totals: { totalLinesPerDay: number; totalCubeVelocityCm3PerDay: number; countByVelocity: Record<string, number> } };
  step2: { peakYear: number };
  step3: { totals: { pfpPositions: number; clsLanes: number; shelfPositionsSmall: number; shelfPositionsMedium: number; shelfPositionsLarge: number; weightWarnings: number; repackSkus: number } };
  step4: Record<string, { zone: string; alignedBays: number; rawSlots: number }>;
  step4_5: { ok: boolean; shortfallLevels: number; requiredRackHeightMm: number; usableRackHeightMm: number };
  step4_6: { ok: boolean; seismicMassT: number; allowableMassT: number; remediation: string };
  step5: { totalAlignedAreaM2: number; averageGridEfficiency: number; zones: { zone: string; alignedAreaM2: number }[] };
  step6: { daily: { inboundPallets: number; outboundPallets: number; pickLinesPerDay: number }; peak: { inboundPallets: number; outboundPallets: number; pickLinesPerDay: number } };
  step7: {
    totalBaseFte: number;
    totalPeakFte: number;
    availability: number;
    ramadanAnnualImpact: number;
    ftePerCategory: Record<string, number>;
    warnings: string[];
  };
  step8: {
    totalUnits: number;
    totalChargingFootprintM2: number;
    totalChargingKva: number;
    fleets: { mhe_id: string; category: string; fleetCount: number; batteryType: string }[];
  };
  step9: {
    totalDoors: number;
    inbound: { doorsRequired: number; blendedCycleMin: number; containersPerDay: number };
    outbound: { doorsRequired: number; blendedCycleMin: number; containersPerDay: number };
    staging: { totalM2: number; fastCrossDockM2: number; qcDecantM2: number };
  };
  step10: {
    totalSupportM2: number;
    operationalSupportM2: number;
    officeAndAmenitiesM2: number;
    halalUpliftFactor: number;
    areas: {
      office: number;
      surau: number;
      ablution: number;
      battery: number;
      vas: number;
      returns: number;
      qc: number;
      customs: number;
      tempAntechamber: number;
    };
    warnings: string[];
  };
  step12: {
    systemId: string;
    category: string;
    replacedZoneArea: number;
    replacedFootprintDelta: number;
    robotCount: number;
    portCount: number;
    throughputCapacityPerHour: number;
    requiredPeakPerHour: number;
    meetsThroughput: boolean;
    frontEndDepthM: number;
    frontEndAreaM2: number;
    estimatedKva: number;
    warnings: string[];
  } | null;
  step11: {
    rollup: {
      operationalM2: number;
      officeAndAmenitiesM2: number;
      buildingFootprintGfaM2: number;
      canopyAreaM2: number;
      canopyCountedInCoverage: boolean;
      siteCoverageM2: number;
      siteAreaM2: number;
      softSpace: { phase2HorizontalM2: number; phase2VerticalM2: number; totalM2: number };
      conventionalRackedM2: number;
      automationSwapped: boolean;
      automationSavingsM2: number;
    };
    structural: {
      staticSlabUdlTPerM2: number;
      slabLoadingTPerM2: number;
      slabFailure: boolean;
      overEnvelope: boolean;
      envelopeShortfallM2: number;
    };
    feasibilityFlags: { slab: boolean; seismic: boolean; envelope: boolean; clearHeight: boolean };
    infeasible: boolean;
  };
  feasibility: {
    clearHeightOk: boolean;
    seismicOk: boolean;
    slabOk: boolean;
    envelopeOk: boolean;
    overall: boolean;
  };
  meta: { schemaVersion: number; durationMs: number; skuCount: number; suppressedCount: number; completedAt: string };
}

function ResultSummary({ result }: { result: EngineResultShape }) {
  const ok = result.feasibility.overall;
  return (
    <div className="mt-5 space-y-4">
      <div
        className={cn(
          'rounded-md border px-4 py-3 flex items-start gap-2',
          ok
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
            : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
        )}
      >
        {ok ? <CheckCircle2 className="h-4 w-4 mt-0.5" /> : <AlertTriangle className="h-4 w-4 mt-0.5" />}
        <div className="text-sm">
          <strong>{ok ? 'Feasible' : 'Infeasible'}</strong> — completed in{' '}
          {result.meta.durationMs.toFixed(0)} ms · {result.meta.skuCount.toLocaleString()} SKUs ·{' '}
          {result.meta.suppressedCount} suppressed · peak year {result.step2.peakYear}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card title="Validation">
          <Stat label="Total SKUs" v={result.validation.stats.totalSkus} />
          <Stat label="Clean" v={result.validation.stats.cleanSkus} />
          <Stat label="Warnings" v={result.validation.stats.warningSkus} />
          <Stat label="Fatal" v={result.validation.stats.fatalSkus} />
        </Card>

        <Card title="Throughput">
          <Stat label="Daily inbound pallets" v={result.step6.daily.inboundPallets.toFixed(1)} />
          <Stat label="Daily outbound pallets" v={result.step6.daily.outboundPallets.toFixed(1)} />
          <Stat label="Daily pick lines" v={result.step6.daily.pickLinesPerDay.toFixed(0)} />
          <Stat label="Peak pick lines" v={result.step6.peak.pickLinesPerDay.toFixed(0)} />
        </Card>

        <Card title="Slot sizing">
          <Stat label="PFP positions" v={result.step3.totals.pfpPositions} />
          <Stat label="CLS lanes" v={result.step3.totals.clsLanes} />
          <Stat label="Shelf S/M/L" v={`${result.step3.totals.shelfPositionsSmall}/${result.step3.totals.shelfPositionsMedium}/${result.step3.totals.shelfPositionsLarge}`} />
          <Stat label="Repack SKUs" v={result.step3.totals.repackSkus} />
        </Card>

        <Card title="Footprint">
          <Stat label="Total aligned m²" v={Math.round(result.step5.totalAlignedAreaM2).toLocaleString()} />
          <Stat label="Grid efficiency" v={(result.step5.averageGridEfficiency * 100).toFixed(0) + '%'} />
          <Stat label="Zones" v={result.step5.zones.length} />
        </Card>

        <Card title="Step 4.5 · Clear height">
          <Stat label="Status" v={result.step4_5.ok ? '✓ ok' : '✗ shortfall'} />
          <Stat label="Required rack" v={`${(result.step4_5.requiredRackHeightMm / 1000).toFixed(2)} m`} />
          <Stat label="Usable rack" v={`${(result.step4_5.usableRackHeightMm / 1000).toFixed(2)} m`} />
          {!result.step4_5.ok && <Stat label="Shortfall levels" v={result.step4_5.shortfallLevels} />}
        </Card>

        <Card title="Step 4.6 · Seismic mass">
          <Stat label="Status" v={result.step4_6.ok ? '✓ ok' : '✗ exceeds'} />
          <Stat label="Seismic mass" v={`${result.step4_6.seismicMassT.toFixed(0)} t`} />
          <Stat label="Allowable" v={`${result.step4_6.allowableMassT.toFixed(0)} t`} />
          {!result.step4_6.ok && <Stat label="Remediation" v={result.step4_6.remediation} />}
        </Card>

        <Card title="Step 7 · Labour">
          <Stat label="Base FTE" v={result.step7.totalBaseFte.toFixed(1)} />
          <Stat label="Peak FTE" v={result.step7.totalPeakFte.toFixed(1)} />
          <Stat label="Availability" v={(result.step7.availability * 100).toFixed(0) + '%'} />
          {result.step7.ramadanAnnualImpact > 0 && (
            <Stat label="Ramadan impact" v={(result.step7.ramadanAnnualImpact * 100).toFixed(1) + '%'} />
          )}
          {result.step7.warnings.length > 0 && (
            <Stat label="Warnings" v={result.step7.warnings.join(', ')} />
          )}
        </Card>

        <Card title="Step 8 · MHE Fleet">
          <Stat label="Total units" v={result.step8.totalUnits} />
          <Stat label="Charging area" v={`${result.step8.totalChargingFootprintM2.toFixed(0)} m²`} />
          <Stat label="Charging kVA" v={result.step8.totalChargingKva.toFixed(0)} />
          {result.step8.fleets.map((f) => (
            <Stat key={f.mhe_id} label={f.mhe_id} v={`${f.fleetCount} (${f.batteryType})`} />
          ))}
        </Card>

        <Card title="Step 9 · Docks">
          <Stat label="Inbound doors" v={result.step9.inbound.doorsRequired} />
          <Stat label="Outbound doors" v={result.step9.outbound.doorsRequired} />
          <Stat label="Total" v={result.step9.totalDoors} />
          <Stat label="Inbound cycle" v={`${result.step9.inbound.blendedCycleMin.toFixed(1)} min`} />
          <Stat label="Staging area" v={`${result.step9.staging.totalM2.toFixed(0)} m²`} />
        </Card>

        <Card title="Step 10 · Support areas">
          <Stat label="Operational support" v={`${result.step10.operationalSupportM2.toFixed(0)} m²`} />
          <Stat label="Office + amenities" v={`${result.step10.officeAndAmenitiesM2.toFixed(0)} m²`} />
          {result.step10.areas.surau > 0 && (
            <Stat label="Surau + ablution" v={`${(result.step10.areas.surau + result.step10.areas.ablution).toFixed(0)} m²`} />
          )}
          {result.step10.areas.customs > 0 && (
            <Stat label="Customs" v={`${result.step10.areas.customs.toFixed(0)} m²`} />
          )}
          {result.step10.halalUpliftFactor > 0 && (
            <Stat label="Halal uplift" v={`+${(result.step10.halalUpliftFactor * 100).toFixed(0)}%`} />
          )}
        </Card>

        <Card title="Step 11 · Footprint roll-up">
          <Stat label="Operational" v={`${result.step11.rollup.operationalM2.toFixed(0)} m²`} />
          <Stat label="GFA (building)" v={`${result.step11.rollup.buildingFootprintGfaM2.toFixed(0)} m²`} />
          <Stat label="Canopy" v={`${result.step11.rollup.canopyAreaM2.toFixed(0)} m² ${result.step11.rollup.canopyCountedInCoverage ? '(counted)' : '(exempt)'}`} />
          <Stat label="Site area" v={`${result.step11.rollup.siteAreaM2.toFixed(0)} m²`} />
          <Stat label="Soft-space" v={`${result.step11.rollup.softSpace.totalM2.toFixed(0)} m²`} />
          {result.step11.rollup.automationSwapped && (
            <Stat label="Auto. savings" v={`${result.step11.rollup.automationSavingsM2.toFixed(0)} m²`} />
          )}
        </Card>

        {result.step12 && (
          <Card title="Step 12 · Automation override">
            <Stat label="System" v={result.step12.systemId} />
            <Stat label="Category" v={result.step12.category} />
            <Stat label="Robots" v={result.step12.robotCount} />
            {result.step12.portCount > 0 && <Stat label="Ports" v={result.step12.portCount} />}
            <Stat label="Throughput" v={`${result.step12.throughputCapacityPerHour.toFixed(0)} / hr`} />
            <Stat label="Required peak" v={`${result.step12.requiredPeakPerHour.toFixed(0)} / hr`} />
            <Stat label="Meets peak" v={result.step12.meetsThroughput ? '✓' : '✗'} />
            <Stat label="Auto. zone" v={`${result.step12.replacedZoneArea.toFixed(0)} m²`} />
            <Stat label="Front-end" v={`${result.step12.frontEndAreaM2.toFixed(0)} m²`} />
            <Stat label="kVA" v={result.step12.estimatedKva.toFixed(0)} />
          </Card>
        )}

        <Card title="Step 11 · Structural">
          <Stat label="Slab" v={result.feasibility.slabOk ? '✓ ok' : '✗ overload'} />
          <Stat label="Static UDL" v={`${result.step11.structural.staticSlabUdlTPerM2.toFixed(2)} t/m²`} />
          <Stat label="Slab capacity" v={`${result.step11.structural.slabLoadingTPerM2.toFixed(1)} t/m²`} />
          <Stat label="Envelope fit" v={result.feasibility.envelopeOk ? '✓ ok' : `✗ short ${result.step11.structural.envelopeShortfallM2.toFixed(0)} m²`} />
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
        {title}
      </h3>
      <ul className="space-y-1 text-xs">{children}</ul>
    </div>
  );
}

function Stat({ label, v }: { label: string; v: number | string }) {
  return (
    <li className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{v}</span>
    </li>
  );
}

function Banner({
  kind,
  className,
  children,
}: {
  kind: 'warning' | 'error';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'px-3 py-2 rounded-md text-xs flex items-start gap-2',
        kind === 'warning'
          ? 'bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400'
          : 'bg-destructive/10 border border-destructive/30 text-destructive',
        className
      )}
    >
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}
