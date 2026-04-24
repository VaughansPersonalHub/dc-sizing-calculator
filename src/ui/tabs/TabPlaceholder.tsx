import type { ReactNode } from 'react';

interface Props {
  title: string;
  description: string;
  phase: string;
  children?: ReactNode;
}

/**
 * Uniform placeholder used for tabs not yet implemented. Carries forward the
 * phase number from SPEC §13 so progress is visible during the build.
 */
export function TabPlaceholder({ title, description, phase, children }: Props) {
  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {phase}
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-6">{description}</p>
      {children}
    </div>
  );
}
