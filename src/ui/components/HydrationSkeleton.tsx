import type { HydrationState } from '../../app/useHydration';
import { cn } from '../../utils/cn';
import { Check, Loader2 } from 'lucide-react';

interface Props {
  state: HydrationState;
}

export function HydrationSkeleton({ state }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-md bg-scc-charcoal flex items-center justify-center text-scc-gold font-bold">
            SC
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">DC Sizing Calculator</h1>
            <p className="text-xs text-muted-foreground">SCConnect internal tool</p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <p className="text-sm font-medium">Warming up your workspace…</p>
          <ul className="space-y-2">
            {state.steps.map((s, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span
                  className={cn(
                    'h-5 w-5 rounded-full flex items-center justify-center',
                    s.done
                      ? 'bg-scc-gold text-scc-charcoal'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {s.done ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  )}
                </span>
                <span className={cn(s.done && 'text-muted-foreground')}>{s.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
