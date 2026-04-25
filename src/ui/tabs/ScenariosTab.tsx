import { useState } from 'react';
import { Play, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEngagementStore } from '../../stores/engagement.store';
import { useEngineStore } from '../../stores/engine.store';
import { useDataStore } from '../../stores/data.store';
import { runEngineForEngagement } from '../../engine/runner';
import { cn } from '../../utils/cn';

export function ScenariosTab() {
  const activeEngagementId = useEngagementStore((s) => s.activeEngagementId);
  const skuCount = useDataStore((s) => s.skuCount);
  const status = useEngineStore((s) => s.status);
  const progress = useEngineStore((s) => s.progress);
  const lastResult = useEngineStore((s) => s.lastResult) as EngineResultShape | null;
  const validation = useEngineStore((s) => s.lastValidation);
  const acknowledgedHash = useEngineStore((s) => s.validationAcknowledgedHash);
  const [error, setError] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState<string>('');

  const validationAcknowledged =
    validation !== null && validation.inputHash === acknowledgedHash;
  const canRun =
    !!activeEngagementId &&
    skuCount > 0 &&
    status !== 'running' &&
    validationAcknowledged;

  async function onRun() {
    if (!activeEngagementId) return;
    setError(null);
    try {
      await runEngineForEngagement({
        engagementId: activeEngagementId,
        onProgress: (_step, _total, label) => setProgressLabel(label),
      });
    } catch (err) {
      setError((err as Error).message);
    }
  }

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
        <div className="flex items-center gap-3">
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
        </Card>

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
