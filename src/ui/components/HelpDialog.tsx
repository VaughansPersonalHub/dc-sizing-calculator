// Phase 10.1 — Help & Reference modal.
//
// Mounted once at TabShell scope. Opened by the "?" keyboard shortcut
// (via SHORTCUT_SHOW_HELP_EVENT), the Help icon in the header, or
// programmatically. Closes on Esc, click-outside, or the X button.
//
// Sections grow over later chunks: 10.2 adds per-step explainers, 10.3
// adds limitations, 10.6 adds calibration benchmarks. They land as
// extra <Section> blocks here pulling from src/ui/help/content.ts.

import { useEffect, useRef, type ComponentType } from 'react';
import { X, Keyboard, Map as MapIcon, BookOpen, Cpu } from 'lucide-react';
import { KEYBOARD_SHORTCUTS, TAB_MAP, GLOSSARY } from '../help/content';
import { STEP_EXPLAINERS } from '../help/step-explainers';
import { StepExplainerCard } from './StepExplainer';

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

export function HelpDialog({ open, onClose }: HelpDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative w-full max-w-3xl max-h-[85vh] overflow-auto rounded-lg bg-card border border-border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-dialog-title"
      >
        <div className="sticky top-0 bg-card border-b border-border px-6 py-3 flex items-center justify-between z-10">
          <h2
            id="help-dialog-title"
            className="text-lg font-semibold tracking-tight"
          >
            Help &amp; Reference
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close help"
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-8 text-sm">
          <Section icon={Keyboard} title="Keyboard shortcuts">
            <ul className="space-y-1.5">
              {KEYBOARD_SHORTCUTS.map((s) => (
                <li key={s.description} className="flex items-start gap-3">
                  <span className="flex gap-1 shrink-0 mt-0.5">
                    {s.keys.map((k) => (
                      <kbd
                        key={k}
                        className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono border border-border"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                  <span className="text-muted-foreground">{s.description}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Shortcuts are ignored while typing in any input or text area, and any
              modifier (Ctrl / Cmd / Alt) is passed through to the OS or browser.
            </p>
          </Section>

          <Section icon={MapIcon} title="Tab map">
            <ul className="space-y-3">
              {TAB_MAP.map((t) => (
                <li key={t.tab}>
                  <h4 className="font-medium">{t.tab}</h4>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {t.purpose}
                  </p>
                  <p className="text-xs leading-relaxed">{t.whenToUse}</p>
                </li>
              ))}
            </ul>
          </Section>

          <Section icon={Cpu} title="Engine steps · how each one works">
            <p className="text-xs text-muted-foreground mb-3">
              One card per engine step (Step 0 → Step 14). Click to expand for the
              formula, inputs, outputs, assumptions, and sensitivity. Anchor URLs
              like <code>#step-7-labour</code> jump straight to a step.
            </p>
            <div className="space-y-2">
              {STEP_EXPLAINERS.map((s) => (
                <StepExplainerCard key={s.id} data={s} />
              ))}
            </div>
          </Section>

          <Section icon={BookOpen} title="Glossary">
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5 text-xs">
              {GLOSSARY.map((g) => (
                <div key={g.term}>
                  <dt className="font-mono font-medium">{g.term}</dt>
                  <dd className="text-muted-foreground leading-relaxed">
                    {g.definition}
                  </dd>
                </div>
              ))}
            </dl>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground mb-2.5">
        <Icon className="h-4 w-4" />
        {title}
      </h3>
      {children}
    </section>
  );
}
