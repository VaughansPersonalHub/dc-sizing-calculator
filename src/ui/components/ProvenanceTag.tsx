// Phase 10.7.4 — Provenance popover.
//
// Click any output value's "↗" tag → popover surfaces the inputs +
// derivation + sensitivity + citation pulled from PROVENANCE +
// STEP_EXPLAINERS + CITATIONS. Reverse-traceable: from any number on
// the page, two clicks to "where did this come from?".

import { useState, useRef, useEffect } from 'react';
import { Network, X } from 'lucide-react';
import { findProvenance } from '../help/provenance';
import { STEP_EXPLAINERS } from '../help/step-explainers';
import { CITATIONS } from '../help/citations';
import { cn } from '../../utils/cn';

interface ProvenanceTagProps {
  outputId: string;
  className?: string;
}

export function ProvenanceTag({ outputId, className }: ProvenanceTagProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const entry = findProvenance(outputId);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    }
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDocClick, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDocClick, true);
    };
  }, [open]);

  if (!entry) return null;

  const explainer = STEP_EXPLAINERS.find((s) => s.id === entry.stepExplainerId);
  const citation = entry.citationTopic
    ? CITATIONS.find((c) => c.topic === entry.citationTopic)
    : undefined;

  return (
    <span ref={ref} className={cn('relative inline-flex', className)}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label={`Show provenance for ${entry.label}`}
        aria-expanded={open}
        className={cn(
          'inline-flex items-center justify-center text-[10px] text-muted-foreground hover:text-scc-gold rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          'h-3.5 w-3.5'
        )}
      >
        <Network className="h-3 w-3" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={`Provenance for ${entry.label}`}
          className="absolute z-30 right-0 top-full mt-1.5 w-80 rounded-md border border-border bg-card shadow-lg p-3 text-xs space-y-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-semibold text-foreground leading-snug">
              Provenance · {entry.label}
            </h4>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close provenance"
              className="text-muted-foreground hover:text-foreground -mt-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            From {explainer?.title ?? entry.stepExplainerId}
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
              Inputs
            </div>
            <ul className="list-disc list-outside pl-4 space-y-0.5">
              {entry.inputs.map((i) => (
                <li key={i} className="leading-snug">
                  {i}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
              Derivation
            </div>
            <p className="leading-snug">{entry.derivation}</p>
          </div>

          {explainer?.formula && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                Formula
              </div>
              <pre className="font-mono text-[10.5px] leading-snug bg-muted/40 rounded px-2 py-1.5 whitespace-pre-wrap">
                {explainer.formula}
              </pre>
            </div>
          )}

          {explainer?.sensitivity && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                Sensitivity
              </div>
              <p className="leading-snug">{explainer.sensitivity}</p>
            </div>
          )}

          {citation && (
            <div className="pt-1.5 mt-1.5 border-t border-border">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                Source
              </div>
              <p className="leading-snug">
                <strong>{citation.source}</strong> — {citation.reference}
              </p>
              {citation.url && (
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-scc-gold hover:underline font-mono text-[10.5px]"
                >
                  {citation.url}
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
