import { useMemo, useState, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type Row,
} from '@tanstack/react-table';
import { Search, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Tooltip } from '../Tooltip';
import { InfoTip } from '../InfoTip';

export type FieldKind = 'text' | 'number' | 'select' | 'boolean' | 'readonly' | 'compound';

export interface EditableFieldMeta<T> {
  kind: FieldKind;
  options?: readonly string[];
  /** Custom formatter for compound/readonly cells (eg "9.6 × 9.6 m"). */
  render?: (row: T) => React.ReactNode;
  /** Parse UI string → typed value. Defaults: number via Number(), bool via === 'true'. */
  parse?: (raw: string) => unknown;
  /** Align cell. Number/boolean default to right-aligned. */
  align?: 'left' | 'right' | 'center';
  /** Step attr for number inputs. */
  step?: number;
  /** Phase 10.1 — tooltip text shown next to the column header. */
  tooltip?: string;
}

export type EditableColumn<T> = ColumnDef<T> & {
  meta?: EditableFieldMeta<T>;
};

interface Props<T, K extends string | number> {
  rows: T[];
  columns: EditableColumn<T>[];
  getRowId: (row: T) => K;
  onSave: (row: T) => Promise<void>;
  onDelete: (id: K) => Promise<void>;
  onResetToSeed: () => Promise<void>;
  onAdd: () => T;
  deletable?: (row: T) => boolean;
  emptyMessage?: string;
}

/**
 * Generic TanStack Table wrapper with inline editing + add/delete + seed
 * reset. Writes go through repositories (parent-provided callbacks) so
 * Dexie persistence and data.store refresh are centralised.
 *
 * The component uses a pessimistic save: each edit writes to Dexie on
 * blur/commit. On failure, the row reverts to its pre-edit value. This
 * keeps the store in sync with Dexie at all times — simpler than optimistic
 * + queue, and fast enough for reference libraries (≤100 rows).
 */
