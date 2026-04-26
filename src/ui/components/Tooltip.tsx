// Phase 10.1 — accessible Tooltip primitive.
//
// Custom (no Radix dep — CLAUDE.md locks the stack). Renders a small
// floating panel above the trigger on hover/focus, hides on
// mouseleave/blur/Escape. aria-describedby wires the trigger to the
// tooltip while it's visible.

import { useId, useState, type ReactNode, type KeyboardEvent } from 'react';
import { cn } from '../../utils/cn';

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: TooltipSide;
  className?: string;
}

const SIDE_CLASS: Record<TooltipSide, string> = {
  top: 'bottom-full mb-1.5 left-1/2 -translate-x-1/2',
  bottom: 'top-full mt-1.5 left-1/2 -translate-x-1/2',
  left: 'right-full mr-1.5 top-1/2 -translate-y-1/2',
  right: 'left-full ml-1.5 top-1/2 -translate-y-1/2',
};

export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  function show() {
    setOpen(true);
  }
  function hide() {
    setOpen(false);
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') hide();
  }

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={onKey}
    >
      <span aria-describedby={open ? id : undefined} className="inline-flex">
        {children}
      </span>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-50 max-w-xs whitespace-normal rounded-md bg-scc-charcoal px-2.5 py-1.5 text-xs leading-snug text-white shadow-lg',
            SIDE_CLASS[side],
            className
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
