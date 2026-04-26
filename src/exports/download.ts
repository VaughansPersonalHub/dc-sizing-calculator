// Phase 8 — shared browser download trigger.
//
// All exports (Excel, CSV, PDF, PPT, .scc) end up calling this helper to
// turn a Blob into a file the user can save. Lives in src/exports so the
// non-UI export builders don't need to depend on the UI tree.

export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Slugify a free-form engagement name into a filename-safe stub. Empty /
 * missing names fall back to "engagement".
 */
export function fileBaseFromName(name: string | null | undefined): string {
  const s = (name ?? 'engagement')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return s || 'engagement';
}
