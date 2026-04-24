import { useState, useRef, useCallback } from 'react';
import { FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import { useEngagementStore } from '../../stores/engagement.store';
import { useDataStore } from '../../stores/data.store';
import {
  ingestSkuCsv,
  replaceSkus,
  clearSkus,
  appendSkuBatch,
  type IngestionProgress,
  type IngestionStats,
} from '../../ingestion';
import { cn } from '../../utils/cn';

export function InputsTab() {
  const activeEngagementId = useEngagementStore((s) => s.activeEngagementId);
  const skuCount = useDataStore((s) => s.skuCount);
  const lastImportAt = useDataStore((s) => s.lastImportAt);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<IngestionProgress | null>(null);
  const [stats, setStats] = useState<IngestionStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const onPickFile = useCallback(() => fileInputRef.current?.click(), []);

  const onFile = useCallback(
    async (file: File) => {
      if (!activeEngagementId) {
        setError('Open an engagement first (Engagements tab).');
        return;
      }
      setError(null);
      setStats(null);
      setRunning(true);
      try {
        // Replace semantics: every import supersedes the previous SKU set.
        await clearSkus(activeEngagementId);
        const result = await ingestSkuCsv(file, {
          engagementId: activeEngagementId,
          onProgress: setProgress,
          onBatch: (batch) => appendSkuBatch(batch),
        });
        setStats(result);
        useDataStore.getState().setSkuCount(result.acceptedRows);
        useDataStore.getState().markImport();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setRunning(false);
        setProgress(null);
      }
    },
    [activeEngagementId]
  );

  const onClear = useCallback(async () => {
    if (!activeEngagementId) return;
    if (!confirm('Delete every SKU for this engagement? This cannot be undone.')) return;
    await replaceSkus(activeEngagementId, []);
    setStats(null);
  }, [activeEngagementId]);

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-2xl font-semibold tracking-tight">Inputs</h2>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Phase 2 · SKU ingestion
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Upload a SKU CSV. Each row becomes a <code>SkuRecord</code> with a{' '}
        <code>Float32Array</code> of 52 weekly demand points. Validation runs at the CSV boundary
        (Zod) — rows failing schema or weekly-demand checks are surfaced below and not persisted.
      </p>

      {!activeEngagementId && (
        <div className="mb-4 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs">
          No engagement open. Pick one on the Engagements tab first.
        </div>
      )}

      <div
        className={cn(
          'rounded-lg border-2 border-dashed border-border p-8 text-center',
          running && 'opacity-60'
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void onFile(f);
        }}
      >
        <FileSpreadsheet className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm mb-3">
          Drop a <strong>.csv</strong> here, or{' '}
          <button
            type="button"
            onClick={onPickFile}
            disabled={!activeEngagementId || running}
            className="underline text-scc-gold hover:opacity-80 disabled:opacity-40 disabled:no-underline"
          >
            choose a file
          </button>
          .
        </p>
        <p className="text-[11px] text-muted-foreground max-w-xl mx-auto">
          Required columns: <code>id</code>, <code>name</code>, <code>category</code>,{' '}
          <code>unitCubeCm3</code>, <code>unitWeightKg</code>, <code>caseQty</code>,{' '}
          <code>inboundPalletId</code>, <code>outboundPalletId</code>, <code>palletTi</code>,{' '}
          <code>palletHi</code>, <code>stackable</code>, <code>tempClass</code>,{' '}
          <code>channel_retailB2b</code>, <code>channel_ecomDtc</code>,{' '}
          <code>channel_marketplace</code>, and <code>week_01</code>–<code>week_52</code>.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = '';
          }}
        />
      </div>

      {running && progress && (
        <div className="mt-4 rounded-md border border-border bg-card px-4 py-3">
          <div className="flex items-center gap-2 text-xs mb-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="font-medium capitalize">{progress.phase}</span>
            <span className="text-muted-foreground ml-auto">
              {progress.parsedRows.toLocaleString()} parsed · {progress.acceptedRows.toLocaleString()} accepted · {progress.rejectedRows.toLocaleString()} rejected
            </span>
          </div>
          <ProgressBar value={progress.parsedRows} />
        </div>
      )}

      {error && (
        <div className="mt-4 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-start gap-2">
          <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {stats && (
        <div className="mt-4 rounded-md border border-border overflow-hidden">
          <div className="px-4 py-3 bg-muted/40 flex items-center gap-2">
            {stats.rejectedRows === 0 ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            )}
            <h3 className="text-sm font-medium">
              Imported {stats.acceptedRows.toLocaleString()} / {stats.totalRows.toLocaleString()} SKUs in{' '}
              {(stats.durationMs / 1000).toFixed(2)}s
            </h3>
            <span className="ml-auto text-[11px] text-muted-foreground">
              {stats.rejectedRows > 0
                ? `${stats.rejectedRows.toLocaleString()} rejected`
                : 'all rows accepted'}
            </span>
          </div>
          {stats.errors.length > 0 && (
            <div className="px-4 py-3 text-xs">
              <p className="text-muted-foreground mb-2">
                First {Math.min(stats.errors.length, 10)} errors (of {stats.errors.length}):
              </p>
              <ul className="space-y-1 font-mono text-[11px]">
                {stats.errors.slice(0, 10).map((e, i) => (
                  <li key={i} className="text-destructive">
                    <span className="text-muted-foreground">{e.skuId}</span> · {e.field} ·{' '}
                    {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          In engagement: <strong className="font-mono text-foreground">{skuCount.toLocaleString()}</strong> SKUs
        </span>
        {lastImportAt && (
          <span>· last imported {new Date(lastImportAt).toLocaleTimeString()}</span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClear}
          disabled={!activeEngagementId || skuCount === 0 || running}
          className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-accent disabled:opacity-40"
        >
          Clear all SKUs
        </button>
      </div>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  // Indeterminate-ish: width scales with log(rows) to keep visually moving
  // on big files. Actual % is impossible without knowing row total up-front.
  const pct = Math.min(100, (Math.log10(value + 1) / 5) * 100);
  return (
    <div className="h-1 w-full rounded bg-muted overflow-hidden">
      <div
        className="h-full bg-scc-gold transition-all duration-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

