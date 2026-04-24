// Public surface of the sync layer. UI code should import from here, not
// from the individual modules, so the internal split can change without
// ripple edits across tabs.

export {
  listEngagements,
  createEngagement,
  archiveEngagement,
  getEngagementMeta,
  openEngagement,
  saveEngagement,
  listHistory,
  restoreFromHistory,
} from './engagement';

export {
  exportEngagement,
  decodeEngagementBlob,
  importEngagementBlob,
  SCC_SCHEMA_VERSION,
} from './serialize';

export { ApiError, ConflictError } from './types';
export type {
  EngagementDto,
  EngagementListResponse,
  EngagementResponse,
  CreateEngagementRequest,
  BlobPutResponse,
  HistoryEntry,
  HistoryResponse,
  ApiErrorBody,
} from './types';
