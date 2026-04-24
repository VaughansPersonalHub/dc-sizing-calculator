import { AlertOctagon } from 'lucide-react';

interface Props {
  error: Error | null;
  onRetry: () => void;
}

export function HydrationErrorBanner({ error, onRetry }: Props) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-6">
      <div className="max-w-lg rounded-lg border border-destructive/40 bg-destructive/5 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <AlertOctagon className="h-6 w-6 text-destructive" />
          <h2 className="text-lg font-semibold">Startup error</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          The workspace failed to initialise. This usually indicates a corrupted local database
          or a browser incompatibility.
        </p>
        {error && (
          <pre className="text-xs p-3 rounded-md bg-muted overflow-x-auto">
            {error.message}
          </pre>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => {
              indexedDB.deleteDatabase('DC_Sizing_Calc');
              location.reload();
            }}
            className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent transition"
          >
            Reset local database
          </button>
        </div>
      </div>
    </div>
  );
}
