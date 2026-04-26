// Phase 7 — selection panel.
//
// Shows details for the currently selected zone (rect from LayoutResult.rects).
// Selection is driven by useLayoutViewStore.selectedZoneId — clicking a zone
// in LayoutSvg sets it, clicking the SVG background or the close button
// clears it.

import { X } from 'lucide-react';
import type { LayoutResult } from './types';
import { useLayoutViewStore } from '../../stores/layout-view.store';

interface Props {
  layout: LayoutResult;
}

export function SelectionPanel({ layout }: Props) {
  const selectedZoneId = useLayoutViewStore((s) => s.selectedZoneId);
  const setSelectedZone = useLayoutViewStore((s) => s.setSelectedZone);

  if (!selectedZoneId) {
    return (
      <div className="rounded-md border border-border bg-card p-3 text-xs text-muted-foreground">
        Click a zone to inspect.
      </div>
    );
  }

  const rect = layout.rects.find((r) => r.id === selectedZoneId);
  if (!rect) {
    return (
      <div className="rounded-md border border-border bg-card p-3 text-xs text-muted-foreground">
        Selected zone not in current layout.
      </div>
    );
  }

  const areaM2 = rect.widthM * rect.depthM;
  return (
    <div className="rounded-md border border-border bg-card p-3 text-xs">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="font-semibold text-sm leading-tight">{rect.label}</div>
          <div className="text-muted-foreground text-[11px]">{rect.role}</div>
        </div>
        <button
          type="button"
          aria-label="Clear selection"
          onClick={() => setSelectedZone(null)}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul className="space-y-1">
        <Row label="Width" value={`${rect.widthM.toFixed(1)} m`} />
        <Row label="Depth" value={`${rect.depthM.toFixed(1)} m`} />
        <Row label="Area" value={`${areaM2.toFixed(0)} m²`} />
        <Row label="Origin" value={`${rect.x.toFixed(1)}, ${rect.y.toFixed(1)} m`} />
        {rect.aisles && (
          <>
            <Row label="Aisle dir." value={rect.aisles.orientation === 'matches_flow' ? 'matches flow' : 'perpendicular'} />
            <Row label="Aisle count" value={rect.aisles.count} />
          </>
        )}
        {rect.overflow && (
          <Row label="Status" value="overflow" valueClassName="text-destructive font-semibold" />
        )}
      </ul>
    </div>
  );
}

function Row({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string | number;
  valueClassName?: string;
}) {
  return (
    <li className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={valueClassName ?? 'font-mono tabular-nums'}>{value}</span>
    </li>
  );
}
