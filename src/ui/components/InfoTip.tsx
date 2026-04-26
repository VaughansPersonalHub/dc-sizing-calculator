// Phase 10.1 — inline (i) help expander.
//
// Pairs a Tooltip with a Lucide Info icon. Use inline next to a label
// or input when the field needs a longer explanation than fits in a
// placeholder.

import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { Tooltip, type TooltipSide } from './Tooltip';
import { cn } from '../../utils/cn';

interface InfoTipProps {
  content: ReactNode;
  side?: TooltipSide;
  /** Screen-reader label for the icon button. Default "More info". */
  label?: string;
  className?: string;
}

export function InfoTip({
  content,
  side = 'top',
  label = 'More info',
  className,
}: InfoTipProps) {
  return (
    <Tooltip content={content} side={side}>
      <button
        type="button"
        aria-label={label}
        className={cn(
          'inline-flex items-center justify-center align-middle text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded-full',
          className
        )}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}
