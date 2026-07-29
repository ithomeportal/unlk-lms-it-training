'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A small sortable table.
 *
 * The rest of the admin panel builds tables out of hand-numbered CSS grid
 * columns (`grid-cols-12` with a `col-span-2` per cell), which means the header
 * and the body can silently drift apart when a column is added. This uses a
 * real <table>, so headers and cells cannot desynchronise, screen readers get
 * proper row/column semantics, and sorting lives in one place instead of being
 * re-implemented per screen.
 */

export interface Column<T> {
  key: string;
  header: string;
  /** Cell contents. */
  cell: (row: T) => ReactNode;
  /** Value used for sorting. Omit to make the column unsortable. */
  sortValue?: (row: T) => number | string | null;
  align?: 'left' | 'right' | 'center';
  /** Hide below the lg breakpoint — for secondary columns on narrow screens. */
  secondary?: boolean;
}

type Direction = 'asc' | 'desc';

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  initialSort,
  initialDirection = 'desc',
  onRowClick,
  emptyMessage = 'Nothing to show yet',
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  initialSort?: string;
  initialDirection?: Direction;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}) {
  const [sortKey, setSortKey] = useState<string | undefined>(initialSort);
  const [direction, setDirection] = useState<Direction>(initialDirection);

  const sorted = useMemo(() => {
    const column = columns.find((c) => c.key === sortKey);
    if (!column?.sortValue) return rows;

    // Copy before sorting: Array.prototype.sort mutates, and mutating the prop
    // array would reorder the caller's state in place.
    return [...rows].sort((a, b) => {
      const av = column.sortValue!(a);
      const bv = column.sortValue!(b);

      // Nulls always sort last regardless of direction. A missing value is not
      // "the smallest" — flipping the sort should not parade the unknowns to
      // the top of the report.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;

      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv));
      return direction === 'asc' ? cmp : -cmp;
    });
  }, [rows, columns, sortKey, direction]);

  const toggle = (key: string) => {
    if (key === sortKey) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setDirection('desc');
    }
  };

  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    // Wide reports must scroll inside their own container, never make the page
    // scroll horizontally.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-700 text-xs uppercase tracking-wide text-slate-400">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                aria-sort={
                  sortKey === c.key ? (direction === 'asc' ? 'ascending' : 'descending') : undefined
                }
                className={cn(
                  'px-3 py-2 font-medium',
                  c.align === 'right' && 'text-right',
                  c.align === 'center' && 'text-center',
                  !c.align && 'text-left',
                  c.secondary && 'hidden lg:table-cell'
                )}
              >
                {c.sortValue ? (
                  <button
                    type="button"
                    onClick={() => toggle(c.key)}
                    className="inline-flex items-center gap-1 hover:text-white"
                  >
                    {c.header}
                    <span aria-hidden className={cn('text-[9px]', sortKey === c.key ? 'text-blue-400' : 'text-slate-600')}>
                      {sortKey === c.key ? (direction === 'asc' ? '▲' : '▼') : '▽'}
                    </span>
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'border-b border-slate-800 last:border-0',
                onRowClick && 'cursor-pointer hover:bg-slate-800/50'
              )}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    'px-3 py-2.5 align-middle',
                    c.align === 'right' && 'text-right tabular-nums',
                    c.align === 'center' && 'text-center',
                    c.secondary && 'hidden lg:table-cell'
                  )}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
