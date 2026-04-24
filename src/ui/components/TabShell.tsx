import { useEffect } from 'react';
import { NavLink, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import {
  Briefcase,
  Upload,
  Library,
  SlidersHorizontal,
  FlaskConical,
  BarChart3,
  LayoutPanelLeft,
  Package,
} from 'lucide-react';
import { useUIStore, type TabId } from '../../stores';
import { useEngagementStore } from '../../stores/engagement.store';
import { useDataStore } from '../../stores/data.store';
import { cn } from '../../utils/cn';

import { EngagementsTab } from '../tabs/EngagementsTab';
import { InputsTab } from '../tabs/InputsTab';
import { ReferenceTab } from '../tabs/ReferenceTab';
import { DesignRulesTab } from '../tabs/DesignRulesTab';
import { ScenariosTab } from '../tabs/ScenariosTab';
import { OutputsTab } from '../tabs/OutputsTab';
import { LayoutTab } from '../tabs/LayoutTab';

interface TabDef {
  id: TabId;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: TabDef[] = [
  { id: 'engagements', label: 'Engagements', path: '/engagements', icon: Briefcase },
  { id: 'inputs', label: 'Inputs', path: '/inputs', icon: Upload },
  { id: 'reference', label: 'Reference', path: '/reference', icon: Library },
  { id: 'design-rules', label: 'Design Rules', path: '/design-rules', icon: SlidersHorizontal },
  { id: 'scenarios', label: 'Scenarios', path: '/scenarios', icon: FlaskConical },
  { id: 'outputs', label: 'Outputs', path: '/outputs', icon: BarChart3 },
  { id: 'layout', label: 'Layout', path: '/layout', icon: LayoutPanelLeft },
];

export function TabShell() {
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const syncStatus = useEngagementStore((s) => s.syncStatus);
  const activeEngagementId = useEngagementStore((s) => s.activeEngagementId);
  const skuCount = useDataStore((s) => s.skuCount);
  const location = useLocation();

  // Keep store.activeTab in sync with router path
  useEffect(() => {
    const match = TABS.find((t) => location.pathname.startsWith(t.path));
    if (match && match.id !== activeTab) setActiveTab(match.id);
  }, [location.pathname, activeTab, setActiveTab]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="h-14 border-b border-border flex items-center px-4 gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-scc-charcoal flex items-center justify-center text-scc-gold text-xs font-bold">
            SC
          </div>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold tracking-tight">DC Sizing Calculator</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              SCConnect · v0.1
            </p>
          </div>
        </div>
        <div className="flex-1" />
        <EngagementStatusPill
          syncStatus={syncStatus}
          engagementId={activeEngagementId}
          skuCount={skuCount}
        />
      </header>

      <div className="flex flex-1 min-h-0">
        <nav className="w-56 border-r border-border p-2 space-y-0.5 shrink-0">
          {TABS.map((t) => (
            <NavLink
              key={t.id}
              to={t.path}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition',
                  isActive
                    ? 'bg-scc-charcoal text-scc-gold font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )
              }
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </NavLink>
          ))}
        </nav>

        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/engagements" replace />} />
            <Route path="/engagements" element={<EngagementsTab />} />
            <Route path="/inputs" element={<InputsTab />} />
            <Route path="/reference" element={<ReferenceTab />} />
            <Route path="/design-rules" element={<DesignRulesTab />} />
            <Route path="/scenarios" element={<ScenariosTab />} />
            <Route path="/outputs" element={<OutputsTab />} />
            <Route path="/layout" element={<LayoutTab />} />
            <Route path="*" element={<Navigate to="/engagements" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function EngagementStatusPill({
  syncStatus,
  engagementId,
  skuCount,
}: {
  syncStatus: string;
  engagementId: string | null;
  skuCount: number;
}) {
  const colorBySyncStatus: Record<string, string> = {
    synced: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
    dirty: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    pushing: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
    pulling: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
    conflict: 'bg-destructive/15 text-destructive',
    offline: 'bg-muted text-muted-foreground',
  };

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Package className="h-3.5 w-3.5" />
        {skuCount.toLocaleString()} SKUs
      </span>
      <span
        className={cn(
          'px-2 py-0.5 rounded-full font-medium',
          colorBySyncStatus[syncStatus] ?? 'bg-muted text-muted-foreground'
        )}
      >
        {engagementId ? syncStatus : 'no engagement'}
      </span>
    </div>
  );
}
