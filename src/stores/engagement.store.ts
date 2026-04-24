import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { EngagementMeta, SyncStatus } from '../schemas/engagement';
import type { RegionId } from '../schemas/regional';

interface EngagementState {
  activeEngagementId: string | null;
  availableEngagements: EngagementMeta[];
  syncStatus: SyncStatus;
  lastSyncedAt: Date | null;
  regionProfile: RegionId | null;
  lastKnownEtag: string | null;
  setActiveEngagement: (id: string | null, region: RegionId | null) => void;
  setAvailable: (list: EngagementMeta[]) => void;
  setSyncStatus: (s: SyncStatus) => void;
  markSynced: (etag: string) => void;
  markDirty: () => void;
}

export const useEngagementStore = create<EngagementState>()(
  immer((set) => ({
    activeEngagementId: null,
    availableEngagements: [],
    syncStatus: 'offline',
    lastSyncedAt: null,
    regionProfile: null,
    lastKnownEtag: null,
    setActiveEngagement: (id, region) =>
      set((s) => {
        s.activeEngagementId = id;
        s.regionProfile = region;
      }),
    setAvailable: (list) =>
      set((s) => {
        s.availableEngagements = list;
      }),
    setSyncStatus: (status) =>
      set((s) => {
        s.syncStatus = status;
      }),
    markSynced: (etag) =>
      set((s) => {
        s.syncStatus = 'synced';
        s.lastSyncedAt = new Date();
        s.lastKnownEtag = etag;
      }),
    markDirty: () =>
      set((s) => {
        if (s.syncStatus === 'synced') s.syncStatus = 'dirty';
      }),
  }))
);
