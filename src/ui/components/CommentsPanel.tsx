// Phase 10.7.3 — Anchored comments panel.
//
// Side panel listing every comment on the active engagement. Lets the
// reviewer add, reply, change status, delete, and import/export the
// thread as JSON. Anchors are free-text (e.g. "scenarios:step-7-fte")
// so the schema travels through the JSON export untouched and a
// future agent session can read it back.
//
// Storage is localStorage via src/utils/comments.ts (no 7th store —
// CLAUDE.md locks the count at 6).

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  MessageSquare,
  Trash2,
  Reply as ReplyIcon,
  Download,
  Upload,
} from 'lucide-react';
import { useEngagementStore } from '../../stores/engagement.store';
import {
  addComment,
  readComments,
  replyToComment,
  setCommentStatus,
  removeComment,
  exportCommentsJSON,
  importCommentsJSON,
  commentSummary,
  type Comment,
  type CommentStatus,
} from '../../utils/comments';
import { triggerDownload, fileBaseFromName } from '../../exports/download';
import { cn } from '../../utils/cn';

interface CommentsPanelProps {
  open: boolean;
  onClose: () => void;
}

const STATUS_BG: Record<CommentStatus, string> = {
  open: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  resolved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  wontfix: 'bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30',
};

const STATUS_LABEL: Record<CommentStatus, string> = {
  open: 'Open',
  resolved: 'Resolved',
  wontfix: "Won't fix",
};

