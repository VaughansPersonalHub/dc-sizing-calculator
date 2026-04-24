import { TabPlaceholder } from './TabPlaceholder';
import { useDataStore } from '../../stores/data.store';

export function EngagementsTab() {
  const libs = useDataStore((s) => s.libraries);

  const summary = [
    { label: 'Rack systems', count: libs.racks.length },
    { label: 'MHE classes', count: libs.mhe.length },
    { label: 'Productivity cells', count: libs.productivity.length },
    { label: 'Building templates', count: libs.buildings.length },
    { label: 'Pallet standards', count: libs.pallets.length },
    { label: 'Automation systems', count: libs.automation.length },
  ];

  return (
    <TabPlaceholder
      title="Engagements"
      description="Create, open, and switch between engagements. Multi-user sync and engagement-setup wizard land in Phase 0.75 and 1.5."
      phase="Phase 0 · foundation"
    >
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-medium mb-3">Reference libraries hydrated</h3>
        <ul className="grid grid-cols-2 gap-2 text-sm">
          {summary.map((item) => (
            <li key={item.label} className="flex justify-between">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-mono tabular-nums">{item.count}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          Phase 0 gate: app mounts · tabs navigate · Dexie seeds libraries ✓
        </p>
      </div>
    </TabPlaceholder>
  );
}
