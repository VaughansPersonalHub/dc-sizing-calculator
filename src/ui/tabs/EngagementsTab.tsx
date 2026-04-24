import { useEffect, useState } from 'react';
import { Plus, FolderOpen, Archive, AlertTriangle, Loader2 } from 'lucide-react';
import { useDataStore } from '../../stores/data.store';
import { useEngagementStore } from '../../stores/engagement.store';
import {
  listEngagements,
  openEngagement,
  archiveEngagement,
  ApiError,
} from '../../sync';
import { engagementsLocalRepo } from '../../db/repositories';
import type { EngagementMeta } from '../../schemas/engagement';
import { REGION_LABELS, type RegionId } from '../../schemas/regional';
import { cn } from '../../utils/cn';
import { EngagementWizard } from '../components/engagements/EngagementWizard';

export function EngagementsTab() {
  const libs = useDataStore((s) => s.libraries);
  const availableEngagements = useEngagementStore((s) => s.availableEngagements);
  const activeEngagementId = useEngagementStore((s) => s.activeEngagementId);
  const syncStatus = useEngagementStore((s) => s.syncStatus);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [localOnly, setLocalOnly] = useState<EngagementMeta[]>([]);

  // Fetch from the API once on mount. Pure offline mode falls back to what's
  // in Dexie (localOnly), which at least shows engagements the user opened
  // previously in this browser.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setListLoading(true);
      setListError(null);
      try {
        await listEngagements();
        if (!cancelled) setListLoading(false);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setListError(
            'Not authenticated with Cloudflare Access. Log in at calc.scconnect.co.nz and reload.'
          );
        } else {
          setListError((err as Error).message);
        }
        const local = await engagementsLocalRepo.list();
        if (!cancelled) {
          setLocalOnly(local);
          setListLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Merge API + local view. When the API returns successfully, local-only
  // adds (fresh offline-created engagements) get unioned for display.
  const engagements: DisplayRow[] = [
    ...availableEngagements.map((e) => ({ ...e, source: 'api' as const })),
    ...localOnly
      .filter((l) => !availableEngagements.some((e) => e.id === l.id))
      .map((l) => ({
        id: l.id,
        name: l.name,
        clientName: l.clientName ?? null,
        regionProfile: l.regionProfile,
        createdAt: l.createdAt.toISOString(),
        createdBy: l.createdBy,
        lastModifiedAt: l.lastModifiedAt.toISOString(),
        lastModifiedBy: l.lastModifiedBy,
        etag: l.etag,
        lockHolder: null,
        status: l.status,
        skuCount: l.skuCount,
        scenarioCount: l.scenarioCount,
        source: 'local' as const,
      })),
  ];

  async function handleOpen(id: string) {
    setOpeningId(id);
    try {
      await openEngagement(id);
    } catch (err) {
      setListError((err as Error).message);
    } finally {
      setOpeningId(null);
    }
  }

  async function handleArchive(id: string) {
    setArchivingId(id);
    try {
      await archiveEngagement(id);
      await listEngagements();
    } catch (err) {
      setListError((err as Error).message);
    } finally {
      setArchivingId(null);
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-2xl font-semibold tracking-tight">Engagements</h2>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Phase 1.5 · wizard
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Create, open, and switch between engagements. The wizard applies regional defaults from
        SPEC §6.2 (halal / Surau / Ramadan / seismic / plinth / shift pattern) so Asian markets
        aren't an afterthought.
      </p>

      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-scc-charcoal text-scc-gold hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          New engagement
        </button>
        <div className="flex-1" />
        <div className="text-xs text-muted-foreground">
          Active:{' '}
          <span className="font-mono">{activeEngagementId ?? '—'}</span> · sync {syncStatus}
        </div>
      </div>

      {listError && (
        <div className="mb-3 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{listError}</span>
        </div>
      )}

      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Name</th>
              <th className="text-left px-3 py-2 font-medium">Client</th>
              <th className="text-left px-3 py-2 font-medium">Region</th>
              <th className="text-right px-3 py-2 font-medium">SKUs</th>
              <th className="text-right px-3 py-2 font-medium">Scenarios</th>
              <th className="text-left px-3 py-2 font-medium">Last modified</th>
              <th className="text-right px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {listLoading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                  Loading engagements…
                </td>
              </tr>
            )}
            {!listLoading && engagements.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  No engagements yet. Click "New engagement" to create your first one.
                </td>
              </tr>
            )}
            {engagements.map((e) => {
              const isActive = e.id === activeEngagementId;
              return (
                <tr
                  key={e.id}
                  className={cn(
                    'border-t border-border',
                    isActive && 'bg-scc-gold/5'
                  )}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{e.name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{e.id}</div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{e.clientName ?? '—'}</td>
                  <td className="px-3 py-2">
                    {REGION_LABELS[e.regionProfile as RegionId] ?? e.regionProfile}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{e.skuCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{e.scenarioCount}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDate(e.lastModifiedAt)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        disabled={openingId === e.id}
                        onClick={() => handleOpen(e.id)}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-accent"
                      >
                        {openingId === e.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <FolderOpen className="h-3 w-3" />
                        )}
                        {isActive ? 'Active' : 'Open'}
                      </button>
                      <button
                        type="button"
                        disabled={archivingId === e.id}
                        onClick={() => handleArchive(e.id)}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded text-muted-foreground hover:bg-accent"
                        aria-label="Archive engagement"
                      >
                        {archivingId === e.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Archive className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card p-4">
        <h3 className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wider">
          Reference libraries hydrated
        </h3>
        <ul className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
          <Stat label="Rack systems" count={libs.racks.length} />
          <Stat label="MHE classes" count={libs.mhe.length} />
          <Stat label="Productivity cells" count={libs.productivity.length} />
          <Stat label="Building templates" count={libs.buildings.length} />
          <Stat label="Pallet standards" count={libs.pallets.length} />
          <Stat label="Automation systems" count={libs.automation.length} />
        </ul>
      </div>

      {wizardOpen && (
        <EngagementWizard
          onClose={() => setWizardOpen(false)}
          onCreated={async (id) => {
            setWizardOpen(false);
            try {
              await listEngagements();
              await handleOpen(id);
            } catch (err) {
              setListError((err as Error).message);
            }
          }}
        />
      )}
    </div>
  );
}

interface DisplayRow {
  id: string;
  name: string;
  clientName: string | null;
  regionProfile: string;
  createdAt: string;
  createdBy: string;
  lastModifiedAt: string;
  lastModifiedBy: string;
  etag: string;
  lockHolder: string | null;
  status: string;
  skuCount: number;
  scenarioCount: number;
  source: 'api' | 'local';
}

function Stat({ label, count }: { label: string; count: number }) {
  return (
    <li className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{count}</span>
    </li>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  } catch {
    return iso;
  }
}