export function LibraryTable<T extends object, K extends string | number>({
  rows,
  columns,
  getRowId,
  onSave,
  onDelete,
  onResetToSeed,
  onAdd,
  deletable,
  emptyMessage = 'No rows',
}: Props<T, K>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [savingId, setSavingId] = useState<K | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<K | null>(null);
  const [resettingLibrary, setResettingLibrary] = useState(false);

  const actionColumn = useMemo<EditableColumn<T>>(
    () => ({
      id: '__actions',
      header: '',
      meta: { kind: 'readonly', align: 'right' },
      enableSorting: false,
      cell: ({ row }) => {
        const id = getRowId(row.original);
        const canDelete = deletable ? deletable(row.original) : true;
        return (
          <div className="flex items-center justify-end gap-1">
            {confirmDeleteId === id ? (
              <>
                <span className="text-xs text-muted-foreground mr-1">Delete?</span>
                <button
                  type="button"
                  className="text-xs px-2 py-0.5 rounded bg-destructive text-destructive-foreground"
                  onClick={async () => {
                    setConfirmDeleteId(null);
                    try {
                      await onDelete(id);
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className="text-xs px-2 py-0.5 rounded border border-border"
                  onClick={() => setConfirmDeleteId(null)}
                >
                  Cancel
                </button>
              </>
            ) : canDelete ? (
              <button
                type="button"
                className="opacity-40 hover:opacity-100 transition p-1 rounded hover:bg-accent"
                onClick={() => setConfirmDeleteId(id)}
                aria-label="Delete row"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        );
      },
    }),
    [confirmDeleteId, deletable, getRowId, onDelete]
  );

  const allColumns = useMemo(() => [...columns, actionColumn], [columns, actionColumn]);

  // useReactTable returns helper functions (getHeaderGroups / getRowModel
  // etc.) that React Compiler can't memoize — but TanStack manages
  // identity internally via its own store, so re-rendering on each call
  // is correct. The "incompatible-library" warning is informational only.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns: allColumns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getRowId: (row) => String(getRowId(row)),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const handleCellCommit = useCallback(
    async (row: T, columnId: string, rawValue: string, meta: EditableFieldMeta<T> | undefined) => {
      if (!meta || meta.kind === 'readonly' || meta.kind === 'compound') return;
      const id = getRowId(row);
      let parsed: unknown = rawValue;
      if (meta.parse) parsed = meta.parse(rawValue);
      else if (meta.kind === 'number') parsed = Number(rawValue);
      else if (meta.kind === 'boolean') parsed = rawValue === 'true';
      if (meta.kind === 'number' && Number.isNaN(parsed as number)) {
        setError(`"${rawValue}" is not a number`);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const next = { ...(row as any), [columnId]: parsed } as T;
      setSavingId(id);
      setError(null);
      try {
        await onSave(next);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setSavingId(null);
      }
    },
    [getRowId, onSave]
  );

  const handleAdd = useCallback(async () => {
    const template = onAdd();
    setError(null);
    try {
      await onSave(template);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [onAdd, onSave]);

  const handleReset = useCallback(async () => {
    setResettingLibrary(true);
    setError(null);
    try {
      await onResetToSeed();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setResettingLibrary(false);
    }
  }, [onResetToSeed]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="search"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Filter rows…"
            className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md border border-border bg-background"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {table.getFilteredRowModel().rows.length} / {rows.length}
        </div>
        <div className="flex-1" />
        <Tooltip
          content="Inserts a new row using the editor's template. The row is persisted to Dexie immediately; the engine cache invalidates."
          side="bottom"
        >
          <button
            type="button"
            onClick={handleAdd}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-scc-charcoal text-scc-gold hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            Add row
          </button>
        </Tooltip>
        <Tooltip
          content="Restores this library to its SPEC seed. Any custom rows are removed; edits to seed rows are reverted. Cannot be undone."
          side="bottom"
        >
          <button
            type="button"
            onClick={handleReset}
            disabled={resettingLibrary}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border hover:bg-accent disabled:opacity-50"
          >
            <RotateCcw className={cn('h-3.5 w-3.5', resettingLibrary && 'animate-spin')} />
            Reset to seed
          </button>
        </Tooltip>
      </div>

      {error && (
        <div className="px-3 py-2 text-xs rounded-md bg-destructive/10 text-destructive border border-destructive/30">
          {error}
        </div>
      )}

      <div className="rounded-md border border-border overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const canSort = h.column.getCanSort();
                  const sortDir = h.column.getIsSorted();
                  const m = (h.column.columnDef as EditableColumn<T>).meta;
                  const headerLabel = h.isPlaceholder
                    ? null
                    : flexRender(h.column.columnDef.header, h.getContext());
                  return (
                    <th
                      key={h.id}
                      className={cn(
                        'text-left px-2 py-2 font-medium border-b border-border whitespace-nowrap',
                        m?.align === 'right' && 'text-right',
                        m?.align === 'center' && 'text-center',
                        canSort && 'cursor-pointer select-none hover:text-foreground'
                      )}
                      onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                    >
                      <span className="inline-flex items-center gap-1">
                        {headerLabel}
                        {sortDir === 'asc' && <span>↑</span>}
                        {sortDir === 'desc' && <span>↓</span>}
                        {m?.tooltip && (
                          <InfoTip
                            content={m.tooltip}
                            side="bottom"
                            label={`About column`}
                            className="ml-0.5"
                          />
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td
                  colSpan={allColumns.length}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                row={row}
                saving={savingId === getRowId(row.original)}
                onCommit={handleCellCommit}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TableRow<T extends object>({
  row,
  saving,
  onCommit,
}: {
  row: Row<T>;
  saving: boolean;
  onCommit: (
    row: T,
    columnId: string,
    rawValue: string,
    meta: EditableFieldMeta<T> | undefined
  ) => Promise<void>;
}) {
  return (
    <tr className={cn('border-b border-border last:border-0', saving && 'opacity-50')}>
      {row.getVisibleCells().map((cell) => {
        const meta = (cell.column.columnDef as EditableColumn<T>).meta;
        const columnId = cell.column.id;
        return (
          <td
            key={cell.id}
            className={cn(
              'px-2 py-1 align-middle',
              meta?.align === 'right' && 'text-right tabular-nums',
              meta?.align === 'center' && 'text-center'
            )}
          >
            <EditableCell
              row={row.original}
              columnId={columnId}
              meta={meta}
              value={cell.getValue()}
              render={meta?.render ? () => meta.render!(row.original) : null}
              actionCell={columnId === '__actions'}
              cellCtx={cell}
              onCommit={onCommit}
            />
          </td>
        );
      })}
    </tr>
  );
}

type CellCtx<T> = ReturnType<Row<T>['getVisibleCells']>[number];

function EditableCell<T extends object>({
  row,
  columnId,
  meta,
  value,
  render,
  actionCell,
  cellCtx,
  onCommit,
}: {
  row: T;
  columnId: string;
  meta: EditableFieldMeta<T> | undefined;
  value: unknown;
  render: (() => React.ReactNode) | null;
  actionCell: boolean;
  cellCtx: CellCtx<T>;
  onCommit: (
    row: T,
    columnId: string,
    rawValue: string,
    meta: EditableFieldMeta<T> | undefined
  ) => Promise<void>;
}) {
  const [local, setLocal] = useState<string>(() => stringifyValue(value));
  const [editing, setEditing] = useState(false);

  if (actionCell) return <>{flexRender(cellCtx.column.columnDef.cell, cellCtx.getContext())}</>;
  if (!meta || meta.kind === 'readonly' || meta.kind === 'compound') {
    return <>{render ? render() : stringifyValue(value)}</>;
  }

  if (meta.kind === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => void onCommit(row, columnId, String(e.target.checked), meta)}
        className="cursor-pointer accent-scc-gold"
      />
    );
  }

  if (meta.kind === 'select' && meta.options) {
    return (
      <select
        value={String(value ?? '')}
        onChange={(e) => void onCommit(row, columnId, e.target.value, meta)}
        className="w-full bg-transparent text-xs outline-none focus:ring-1 focus:ring-ring rounded px-1"
      >
        {meta.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  const commit = () => {
    setEditing(false);
    if (local !== stringifyValue(value)) void onCommit(row, columnId, local, meta);
  };

  return (
    <input
      type={meta.kind === 'number' ? 'number' : 'text'}
      step={meta.step}
      value={editing ? local : stringifyValue(value)}
      onFocus={(e) => {
        setEditing(true);
        setLocal(stringifyValue(value));
        e.currentTarget.select();
      }}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setLocal(stringifyValue(value));
          setEditing(false);
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      className={cn(
        'w-full bg-transparent outline-none rounded px-1 hover:bg-accent/50 focus:bg-accent focus:ring-1 focus:ring-ring',
        meta.align === 'right' && 'text-right'
      )}
    />
  );
}

function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return '[object]';
  return String(v);
}
