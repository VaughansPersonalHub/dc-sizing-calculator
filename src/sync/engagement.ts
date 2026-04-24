// Sync-layer primitives that the UI/stores call into. Wires the HTTP
// client (src/sync/client.ts) to Dexie (src/sync/serialize.ts) and the
// Zustand engagement store.
//
// This is the Phase 0.75 SKELETON. Auto-save debouncing, retry queue,
// merge dialog orchestration, and history restore are stubbed to the
// structural minimum so Phase 1+ can fill them in.

import { apiJson, apiGetBlob, apiPutBlob } from './client';
import {
  exportEngagement,
  decodeEngagementBlob,
  importEngagementBlob,
} from './serialize';
import { ConflictError } from './types';
import type {
  CreateEngagementRequest,
  EngagementDto,
  EngagementListResponse,
  EngagementResponse,
  HistoryResponse,
} from './types';
import { useEngagementStore } from '../stores/engagement.store';
import type { RegionId } from '../schemas/regional';

export async function listEngagements(): Promise<EngagementDto[]> {
  const res = await apiJson<EngagementListResponse>('/engagements');
  useEngagementStore.setState({ availableEngagements: res.engagements });
  return res.engagements;
}

export async function createEngagement(req: CreateEngagementRequest): Promise<EngagementDto> {
  const res = await apiJson<EngagementResponse>('/engagements', {
    method: 'POST',
    body: JSON.stringify(req),
  });
  return res.engagement;
}

export async function archiveEngagement(id: string): Promise<void> {
  await apiJson<void>(`/engagements/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getEngagementMeta(id: string): Promise<EngagementDto> {
  const res = await apiJson<EngagementResponse>(
    `/engagements/${encodeURIComponent(id)}`
  );
  return res.engagement;
}

/**
 * Full open flow per SPEC §11: fetch meta from D1, fetch blob from R2,
 * decompress, transactionally hydrate Dexie, update Zustand. Caller is
 * responsible for invalidating the engine cache and reloading scenario
 * state after this returns.
 *
 * If the engagement has no blob yet (freshly created, `etag === ''`), we
 * skip the blob fetch and return with Dexie empty for this engagement.
 */
export async function openEngagement(id: string): Promise<EngagementDto> {
  const store = useEngagementStore.getState();
  store.setSyncStatus('pulling');
  try {
    const meta = await getEngagementMeta(id);

    if (meta.etag !== '') {
      const { bytes, etag } = await apiGetBlob(
        `/engagements/${encodeURIComponent(id)}/blob`
      );
      const decoded = decodeEngagementBlob(bytes);
      await importEngagementBlob(id, decoded);
      useEngagementStore.getState().setActiveEngagement(id, meta.regionProfile as RegionId);
      useEngagementStore.getState().markSynced(etag);
    } else {
      useEngagementStore.getState().setActiveEngagement(id, meta.regionProfile as RegionId);
      useEngagementStore.getState().markSynced('');
    }
    return meta;
  } catch (err) {
    useEngagementStore.getState().setSyncStatus('offline');
    throw err;
  }
}

/**
 * Serialize the active engagement, compress, and push to R2 with If-Match.
 * Returns the new etag on success. On conflict, flips syncStatus to
 * 'conflict' and re-throws a ConflictError — the caller (merge dialog)
 * decides take-theirs / keep-mine / diff.
 *
 * First-time saves (etag === '') use `If-Match: *` to signal "create".
 */
export async function saveEngagement(): Promise<string> {
  const s = useEngagementStore.getState();
  const id = s.activeEngagementId;
  if (!id) throw new Error('no active engagement');

  s.setSyncStatus('pushing');
  try {
    const bytes = await exportEngagement(id);
    const ifMatch = s.lastKnownEtag && s.lastKnownEtag !== '' ? s.lastKnownEtag : '*';
    const result = await apiPutBlob(
      `/engagements/${encodeURIComponent(id)}/blob`,
      bytes,
      ifMatch
    );
    useEngagementStore.getState().markSynced(result.etag);
    return result.etag;
  } catch (err) {
    if (err instanceof ConflictError) {
      useEngagementStore.getState().setSyncStatus('conflict');
    } else {
      useEngagementStore.getState().setSyncStatus('offline');
    }
    throw err;
  }
}

export async function listHistory(id: string): Promise<HistoryResponse> {
  return apiJson<HistoryResponse>(
    `/engagements/${encodeURIComponent(id)}/history`
  );
}

export async function restoreFromHistory(
  id: string,
  timestamp: string
): Promise<string> {
  const res = await apiJson<{ etag: string; lastModifiedAt: string; restoredFrom: string }>(
    `/engagements/${encodeURIComponent(id)}/restore`,
    {
      method: 'POST',
      body: JSON.stringify({ timestamp }),
    }
  );
  return res.etag;
}
