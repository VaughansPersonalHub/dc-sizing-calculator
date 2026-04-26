// Phase 8 — Outputs tab.
//
// Surfaces every export the SPEC §12 calls for. Chunk 1 ships the
// Schedule of Areas (multi-sheet Excel via SheetJS) and the flat
// Assumptions CSV. Chunks 2 + 3 add Summary PDF, PPT tornado, and the
// .scc snapshot round-trip.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, FileSpreadsheet, FileText, FileType } from 'lucide-react';
import { useEngineStore } from '../../stores/engine.store';
import { useEngagementStore } from '../../stores/engagement.store';
import { db } from '../../db/schema';
import type { PipelineOutputs } from '../../engine/pipeline';
import type { TornadoResult } from '../../engine/tornado';
import {
  buildScheduleOfAreasWorkbook,
  workbookToArrayBuffer,
} from '../../exports/schedule-of-areas';
import { buildAssumptionsCsv } from '../../exports/assumptions-csv';
import { triggerDownload, fileBaseFromName } from '../../exports/download';
import { cn } from '../../utils/cn';

export function OutputsTab() {
  const lastResult = useEngineStore((s) => s.lastResult) as PipelineOutputs | null;
  const lastTornado = useEngineStore((s) => s.lastTornado) as TornadoResult | null;
  const activeEngagementId = useEngagementStore((s) => s.activeEngagementId);
  const engagement = useEngagementStore((s) => {
    const id = s.activeEngagementId;
    if (!id) return null;
    return s.availableEngagements.find((e) => e.id === id) ?? null;
  });
  const regionProfile = useEngagementStore((s) => s.regionProfile);
  const [pdfBuilding, setPdfBuilding] = useState(false);

  const fileBase = fileBaseFromName(engagement?.name);
  const engagementName = engagement?.name;
  const region = regionProfile ?? undefined;

  const downloadSchedule = () => {
    if (!lastResult) return;
    const wb = buildScheduleOfAreasWorkbook({
      result: lastResult,
      engagementName,
      regionProfile: region,
    });
    const buf = workbookToArrayBuffer(wb);
    triggerDownload(
      new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `${fileBase}-schedule-of-areas.xlsx`
    );
  };

  const downloadAssumptions = async () => {
    if (!activeEngagementId) return;
    const opsProfile = await db.opsProfiles.get(activeEngagementId);
    if (!opsProfile) return;
    const csv = buildAssumptionsCsv({
      opsProfile,
      engagementName,
      regionProfile: region,
    });
    triggerDownload(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      `${fileBase}-assumptions.csv`
    );
  };

  const downloadPdf = async () => {
    if (!lastResult) return;
    setPdfBuilding(true);
    try {
      // Dynamic-import keeps react-pdf (~1.7 MB) out of the entry chunk.
      const { renderSummaryPdf } = await import('../../exports/pdf-renderer');
      const blob = await renderSummaryPdf({
        result: lastResult,
        engagementName,
        regionProfile: region,
        tornado: lastTornado,
      });
      triggerDownload(blob, `${fileBase}-summary.pdf`);
    } finally {
      setPdfBuilding(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-2xl font-semibold tracking-tight">Outputs</h2>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Phase 8 · export panel
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Download artefacts derived from the latest engine run and ops
        profile. Run the engine on the{' '}
        <Link to="/scenarios" className="underline">
          Scenarios tab
        </Link>{' '}
        first; the Schedule of Areas pulls from <code>step1..step12</code>
        and the Assumptions CSV reflects the ops profile in <code>data.store</code>.
      </p>

      {!lastResult && (
        <Banner kind="warning">
          No engine result yet — run the engine before exporting the
          Schedule of Areas.
        </Banner>
      )}
      {!activeEngagementId && (
        <Banner kind="warning">
          No active engagement — open one on the Engagements tab to enable
          the Assumptions CSV export.
        </Banner>
      )}

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <ExportCard
          icon={<FileSpreadsheet className="h-4 w-4" />}
          title="Schedule of Areas (Excel)"
          description="Multi-sheet workbook: summary, storage zones, labour, MHE fleet, dock schedule, support areas, footprint roll-up, automation (when applied), feasibility."
          phase="Chunk 1"
          disabled={!lastResult}
          onClick={downloadSchedule}
        />

        <ExportCard
          icon={<FileText className="h-4 w-4" />}
          title="Assumptions CSV"
          description="Flat dump of every ops-profile knob — productivity, peak uplift, DSOH per bucket, soft space, regional defaults, tornado weights — for spreadsheet review."
          phase="Chunk 1"
          disabled={!activeEngagementId}
          onClick={() => {
            void downloadAssumptions();
          }}
        />

        <ExportCard
          icon={<FileType className="h-4 w-4" />}
          title="Summary report (PDF)"
          description="Cover page with feasibility verdict, key metrics (footprint, FTE, MHE, docks), schedule of areas, and the latest tornado top-10 sensitivities (when run)."
          phase="Chunk 2"
          disabled={!lastResult || pdfBuilding}
          buttonLabel={pdfBuilding ? 'Building…' : 'Download'}
          onClick={() => {
            void downloadPdf();
          }}
        />
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        <strong>Coming next (Phase 8 Chunk 3):</strong> Tornado deck
        (pptxgenjs) + .scc snapshot import / export.
      </p>
    </div>
  );
}

function ExportCard({
  icon,
  title,
  description,
  phase,
  disabled,
  onClick,
  buttonLabel,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  phase: string;
  disabled: boolean;
  onClick: () => void;
  buttonLabel?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
          {phase}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{description}</p>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-sm border border-border',
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-accent'
        )}
      >
        {buttonLabel ?? 'Download'}
      </button>
    </div>
  );
}

function Banner({
  kind,
  children,
}: {
  kind: 'warning' | 'error' | 'success';
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'px-3 py-2 rounded-md text-xs flex items-start gap-2',
        kind === 'warning'
          ? 'bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400'
          : kind === 'error'
            ? 'bg-destructive/10 border border-destructive/30 text-destructive'
            : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
      )}
    >
      {kind !== 'success' && <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
      <div>{children}</div>
    </div>
  );
}
