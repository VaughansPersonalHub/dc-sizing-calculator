// Phase 10.7.1 — Per-screen assumptions drawer.
//
// Floating button bottom-right of every tab. Click expands a side
// panel listing the assumptions THIS screen consumes — pulled from
// src/ui/help/tab-assumptions.ts. Each citation entry summarises the
// load-bearing value + source and links into the full CITATIONS entry
// in HelpDialog.
//
// Goal: a sceptical reviewer never needs to leave the screen they're
// reading to find out where a number came from. Per-tab filtering
// keeps the panel short — Scenarios shows seven items, Outputs shows
// two.

import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ScrollText, X } from 'lucide-react';
import { TAB_ASSUMPTIONS, type TabId } from '../help/tab-assumptions';
import { CITATIONS } from '../help/citations';
import { cn } from '../../utils/cn';

const PATH_TO_TAB: Record<string, TabId> = {
  '/engagements': 'engagements',
  '/inputs': 'inputs',
  '/reference': 'reference',
  '/design-rules': 'design-rules',
  '/scenarios': 'scenarios',
  '/outputs': 'outputs',
  '/layout': 'layout',
};

interface AssumptionsDrawerProps {
  /** Hook to open the HelpDialog when the user clicks a citation. */
  onShowHelp?: () => void;
}

export function AssumptionsDrawer({ onShowHelp }: AssumptionsDrawerProps) {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const tabId = Object.entries(PATH_TO_TAB).find(([prefix]) =>
    location.pathname.startsWith(prefix)
  )?.[1];
  if (!tabId) return null;

  const items = TAB_ASSUMPTIONS[tabId];
  if (!items || items.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'fixed right-3 bottom-3 z-30 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs shadow transition',
          open
            ? 'border-scc-gold bg-scc-charcoal text-scc-gold'
            : 'border-border bg-card hover:bg-accent text-foreground'
        )}
        aria-label={open ? 'Hide assumptions' : 'Show assumptions for this tab'}
        aria-expanded={open}
      >
        <ScrollText className="h-3.5 w-3.5" />
        Assumptions
        <span
          className={cn(
            'ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 rounded-full text-[10px] font-mono',
            open ? 'bg-scc-gold/20' : 'bg-muted'
          )}
        >
          {items.length}
        </span>
      </button>

      {open && (
        <aside
          role="region"
          aria-label="Assumptions on this tab"
          className="fixed right-3 bottom-12 z-30 w-80 max-h-[70vh] overflow-auto rounded-md border border-border bg-card shadow-lg"
        >
          <div className="sticky top-0 bg-card border-b border-border px-3 py-2 flex items-center justify-between z-10">
            <h3 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
              Assumptions on this tab
            </h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close assumptions panel"
              className="p-0.5 text-muted-foreground hover:text-foreground rounded hover:bg-accent"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ul className="p-3 space-y-2.5 text-xs">
            {items.map((item, i) => (
              <li key={`${tabId}-${i}`}>
                {item.citationTopic ? (
                  <CitationItem topic={item.citationTopic} onShowHelp={onShowHelp} />
                ) : (
                  <p className="text-foreground/90 leading-snug">{item.text}</p>
                )}
              </li>
            ))}
          </ul>
        </aside>
      )}
    </>
  );
}

function CitationItem({
  topic,
  onShowHelp,
}: {
  topic: string;
  onShowHelp?: () => void;
}) {
  const c = CITATIONS.find((x) => x.topic === topic);
  if (!c) return null;
  return (
    <div className="rounded border border-border/60 bg-muted/30 p-2 leading-snug">
      <div className="font-medium text-foreground">{c.topic}</div>
      <div className="font-mono text-[10.5px] mt-0.5 mb-1">{c.value}</div>
      <div className="text-muted-foreground text-[10.5px]">
        <strong>{c.source}</strong>
      </div>
      {onShowHelp && (
        <button
          type="button"
          onClick={onShowHelp}
          className="mt-1 text-[10.5px] text-scc-gold hover:underline"
        >
          See full citation in /help →
        </button>
      )}
    </div>
  );
}
