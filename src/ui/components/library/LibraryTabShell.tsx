import { useState } from 'react';
import { Library, Truck, Timer, Building2, Package2, Bot } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { useDataStore } from '../../../stores/data.store';
import { RacksEditor } from './editors/RacksEditor';
import { MheEditor } from './editors/MheEditor';
import { ProductivityEditor } from './editors/ProductivityEditor';
import { BuildingsEditor } from './editors/BuildingsEditor';
import { PalletsEditor } from './editors/PalletsEditor';
import { AutomationEditor } from './editors/AutomationEditor';

type LibraryKey = 'racks' | 'mhe' | 'productivity' | 'buildings' | 'pallets' | 'automation';

const LIBRARIES: {
  key: LibraryKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  Editor: React.ComponentType;
}[] = [
  { key: 'racks', label: 'Racks', icon: Library, Editor: RacksEditor },
  { key: 'mhe', label: 'MHE', icon: Truck, Editor: MheEditor },
  { key: 'productivity', label: 'Productivity', icon: Timer, Editor: ProductivityEditor },
  { key: 'buildings', label: 'Buildings', icon: Building2, Editor: BuildingsEditor },
  { key: 'pallets', label: 'Pallets', icon: Package2, Editor: PalletsEditor },
  { key: 'automation', label: 'Automation', icon: Bot, Editor: AutomationEditor },
];

export function LibraryTabShell() {
  const [active, setActive] = useState<LibraryKey>('racks');
  const counts = useDataStore((s) => ({
    racks: s.libraries.racks.length,
    mhe: s.libraries.mhe.length,
    productivity: s.libraries.productivity.length,
    buildings: s.libraries.buildings.length,
    pallets: s.libraries.pallets.length,
    automation: s.libraries.automation.length,
  }));

  const Editor = LIBRARIES.find((l) => l.key === active)!.Editor;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-border">
        {LIBRARIES.map((lib) => {
          const Icon = lib.icon;
          const isActive = lib.key === active;
          return (
            <button
              key={lib.key}
              type="button"
              onClick={() => setActive(lib.key)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition',
                isActive
                  ? 'border-scc-gold text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {lib.label}
              <span className="ml-1 text-[10px] text-muted-foreground tabular-nums">
                {counts[lib.key]}
              </span>
            </button>
          );
        })}
      </div>
      <Editor />
    </div>
  );
}
