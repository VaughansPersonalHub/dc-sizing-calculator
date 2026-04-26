// Phase 10.6a — Industry-benchmark chip.
//
// Renders one engine output value next to its industry-typical band,
// status-coloured (green ✓ in band / amber ⚠ near band / red ✗ outside)
// with a Tooltip exposing sources and notes. Mounted on the Scenarios
// tab beneath the per-step result cards; reused by the Calibration
// section in HelpDialog (10.6c).

import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import {
  classifyBenchmark,
  type Benchmark,
  type BenchmarkStatus,
} from '../help/benchmarks';
import { Tooltip } from './Tooltip';
import { cn } from '../../utils/cn';

interface BenchmarkChipProps {
  benchmark: Benchmark;
  /** Computed metric value. When null, the chip renders nothing — the metric is N/A for this run. */
  value: number | null;
  /** Tooltip side. Defaults to 'top'. */
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

const STATUS_STYLES: Record<BenchmarkStatus, string> = {
  ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  near: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  outside: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400',
};

const STATUS_LABEL: Record<BenchmarkStatus, string> = {
  ok: 'within typical range',
  near: 'near edge of typical range',
  outside: 'outside typical range',
};

function formatValue(b: Benchmark, value: number): string {
  if (b.format) return b.format(value);
  return `${value.toFixed(2)} ${b.unit}`.trim();
}

function formatBand(b: Benchmark): string {
  const fmt = b.format ?? ((v: number) => `${v.toFixed(2)} ${b.unit}`.trim());
  return `${fmt(b.band.low)} – ${fmt(b.band.high)}`;
}

export function BenchmarkChip({ benchmark, value, side = 'top', className }: BenchmarkChipProps) {
  if (value === null || !Number.isFinite(value)) return null;

  const status = classifyBenchmark(value, benchmark.band);
  const Icon =
    status === 'ok' ? CheckCircle2 : status === 'near' ? AlertTriangle : XCircle;

  return (
    <Tooltip
      side={side}
      content={
        <div className="space-y-1.5 max-w-[18rem]">
          <div className="font-semibold">{benchmark.label}</div>
          <div className="opacity-90 leading-snug">{benchmark.description}</div>
          <div className="font-mono text-[11px]">
            <span className="opacity-70">Your value: </span>
            <strong>{formatValue(benchmark, value)}</strong>
          </div>
          <div className="font-mono text-[11px]">
            <span className="opacity-70">Industry typical: </span>
            <strong>{formatBand(benchmark)}</strong>
          </div>
          <div className="text-[10px] uppercase tracking-wider opacity-70">
            Status: {STATUS_LABEL[status]}
          </div>
          {benchmark.sources.length > 0 && (
            <div className="pt-1 border-t border-white/15 mt-1 text-[10.5px] leading-snug space-y-0.5">
              {benchmark.sources.map((s) => (
                <div key={s.name}>
                  <strong>{s.name}</strong> — {s.reference}
                </div>
              ))}
            </div>
          )}
          {benchmark.notes && (
            <div className="pt-1 text-[10.5px] italic opacity-90">{benchmark.notes}</div>
          )}
        </div>
      }
    >
      <span
        role="status"
        aria-label={`${benchmark.label}: ${formatValue(benchmark, value)} — ${STATUS_LABEL[status]} (industry typical ${formatBand(benchmark)})`}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none',
          STATUS_STYLES[status],
          className
        )}
      >
        <Icon className="h-3 w-3" aria-hidden="true" />
        <span className="font-mono">{formatValue(benchmark, value)}</span>
        <span className="opacity-70">vs {formatBand(benchmark)}</span>
      </span>
    </Tooltip>
  );
}
