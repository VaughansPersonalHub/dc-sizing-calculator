// API DTO types. Mirror what functions/api/* returns so the sync layer
// gets compile-time guarantees on the wire format. When the Workers API
// changes, update both sides in the same PR.

import type { RegionId } from '../schemas/regional';
import type { EngagementStatus } from '../schemas/engagement';

export interface EngagementDto {
  id: string;
  name: string;
  clientName: string | null;
  regionProfile: RegionId;
  createdAt: string;
  createdBy: string;
  lastModifiedAt: string;
  lastModifiedBy: string;
  etag: string;
  lockHolder: string | null;
  status: EngagementStatus;
  skuCount: number;
  scenarioCount: number;
}

export interface EngagementListResponse {
  engagements: EngagementDto[];
}

export interface EngagementResponse {
  engagement: EngagementDto;
}

export interface CreateEngagementRequest {
  id: string;
  name: string;
  clientName?: string;
  regionProfile: RegionId;
}

export interface BlobPutResponse {
  etag: string;
  lastModifiedAt: string;
  lastModifiedBy: string;
  bytes: number;
}

export interface HistoryEntry {
  key: string;
  timestamp: string;
  size: number;
  etag: string;
  modifiedBy: string | null;
}

export interface HistoryResponse {
  history: HistoryEntry[];
}

export interface ApiErrorBody {
  error: { code: string; message: string };
  currentEtag?: string;
  lastModifiedBy?: string;
  lastModifiedAt?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly body: ApiErrorBody | null;
  constructor(status: number, code: string, message: string, body: ApiErrorBody | null) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

// Raised when PUT /blob hits etag mismatch. The sync layer catches this
// specifically and flips engagement.store.syncStatus → 'conflict'.
export class ConflictError extends ApiError {
  readonly serverEtag: string;
  readonly serverModifiedBy: string | null;
  readonly serverModifiedAt: string | null;
  constructor(body: ApiErrorBody) {
    super(409, 'conflict', body.error.message, body);
    this.serverEtag = body.currentEtag ?? '';
    this.serverModifiedBy = body.lastModifiedBy ?? null;
    this.serverModifiedAt = body.lastModifiedAt ?? null;
  }
}
