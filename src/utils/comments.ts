// Phase 10.7.3 — Anchored comments (review layer).
//
// Comments attach to engagement-scoped UI anchors so a reviewer can
// thread feedback against specific output values, step cards, or
// citations without losing context. Storage is localStorage keyed by
// engagement; a 7th Zustand store is explicitly disallowed by
// CLAUDE.md, so this module exposes pure functions and the UI panel
// reads/writes through them.
//
// Export format (schemaVersion 1) is JSON so a future AI session can
// load the comments back and iterate on them.

export type CommentStatus = 'open' | 'resolved' | 'wontfix';

export interface CommentReply {
  id: string;
  body: string;
  createdAt: string;
}

export interface Comment {
  id: string;
  anchor: string;
  body: string;
  status: CommentStatus;
  createdAt: string;
  replies: CommentReply[];
}

export interface CommentsExport {
  schemaVersion: 1;
  engagementId: string;
  exportedAt: string;
  comments: Comment[];
}

const STORAGE_PREFIX = 'dc-sizing-comments:';

export function storageKey(engagementId: string): string {
  return `${STORAGE_PREFIX}${engagementId}`;
}

function safeStorage(): Storage | null {
  try {
    if (typeof globalThis.localStorage !== 'undefined') return globalThis.localStorage;
  } catch {
    // Access blocked (privacy mode, sandbox) — caller must handle null.
  }
  return null;
}

export function readComments(engagementId: string): Comment[] {
  const ls = safeStorage();
  if (!ls) return [];
  const raw = ls.getItem(storageKey(engagementId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Comment[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writeComments(engagementId: string, comments: Comment[]): void {
  const ls = safeStorage();
  if (!ls) return;
  ls.setItem(storageKey(engagementId), JSON.stringify(comments));
}

function nowIso(): string {
  return new Date().toISOString();
}

function genId(): string {
  // crypto.randomUUID is available in modern browsers + Node 19+; fall
  // back to a timestamp+random combo only if it is missing.
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function addComment(
  engagementId: string,
  anchor: string,
  body: string
): Comment {
  const trimmedAnchor = anchor.trim();
  const trimmedBody = body.trim();
  if (trimmedAnchor.length === 0) throw new Error('Comment anchor cannot be empty');
  if (trimmedBody.length === 0) throw new Error('Comment body cannot be empty');
  const next: Comment = {
    id: genId(),
    anchor: trimmedAnchor,
    body: trimmedBody,
    status: 'open',
    createdAt: nowIso(),
    replies: [],
  };
  const all = readComments(engagementId);
  all.push(next);
  writeComments(engagementId, all);
  return next;
}

export function replyToComment(
  engagementId: string,
  commentId: string,
  body: string
): CommentReply | null {
  const trimmed = body.trim();
  if (trimmed.length === 0) return null;
  const all = readComments(engagementId);
  const idx = all.findIndex((c) => c.id === commentId);
  if (idx < 0) return null;
  const reply: CommentReply = {
    id: genId(),
    body: trimmed,
    createdAt: nowIso(),
  };
  all[idx] = { ...all[idx], replies: [...all[idx].replies, reply] };
  writeComments(engagementId, all);
  return reply;
}

export function setCommentStatus(
  engagementId: string,
  commentId: string,
  status: CommentStatus
): void {
  const all = readComments(engagementId);
  const idx = all.findIndex((c) => c.id === commentId);
  if (idx < 0) return;
  all[idx] = { ...all[idx], status };
  writeComments(engagementId, all);
}

export function removeComment(engagementId: string, commentId: string): void {
  const all = readComments(engagementId).filter((c) => c.id !== commentId);
  writeComments(engagementId, all);
}

export function clearComments(engagementId: string): void {
  writeComments(engagementId, []);
}

export function exportCommentsJSON(engagementId: string): string {
  const payload: CommentsExport = {
    schemaVersion: 1,
    engagementId,
    exportedAt: nowIso(),
    comments: readComments(engagementId),
  };
  return JSON.stringify(payload, null, 2);
}

export interface ImportResult {
  added: number;
  skipped: number;
  total: number;
}

/**
 * Imports comments from a JSON string. Comments with ids that already
 * exist on this engagement are skipped (no overwrite). Returns counts
 * for the UI feedback line.
 */
export function importCommentsJSON(
  engagementId: string,
  json: string
): ImportResult {
  let parsed: CommentsExport;
  try {
    parsed = JSON.parse(json) as CommentsExport;
  } catch {
    throw new Error('Invalid JSON');
  }
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.comments)) {
    throw new Error('Unrecognised comments envelope (schemaVersion or comments missing)');
  }
  const existing = readComments(engagementId);
  const existingIds = new Set(existing.map((c) => c.id));
  const out = [...existing];
  let added = 0;
  let skipped = 0;
  for (const c of parsed.comments) {
    if (!c || typeof c.id !== 'string') {
      skipped += 1;
      continue;
    }
    if (existingIds.has(c.id)) {
      skipped += 1;
      continue;
    }
    out.push({
      ...c,
      replies: Array.isArray(c.replies) ? c.replies : [],
    });
    added += 1;
  }
  writeComments(engagementId, out);
  return { added, skipped, total: out.length };
}

/**
 * Compact summary for the header chip + outputs reviewer-packet bundle.
 */
export function commentSummary(engagementId: string): {
  total: number;
  open: number;
  resolved: number;
  wontfix: number;
} {
  const all = readComments(engagementId);
  return {
    total: all.length,
    open: all.filter((c) => c.status === 'open').length,
    resolved: all.filter((c) => c.status === 'resolved').length,
    wontfix: all.filter((c) => c.status === 'wontfix').length,
  };
}
