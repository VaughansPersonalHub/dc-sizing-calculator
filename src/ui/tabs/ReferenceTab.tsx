import { LibraryTabShell } from '../components/library/LibraryTabShell';

export function ReferenceTab() {
  return (
    <div className="p-6 max-w-full">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-2xl font-semibold tracking-tight">Reference Libraries</h2>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Phase 1 · editors
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Six canonical libraries. Edit inline — changes persist to Dexie and invalidate the engine
        cache. Deep-nested fields (seismic, mezzanine tiers, cold-chain) land in a drill-down
        editor in a later phase; for now those cells are read-only summaries.
      </p>
      <LibraryTabShell />
    </div>
  );
}
