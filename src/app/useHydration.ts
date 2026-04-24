import { useEffect, useState } from 'react';
import { db } from '../db/schema';
import { seedReferenceLibrariesIfEmpty, isStorageAvailable } from '../db/seed';
import { useDataStore } from '../stores/data.store';

export type HydrationStatus =
  | 'pending'
  | 'hydrating'
  | 'ready'
  | 'storage_unavailable'
  | 'error';

export interface HydrationState {
  status: HydrationStatus;
  error: Error | null;
  steps: { label: string; done: boolean }[];
}

/**
 * Blocks App.tsx until the local runtime is safe to use:
 *   1. Dexie schema open + storage probe
 *   2. Reference libraries seeded if empty
 *   3. Libraries loaded into Zustand data store
 *
 * Cloudflare Access token validation is deferred until the sync layer boots
 * (Phase 0.75) — for now we treat auth as "unchecked" which maps to
 * offline-only operation.
 */
export function useHydration(): HydrationState {
  const [status, setStatus] = useState<HydrationStatus>('pending');
  const [error, setError] = useState<Error | null>(null);
  const [steps, setSteps] = useState<{ label: string; done: boolean }[]>([
    { label: 'Open local database', done: false },
    { label: 'Seed reference libraries', done: false },
    { label: 'Load libraries into memory', done: false },
  ]);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      setStatus('hydrating');
      try {
        const storageOk = await isStorageAvailable();
        if (!storageOk) {
          if (!cancelled) setStatus('storage_unavailable');
          return;
        }
        if (cancelled) return;
        setSteps((s) => s.map((x, i) => (i === 0 ? { ...x, done: true } : x)));

        await seedReferenceLibrariesIfEmpty();
        if (cancelled) return;
        setSteps((s) => s.map((x, i) => (i === 1 ? { ...x, done: true } : x)));

        const [racks, mhe, productivity, buildings, pallets, automation] = await Promise.all([
          db.racks.toArray(),
          db.mhe.toArray(),
          db.productivity.toArray(),
          db.buildings.toArray(),
          db.pallets.toArray(),
          db.automation.toArray(),
        ]);
        if (cancelled) return;

        useDataStore.getState().setLibraries({
          racks,
          mhe,
          productivity,
          buildings,
          pallets,
          automation,
        });
        setSteps((s) => s.map((x, i) => (i === 2 ? { ...x, done: true } : x)));

        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setError(err as Error);
        setStatus('error');
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  return { status, error, steps };
}
