// Phase 10.4 — first-run intro tour.
//
// 7-step modal overlay walking a new user / sceptical reviewer through
// the happy path. Auto-opens once per browser (localStorage-gated);
// can be replayed from the Help dialog at any time.

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Sparkles, X } from 'lucide-react';
import { TOUR_STEPS, markTourSeen, type TourStep } from '../help/tour-steps';
import { cn } from '../../utils/cn';

interface IntroTourProps {
  open: boolean;
  onClose: () => void;
  /** Optional starting step (1-indexed). Defaults to 1. */
  startAt?: number;
}

export function IntroTour({ open, onClose, startAt = 1 }: IntroTourProps) {
  // Mount the content fresh on every open transition so internal state
  // resets cleanly without a setState-in-effect.
  if (!open) return null;
  return <IntroTourContent onClose={onClose} startAt={startAt} />;
}

interface IntroTourContentProps {
  onClose: () => void;
  startAt: number;
}

function IntroTourContent({ onClose, startAt }: IntroTourContentProps) {
  const [stepIndex, setStepIndex] = useState(() =>
    Math.max(0, Math.min(TOUR_STEPS.length - 1, startAt - 1))
  );
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        markTourSeen('skipped');
        onClose();
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const step: TourStep = TOUR_STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  function handleNext() {
    if (isLast) {
      handleComplete();
      return;
    }
    setStepIndex((i) => Math.min(TOUR_STEPS.length - 1, i + 1));
  }
  function handleBack() {
    if (isFirst) return;
    setStepIndex((i) => Math.max(0, i - 1));
  }
  function handleSkip() {
    markTourSeen('skipped');
    onClose();
  }
  function handleComplete() {
    markTourSeen('completed');
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center md:justify-end p-4 md:p-6"
      role="presentation"
    >
      <div
        className="relative w-full max-w-md rounded-lg bg-card border border-border shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-tour-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-scc-gold" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Intro · {step.index} of {TOUR_STEPS.length}
            </span>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={handleSkip}
            aria-label="Skip intro tour"
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
            {step.tab}
          </div>
          <h3 id="intro-tour-title" className="text-base font-semibold tracking-tight mb-2">
            {step.title}
          </h3>
          <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
            {step.body}
          </div>
          {step.tip && (
            <div className="mt-3 px-3 py-2 rounded-md bg-scc-gold/10 border border-scc-gold/30 text-[11px] leading-relaxed">
              <span className="font-medium text-scc-gold">Tip · </span>
              <span className="text-foreground/90">{step.tip}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/30">
          <div className="flex items-center gap-1.5">
            {TOUR_STEPS.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === stepIndex
                    ? 'w-6 bg-scc-gold'
                    : i < stepIndex
                      ? 'w-1.5 bg-scc-gold/60'
                      : 'w-1.5 bg-muted-foreground/30'
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBack}
              disabled={isFirst}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
            <button
              type="button"
              onClick={handleSkip}
              className="text-xs px-2.5 py-1.5 rounded-md hover:bg-accent text-muted-foreground"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-scc-charcoal text-scc-gold"
            >
              {isLast ? 'Got it' : 'Next'}
              {!isLast && <ArrowRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
