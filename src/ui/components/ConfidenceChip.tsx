// Phase 10.7.7 — Per-step confidence chip.
//
// Renders the computeConfidence output beside the BenchmarkChips on
// each result Card. Pure visual — the score logic is in
// src/ui/help/confidence.ts so it can be unit-tested without React.

import { ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import type { ConfidenceScore } from '../help/confidence';
import { Tooltip } from './Tooltip';
import { cn } from '../../utils/cn';

interface ConfidenceChipProps {
  score: ConfidenceScore;
  className?: string;
}

const STYLES: Record<ConfidenceScore['level'], string> = {
  high: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  medium: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  low: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400',
};

export function ConfidenceChip({ score, className }: ConfidenceChipProps) {
  const Icon =
    score.level === 'high' ? ShieldCheck : score.level === 'medium' ? ShieldAlert : ShieldX;
  const label =
    score.level === 'high' ? 'High' : score.level === 'medium' ? 'Medium' : 'Low';
  return (
    <Tooltip
      side="bottom"
      content={
        <div className="space-y-1.5 max-w-[16rem]">
          <div className="font-semibold">Confidence · {score.score}/100</div>
          <div className="text-[10.5px] opacity-90 leading-snug">
            Data quality × library confidence × sensitivity factor.
          </div>
          <ul className="text-[10.5px] font-mono space-y-0.5">
            <li>
              <span className="opacity-70">Data quality: </span>
              {score.detail.dataQualityPct}%
            </li>
            <li>
              <span className="opacity-70">Library: </span>
              {score.detail.libraryConfidencePct}%
            </li>
            <li>
              <span className="opacity-70">Sensitivity: </span>
              {score.detail.sensitivityLabel} (×{score.detail.sensitivityFactor.toFixed(2)})
            </li>
          </ul>
          <div className="text-[10px] opacity-70 italic leading-snug">
            High = trust the number; low = treat as a directional sanity check.
          </div>
        </div>
      }
    >
      <span
        role="status"
        aria-label={`${label} confidence (${score.score} of 100)`}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none',
          STYLES[score.level],
          className
        )}
      >
        <Icon className="h-3 w-3" aria-hidden="true" />
        <span>{label}</span>
        <span className="font-mono opacity-80">{score.score}</span>
      </span>
    </Tooltip>
  );
}
