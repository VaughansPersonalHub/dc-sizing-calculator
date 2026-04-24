import { AlertTriangle } from 'lucide-react';

interface Props {
  onContinueAnyway: () => void;
}

export function StorageUnavailableBanner({ onContinueAnyway }: Props) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-6">
      <div className="max-w-lg rounded-lg border border-destructive/40 bg-destructive/5 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-destructive" />
          <h2 className="text-lg font-semibold">Storage unavailable</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          IndexedDB is blocked in this browser context (private window, corporate policy, or
          disabled storage). The calculator will run in <em>session-only mode</em>: all work
          lives in memory and will be lost when you close the tab.
        </p>
        <p className="text-sm text-muted-foreground">
          To persist engagements, open this app in a standard (non-incognito) browser window on
          a device where site storage is permitted.
        </p>
        <button
          type="button"
          onClick={onContinueAnyway}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition"
        >
          Continue in session-only mode
        </button>
      </div>
    </div>
  );
}
