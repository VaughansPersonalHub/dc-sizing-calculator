// Phase 8 — Outputs tab.
//
// Surfaces every export the SPEC §12 calls for. Chunk 1 ships the
// Schedule of Areas (multi-sheet Excel via SheetJS) and the flat
// Assumptions CSV. Chunks 2 + 3 add Summary PDF, PPT tornado, and the
// .scc snapshot round-trip.

import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  FileType,
  Layers,
  Upload,
} from 'lucide-react';
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
import {
  downloadSccSnapshot,
  importSccSnapshot,
} from '../../exports/scc-snapshot';
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
  const [pptBuilding, setPptBuilding] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

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

  const downloadPpt = async () => {
    if (!lastTornado) return;
    setPptBuilding(true);
    try {
      // pptxgenjs is also heavy — lazy-load.
      const { buildTornadoPptBlob } = await import('../../exports/tornado-ppt');
      const blob = await buildTornadoPptBlob({
        tornado: lastTornado,
        engagementName,
        regionProfile: region,
      });
      triggerDownload(blob, `${fileBase}-tornado.pptx`);
    } finally {
      setPptBuilding(false);
    }
  };

  const downloadScc = async () => {
    if (!activeEngagementId) return;
    await downloadSccSnapshot(activeEngagementId, fileBase);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const out = await importSccSnapshot(file);
      setImportMessage(
        `Imported engagement ${out.engagementId} (.scc v${out.schemaVersion}, exported ${out.exportedAt}).`
      );
    } catch (err) {
      setImportMessage(
        `Import failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      // Reset so the same file can be re-imported.
      e.target.value = '';
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

        <ExportCard
          icon={<Layers className="h-4 w-4" />}
          title="Tornado deck (PPT)"
          description="Three-slide PowerPoint: title slide, native horizontal-bar tornado chart of the top 10 footprint sensitivities, and a full ranked sensitivity table with FTE deltas + feasibility tags."
          phase="Chunk 3"
          disabled={!lastTornado || pptBuilding}
          buttonLabel={pptBuilding ? 'Building…' : 'Download'}
          onClick={() => {
            void downloadPpt();
          }}
        />

        <ExportCard
          icon={<FileText className="h-4 w-4" />}
          title=".scc snapshot (export)"
          description="Compressed engagement archive (gzipped JSON envelope, schema v2). Round-trips into any SCConnect DC Sizing instance — same format R2 uses internally."
          phase="Chunk 3"
          disabled={!activeEngagementId}
          onClick={() => {
            void downloadScc();
          }}
        />

        <SccImportCard
          inputRef={importInputRef}
          onFileChange={handleImport}
        />
      </div>

      {importMessage && (
        <div className="mt-3">
          <Banner kind={importMessage.startsWith('Import failed') ? 'error' : 'success'}>
            {!importMessage.startsWith('Import failed') && (
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            )}
            <span>{importMessage}</span>
          </Banner>
        </div>
      )}
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

function SccImportCard({
  inputRef,
  onFileChange,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Upload className="h-4 w-4" />
        <h3 className="text-sm font-semibold">.scc snapshot (import)</h3>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
          Chunk 3
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Restore an engagement from a previously-exported <code>.scc</code>
        archive. Replaces every row scoped to the embedded engagement id —
        SKUs, scenarios, ops profile.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".scc,application/octet-stream"
        onChange={(e) => {
          void onFileChange(e);
        }}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-sm border border-border hover:bg-accent"
      >
        Choose .scc file…
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
