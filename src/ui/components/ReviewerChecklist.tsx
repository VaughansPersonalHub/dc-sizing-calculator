// Phase 10.7.8 — Pre-flight reviewer checklist modal.
//
// Mounted on Outputs tab. Click "Pre-flight checklist" to open the
// modal. Each row is auto / manual; manual rows have a Mark-as-
// reviewed button that persists to localStorage scoped per
// engagement. The header progress chip shows N of 10 ready.

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Circle, X } from 'lucide-react';
import { useEngineStore } from '../../stores/engine.store';
import { useEngagementStore } from '../../stores/engagement.store';
import { useDataStore } from '../../stores/data.store';
import {
  computeChecklist,
  checklistProgress,
  isManualAckId,
  type ChecklistItem,
  type ChecklistStatus,
  type ManualAckId,
} from '../help/reviewer-checklist';
import { commentSummary } from '../../utils/comments';
import { cn } from '../../utils/cn';

const ACK_STORAGE_PREFIX = 'dc-sizing-checklist-acks:';

function readAcks(engagementId: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(`${ACK_STORAGE_PREFIX}${engagementId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function writeAcks(engagementId: string, acks: Record<string, boolean>): void {
  try {
    localStorage.setItem(`${ACK_STORAGE_PREFIX}${engagementId}`, JSON.stringify(acks));
  } catch {
    // Ignore — non-blocking.
  }
}

const STATUS_ICON: Record<ChecklistStatus, typeof CheckCircle2> = {
  pass: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
  manual: Circle,
};

const STATUS_COLOUR: Record<ChecklistStatus, string> = {
  pass: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  fail: 'text-red-600 dark:text-red-400',
  manual: 'text-slate-600 dark:text-slate-300',
};

const STATUS_LABEL: Record<ChecklistStatus, string> = {
  pass: 'Pass',
  warn: 'Warn',
  fail: 'Fail',
  manual: 'Needs review',
};

interface ReviewerChecklistProps {
  open: boolean;
  onClose: () => void;
}

export function ReviewerChecklist({ open, onClose }: ReviewerChecklistProps) {
  const activeEngagementId = useEngagementStore((s) => s.activeEngagementId);
  const regionProfile = useEngagementStore((s) => s.regionProfile);
  const skuCount = useDataStore((s) => s.skuCount);
  const lastResult = useEngineStore((s) => s.lastResult);
  const lastTornado = useEngineStore((s) => s.lastTornado);
  const validation = useEngineStore((s) => s.lastValidation);
  const acknowledgedHash = useEngineStore((s) => s.validationAcknowledgedHash);

  // Bumper invalidates the read on toggle / open / engagement change.
  const [bumper, setBumper] = useState(0);

  const acks = useMemo(
    () => (activeEngagementId ? readAcks(activeEngagementId) : {}),
    // The bumper is intentionally a dependency — it's the invalidation signal.
    // open is included so opening the modal forces a fresh read from storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeEngagementId, bumper, open]
  );

  const validationAcknowledged =
    validation !== null && validation.inputHash === acknowledgedHash;

  const items = useMemo(() => {
    const feasibilityShape = (lastResult as { feasibility?: { overall: boolean; clearHeightOk: boolean; seismicOk: boolean; slabOk: boolean; envelopeOk: boolean } } | null)?.feasibility ?? null;
    const summary = activeEngagementId ? commentSummary(activeEngagementId) : { open: 0, total: 0, resolved: 0, wontfix: 0 };
    return computeChecklist({
      hasActiveEngagement: !!activeEngagementId,
      skuCount,
      validation,
      validationAcknowledged,
      hasResult: lastResult !== null,
      feasibility: feasibilityShape,
      hasTornado: lastTornado !== null,
      openCommentCount: summary.open,
      manualAcks: acks,
      regionProfile: regionProfile ?? null,
    });
  }, [
    activeEngagementId,
    skuCount,
    lastResult,
    lastTornado,
    validation,
    validationAcknowledged,
    regionProfile,
    acks,
  ]);

  const progress = checklistProgress(items);

  function toggleAck(id: ManualAckId) {
    if (!activeEngagementId) return;
    const next = { ...acks, [id]: !acks[id] };
    writeAcks(activeEngagementId, next);
    setBumper((n) => n + 1);
  }

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

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-stretch justify-center p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative w-full max-w-2xl max-h-full overflow-auto rounded-lg bg-card border border-border shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checklist-title"
      >
        <div className="sticky top-0 bg-card border-b border-border px-6 py-3 flex items-center justify-between z-10">
          <div>
            <h2 id="checklist-title" className="text-lg font-semibold tracking-tight">
              Pre-flight reviewer checklist
            </h2>
            <p className="text-xs text-muted-foreground">
              {progress.pass} of {progress.total} items pass · {progress.pct}% ·{' '}
              {progress.ready ? 'ready to share' : 'not ready — see flagged rows'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close checklist"
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="px-6 py-4 space-y-2.5">
          {items.map((item, i) => (
            <ChecklistRow
              key={item.id}
              item={item}
              index={i + 1}
              onToggle={
                isManualAckId(item.id) ? () => toggleAck(item.id as ManualAckId) : undefined
              }
            />
          ))}
        </ul>

        <div className="px-6 py-3 border-t border-border bg-muted/30 text-xs text-muted-foreground">
          Manual items persist per engagement to localStorage and clear when you toggle them off.
        </div>
      </div>
    </div>
  );
}

function ChecklistRow({
  item,
  index,
  onToggle,
}: {
  item: ChecklistItem;
  index: number;
  onToggle?: () => void;
}) {
  const Icon = STATUS_ICON[item.status];
  return (
    <li className="rounded-md border border-border bg-card p-3 flex items-start gap-3 text-xs">
      <span className="text-[11px] font-mono tabular-nums text-muted-foreground pt-0.5 w-5 shrink-0">
        {String(index).padStart(2, '0')}
      </span>
      <Icon className={cn('h-4 w-4 shrink-0 mt-0.5', STATUS_COLOUR[item.status])} />
      <div className="flex-1 leading-snug">
        <div className="flex items-baseline gap-2">
          <h3 className="font-semibold text-foreground">{item.title}</h3>
          <span
            className={cn(
              'text-[10px] uppercase tracking-wider font-medium',
              STATUS_COLOUR[item.status]
            )}
          >
            {STATUS_LABEL[item.status]}
          </span>
        </div>
        <p className="text-muted-foreground mt-0.5">{item.description}</p>
        {item.suggestedAction && (
          <p className="mt-1 text-foreground/85 italic">→ {item.suggestedAction}</p>
        )}
      </div>
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'shrink-0 px-2 py-1 rounded text-[10.5px] font-medium border',
            item.reviewed
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'border-border bg-card hover:bg-accent'
          )}
        >
          {item.reviewed ? '✓ Reviewed' : 'Mark reviewed'}
        </button>
      )}
    </li>
  );
}
