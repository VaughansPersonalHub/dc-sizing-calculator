// Phase 10.2 — collapsible explainer card for one engine step.
//
// Surfaced in two places:
//   1. Below each result Card on the Scenarios tab (lazy expand).
//   2. As an entry in the HelpDialog "Engine steps" section.
// Both consume the same StepExplainer record from src/ui/help/step-explainers.ts.

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { StepExplainer } from '../help/step-explainers';
import { cn } from '../../utils/cn';

interface StepExplainerCardProps {
  data: StepExplainer;
  /** Initial expand state. Default false. */
  defaultOpen?: boolean;
  /** Override the heading rendered at the top of the card. */
  headingLevel?: 'h3' | 'h4';
  /** Add an extra className on the root for tighter integration. */
  className?: string;
}

export function StepExplainerCard({
  data,
  defaultOpen = false,
  headingLevel = 'h4',
  className,
}: StepExplainerCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const Heading = headingLevel;

  return (
    <div
      id={data.id}
      className={cn(
        'rounded-md border border-border bg-card scroll-mt-16',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent/50"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <Heading className="font-medium tracking-tight flex-1">
          <span className="text-muted-foreground">How it works · </span>
          {data.title}
        </Heading>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Step {data.number}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3 text-xs border-t border-border">
          <Section label="What it computes">{data.what}</Section>

          <Section label="Formula">
            <pre className="font-mono text-[11px] leading-relaxed bg-muted/40 rounded px-2 py-1.5 whitespace-pre-wrap">
              {data.formula}
            </pre>
          </Section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Section label="Inputs">
              <ul className="list-disc list-outside pl-4 space-y-0.5">
                {data.inputs.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </Section>

            <Section label="Outputs">
              <ul className="list-disc list-outside pl-4 space-y-0.5">
                {data.outputs.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </Section>
          </div>

          <Section label="Assumptions baked in">
            <ul className="list-disc list-outside pl-4 space-y-0.5">
              {data.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Section>

          <Section label="Sensitivity">
            <span className="text-foreground">{data.sensitivity}</span>
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
        {label}
      </div>
      <div className="text-foreground/90 leading-snug">{children}</div>
    </div>
  );
}