export function CommentsPanel({ open, onClose }: CommentsPanelProps) {
  const activeEngagementId = useEngagementStore((s) => s.activeEngagementId);
  const availableEngagements = useEngagementStore((s) => s.availableEngagements);
  const engagementName = useMemo(() => {
    if (!activeEngagementId) return '';
    return (
      availableEngagements.find((e) => e.id === activeEngagementId)?.name ??
      activeEngagementId
    );
  }, [activeEngagementId, availableEngagements]);

  const [refresh, setRefresh] = useState(0);
  const comments = useMemo(() => {
    if (!activeEngagementId) return [];
    return readComments(activeEngagementId);
    // refresh is the dependency that forces a re-read after writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEngagementId, refresh]);
  const summary = useMemo(() => {
    if (!activeEngagementId) return { total: 0, open: 0, resolved: 0, wontfix: 0 };
    return commentSummary(activeEngagementId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEngagementId, refresh]);

  const [filter, setFilter] = useState<CommentStatus | 'all'>('all');
  const [draftAnchor, setDraftAnchor] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Esc closes the panel.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  function bump() {
    setRefresh((n) => n + 1);
  }

  function onAdd() {
    if (!activeEngagementId) return;
    setError(null);
    try {
      addComment(activeEngagementId, draftAnchor, draftBody);
      setDraftAnchor('');
      setDraftBody('');
      bump();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function onReply(commentId: string, body: string): boolean {
    if (!activeEngagementId) return false;
    const r = replyToComment(activeEngagementId, commentId, body);
    if (r) bump();
    return r !== null;
  }

  function onStatus(commentId: string, status: CommentStatus) {
    if (!activeEngagementId) return;
    setCommentStatus(activeEngagementId, commentId, status);
    bump();
  }

  function onDelete(commentId: string) {
    if (!activeEngagementId) return;
    removeComment(activeEngagementId, commentId);
    bump();
  }

  function onExport() {
    if (!activeEngagementId) return;
    const json = exportCommentsJSON(activeEngagementId);
    const blob = new Blob([json], { type: 'application/json' });
    triggerDownload(blob, `${fileBaseFromName(engagementName)}-comments.json`);
  }

  async function onImport(file: File) {
    if (!activeEngagementId) return;
    setError(null);
    try {
      const text = await file.text();
      const result = importCommentsJSON(activeEngagementId, text);
      bump();
      setError(`Imported ${result.added} comment(s); ${result.skipped} skipped.`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const filtered =
    filter === 'all' ? comments : comments.filter((c) => c.status === filter);

  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-labelledby="comments-panel-title"
      className="fixed top-0 right-0 bottom-0 z-40 w-full sm:w-[420px] bg-card border-l border-border shadow-2xl flex flex-col"
    >
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <h2 id="comments-panel-title" className="text-sm font-semibold tracking-tight flex-1">
          Reviewer comments
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close comments"
          className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!activeEngagementId ? (
        <div className="p-6 text-xs text-muted-foreground">
          Open an engagement on the Engagements tab to start commenting. Comments are scoped
          to the active engagement.
        </div>
      ) : (
        <>
          <div className="px-4 py-2 border-b border-border text-[11px] text-muted-foreground flex items-center gap-2 shrink-0">
            <span>
              <strong>{engagementName}</strong> · {summary.total} total · {summary.open} open ·{' '}
              {summary.resolved} resolved
            </span>
          </div>

          <div className="px-4 py-2 border-b border-border flex items-center flex-wrap gap-1.5 text-[10.5px] shrink-0">
            <span className="text-muted-foreground mr-1">Filter:</span>
            {(['all', 'open', 'resolved', 'wontfix'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  'px-2 py-0.5 rounded',
                  filter === f
                    ? 'bg-scc-charcoal text-scc-gold'
                    : 'border border-border bg-card hover:bg-accent'
                )}
              >
                {f === 'all' ? 'All' : STATUS_LABEL[f]}
              </button>
            ))}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onExport}
              disabled={summary.total === 0}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border hover:bg-accent disabled:opacity-40"
              aria-label="Export comments as JSON"
            >
              <Download className="h-3 w-3" />
              Export JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImport(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border hover:bg-accent"
              aria-label="Import comments from JSON"
            >
              <Upload className="h-3 w-3" />
              Import
            </button>
          </div>

          <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                {summary.total === 0
                  ? 'No comments yet — add the first one below.'
                  : `No ${filter === 'all' ? '' : STATUS_LABEL[filter as CommentStatus] + ' '}comments at this filter.`}
              </p>
            )}
            {filtered.map((c) => (
              <CommentRow
                key={c.id}
                comment={c}
                onStatus={(s) => onStatus(c.id, s)}
                onDelete={() => onDelete(c.id)}
                onReply={(body) => onReply(c.id, body)}
              />
            ))}
          </div>

          <div className="border-t border-border px-4 py-3 shrink-0 space-y-2">
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Add comment
            </h3>
            <input
              type="text"
              value={draftAnchor}
              onChange={(e) => setDraftAnchor(e.target.value)}
              placeholder="Anchor (e.g. scenarios:step-7-labour, outputs:summary-pdf)"
              className="w-full px-2 py-1.5 text-xs rounded-md border border-border bg-background"
            />
            <textarea
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              placeholder="Write a review note. Anchors are free-text — name the screen and the element."
              rows={3}
              className="w-full px-2 py-1.5 text-xs rounded-md border border-border bg-background resize-none"
            />
            {error && (
              <p className="text-[10.5px] text-amber-700 dark:text-amber-400">{error}</p>
            )}
            <button
              type="button"
              onClick={onAdd}
              disabled={!draftAnchor.trim() || !draftBody.trim()}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-scc-charcoal text-scc-gold text-xs disabled:opacity-40"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Add
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

function CommentRow({
  comment,
  onStatus,
  onDelete,
  onReply,
}: {
  comment: Comment;
  onStatus: (s: CommentStatus) => void;
  onDelete: () => void;
  onReply: (body: string) => boolean;
}) {
  const [replyDraft, setReplyDraft] = useState('');
  const [showReply, setShowReply] = useState(false);

  function submitReply() {
    if (onReply(replyDraft)) {
      setReplyDraft('');
      setShowReply(false);
    }
  }

  return (
    <article
      className={cn(
        'rounded-md border bg-card p-3 text-xs space-y-2',
        STATUS_BG[comment.status]
      )}
    >
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[10.5px] truncate flex-1" title={comment.anchor}>
          @ {comment.anchor}
        </span>
        <span className="text-[10px] uppercase tracking-wider opacity-70">
          {STATUS_LABEL[comment.status]}
        </span>
      </div>
      <p className="text-foreground/95 leading-snug whitespace-pre-wrap">{comment.body}</p>
      <div className="text-[10px] text-muted-foreground">
        {new Date(comment.createdAt).toLocaleString()}
      </div>
      {comment.replies.length > 0 && (
        <ul className="space-y-1 pl-2 border-l border-border">
          {comment.replies.map((r) => (
            <li key={r.id}>
              <p className="text-foreground/90 whitespace-pre-wrap">{r.body}</p>
              <span className="text-[9.5px] text-muted-foreground">
                {new Date(r.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-1.5 flex-wrap">
        <select
          value={comment.status}
          onChange={(e) => onStatus(e.target.value as CommentStatus)}
          aria-label="Set comment status"
          className="text-[10.5px] bg-background border border-border rounded px-1.5 py-0.5"
        >
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="wontfix">Won&apos;t fix</option>
        </select>
        <button
          type="button"
          onClick={() => setShowReply((s) => !s)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border hover:bg-accent text-[10.5px]"
        >
          <ReplyIcon className="h-3 w-3" />
          Reply
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete comment"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border hover:bg-destructive/10 hover:border-destructive/40 text-[10.5px] text-muted-foreground"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      {showReply && (
        <div className="space-y-1.5 pt-1">
          <textarea
            value={replyDraft}
            onChange={(e) => setReplyDraft(e.target.value)}
            rows={2}
            className="w-full px-2 py-1 text-[11px] rounded border border-border bg-background resize-none"
            placeholder="Write a reply…"
          />
          <button
            type="button"
            onClick={submitReply}
            disabled={!replyDraft.trim()}
            className="px-2 py-0.5 rounded bg-scc-charcoal text-scc-gold text-[10.5px] disabled:opacity-40"
          >
            Post
          </button>
        </div>
      )}
    </article>
  );
}
