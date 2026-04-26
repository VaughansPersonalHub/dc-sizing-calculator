// Phase 10.7.3 — comments storage tests.
//
// Storage uses localStorage (jsdom polyfill) — each test clears it
// fresh so cross-test pollution is impossible.

import { beforeEach, describe, it, expect } from 'vitest';
import {
  addComment,
  readComments,
  replyToComment,
  setCommentStatus,
  removeComment,
  clearComments,
  exportCommentsJSON,
  importCommentsJSON,
  commentSummary,
  storageKey,
} from '../../src/utils/comments';

const ENG = 'eng-test-1';

beforeEach(() => {
  localStorage.clear();
});

describe('Phase 10.7.3 — comments storage', () => {
  it('reads an empty list initially', () => {
    expect(readComments(ENG)).toEqual([]);
  });

  it('adds a comment with auto-generated id and createdAt', () => {
    const c = addComment(ENG, 'scenarios:step-7', 'FTE looks high');
    expect(c.id.length).toBeGreaterThan(3);
    expect(c.anchor).toBe('scenarios:step-7');
    expect(c.body).toBe('FTE looks high');
    expect(c.status).toBe('open');
    expect(c.replies).toEqual([]);
    expect(new Date(c.createdAt).toString()).not.toBe('Invalid Date');
  });

  it('persists added comments under the engagement key', () => {
    addComment(ENG, 'a', 'b');
    expect(localStorage.getItem(storageKey(ENG))).not.toBeNull();
    expect(readComments(ENG).length).toBe(1);
  });

  it('rejects empty anchor or body', () => {
    expect(() => addComment(ENG, '', 'body')).toThrow();
    expect(() => addComment(ENG, 'anchor', '   ')).toThrow();
  });

  it('replies get appended to the right comment', () => {
    const c = addComment(ENG, 'anchor', 'parent');
    const r = replyToComment(ENG, c.id, 'first reply');
    expect(r).not.toBeNull();
    expect(readComments(ENG)[0].replies).toHaveLength(1);
    expect(readComments(ENG)[0].replies[0].body).toBe('first reply');
  });

  it('status updates flow through to storage', () => {
    const c = addComment(ENG, 'anchor', 'body');
    setCommentStatus(ENG, c.id, 'resolved');
    expect(readComments(ENG)[0].status).toBe('resolved');
    setCommentStatus(ENG, c.id, 'wontfix');
    expect(readComments(ENG)[0].status).toBe('wontfix');
  });

  it('remove drops a comment from storage', () => {
    const a = addComment(ENG, 'a', '1');
    addComment(ENG, 'b', '2');
    removeComment(ENG, a.id);
    const remaining = readComments(ENG);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].anchor).toBe('b');
  });

  it('clearComments empties the list for one engagement', () => {
    addComment(ENG, 'a', 'b');
    addComment(ENG, 'c', 'd');
    clearComments(ENG);
    expect(readComments(ENG)).toEqual([]);
  });

  it('comments are scoped per engagement', () => {
    addComment('eng-a', 'a', 'a-body');
    addComment('eng-b', 'b', 'b-body');
    expect(readComments('eng-a')).toHaveLength(1);
    expect(readComments('eng-b')).toHaveLength(1);
    expect(readComments('eng-a')[0].body).toBe('a-body');
  });

  it('summary counts by status', () => {
    const a = addComment(ENG, 'a', '1');
    const b = addComment(ENG, 'b', '2');
    addComment(ENG, 'c', '3');
    setCommentStatus(ENG, a.id, 'resolved');
    setCommentStatus(ENG, b.id, 'wontfix');
    expect(commentSummary(ENG)).toEqual({
      total: 3,
      open: 1,
      resolved: 1,
      wontfix: 1,
    });
  });
});

describe('Phase 10.7.3 — JSON export / import round-trip', () => {
  it('exports a schema-versioned envelope', () => {
    addComment(ENG, 'a', '1');
    const json = exportCommentsJSON(ENG);
    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.engagementId).toBe(ENG);
    expect(parsed.comments).toHaveLength(1);
  });

  it('imports an exported envelope onto a fresh engagement', () => {
    addComment(ENG, 'a', '1');
    addComment(ENG, 'b', '2');
    const json = exportCommentsJSON(ENG);
    clearComments(ENG);

    const result = importCommentsJSON(ENG, json);
    expect(result.added).toBe(2);
    expect(result.skipped).toBe(0);
    expect(readComments(ENG)).toHaveLength(2);
  });

  it('skips duplicate ids on import (no overwrite)', () => {
    addComment(ENG, 'a', '1');
    const json = exportCommentsJSON(ENG);
    // Importing the same envelope back on top of itself.
    const result = importCommentsJSON(ENG, json);
    expect(result.added).toBe(0);
    expect(result.skipped).toBe(1);
    expect(readComments(ENG)).toHaveLength(1);
  });

  it('rejects malformed JSON', () => {
    expect(() => importCommentsJSON(ENG, 'not json')).toThrow();
  });

  it('rejects an envelope with the wrong schema version', () => {
    expect(() =>
      importCommentsJSON(ENG, JSON.stringify({ schemaVersion: 99, comments: [] }))
    ).toThrow();
  });
});
