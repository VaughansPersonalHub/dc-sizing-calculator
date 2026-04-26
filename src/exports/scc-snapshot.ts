// Phase 8 — .scc snapshot import / export.
//
// SPEC §12 deliverable: a portable engagement archive. This module wraps
// the existing src/sync/serialize.ts round-trip and adapts it to the
// Outputs tab UX (download for export, file picker for import).
//
// The same .scc bytes that R2 stores are used here — no new schema, no
// drift. Schema versions 1 + 2 both decode cleanly.

import {
  exportEngagement,
  decodeEngagementBlob,
  importEngagementBlob,
} from '../sync/serialize';
import { triggerDownload } from './download';

/**
 * Serialise the engagement at `engagementId`, gzip-encode the JSON
 * envelope, and trigger a download. The Outputs tab calls this directly.
 */
export async function downloadSccSnapshot(
  engagementId: string,
  fileBase: string
): Promise<void> {
  const bytes = await exportEngagement(engagementId);
  // exportEngagement returns Uint8Array; copy into a Blob-safe ArrayBuffer.
  const blob = new Blob([bytes.slice().buffer], { type: 'application/octet-stream' });
  triggerDownload(blob, `${fileBase}.scc`);
}

/**
 * Read a user-selected .scc file, decode the envelope, and bulk-write the
 * rows into Dexie. The caller is expected to already know which engagement
 * the import targets — usually that's the engagement embedded in the blob,
 * which we extract from the envelope and return so the UI can refresh.
 */
export async function importSccSnapshot(file: File): Promise<{
  engagementId: string;
  schemaVersion: number;
  exportedAt: string;
}> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const decoded = decodeEngagementBlob(bytes);
  await importEngagementBlob(decoded.engagement.id, decoded);
  return {
    engagementId: decoded.engagement.id,
    schemaVersion: decoded.schemaVersion,
    exportedAt: decoded.exportedAt,
  };
}
