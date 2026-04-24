import type { Env } from './env';

// Row shape in D1 — snake_case, TEXT timestamps. The API converts to the
// camelCase shape the SPA expects before returning.
export interface EngagementRow {
  id: string;
  name: string;
  client_name: string | null;
  region_profile: string;
  created_at: string;
  created_by: string;
  last_modified_at: string;
  last_modified_by: string;
  etag: string;
  lock_holder: string | null;
  lock_acquired_at: string | null;
  status: 'active' | 'archived';
  sku_count: number;
  scenario_count: number;
}

export interface EngagementDto {
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
  status: 'active' | 'archived';
  skuCount: number;
  scenarioCount: number;
}

export function rowToDto(r: EngagementRow): EngagementDto {
  return {
    id: r.id,
    name: r.name,
    clientName: r.client_name,
    regionProfile: r.region_profile,
    createdAt: r.created_at,
    createdBy: r.created_by,
    lastModifiedAt: r.last_modified_at,
    lastModifiedBy: r.last_modified_by,
    etag: r.etag,
    lockHolder: r.lock_holder,
    status: r.status,
    skuCount: r.sku_count,
    scenarioCount: r.scenario_count,
  };
}

export async function getEngagement(env: Env, id: string): Promise<EngagementRow | null> {
  const row = await env.DB
    .prepare('SELECT * FROM engagements WHERE id = ?')
    .bind(id)
    .first<EngagementRow>();
  return row ?? null;
}

export function blobKey(id: string): string {
  return `engagements/${id}/current.scc`;
}

export function historyKey(id: string, timestamp: string): string {
  // ISO timestamp is sortable; R2 list returns lexicographic, so newest-last.
  return `engagements/${id}/history/${timestamp}.scc`;
}

export function historyPrefix(id: string): string {
  return `engagements/${id}/history/`;
}
