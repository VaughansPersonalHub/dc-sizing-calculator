// Phase 10.7.5 — Plain-English narrative card.
//
// Lives at the top of Scenarios + Outputs. Auto-generates a 1-2
// paragraph summary of the engagement so a reviewer with no domain
// context can read four sentences and know what the engine sized,
// whether it is feasible, and what moves the number most.

import { Sparkles } from 'lucide-react';
import { buildNarrative, type NarrativeInput } from '../help/narrative';
import type { TornadoResult } from '../../engine/tornado';
import { cn } from '../../utils/cn';

interface NarrativeCardProps {
  result: NarrativeInput;
  tornado?: TornadoResult | null;
  className?: string;
}

export function NarrativeCard({ result, tornado, className }: NarrativeCardProps) {
  const narrative = buildNarrative(result, tornado ?? null);
  return (
    <section
      aria-label="Engagement narrative summary"
      className={cn(
        'rounded-md border bg-card p-4 space-y-3',
        narrative.feasible
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : 'border-amber-500/30 bg-amber-500/5',
        className
      )}
    >
      <header className="flex items-center gap-2">
        <Sparkles
          className={cn(
            'h-4 w-4',
            narrative.feasible ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
          )}
        />
        <h3 className="text-sm font-semibold tracking-tight">In plain English</h3>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
          Auto-generated
        </span>
      </header>
      <p className="text-sm leading-relaxed text-foreground/95">{narrative.summary}</p>
      <ul className="text-[11.5px] grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground">
        {narrative.bullets.map((b) => (
          <li key={b} className="leading-snug">
            · {b}
          </li>
        ))}
      </ul>
    </section>
  );
}
