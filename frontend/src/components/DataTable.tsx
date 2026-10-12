import { ReactNode, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown, Search } from 'lucide-react';
import { EmptyState, SkeletonRows } from './ui';
import { cx } from './format';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  /** value used for sorting & searching; defaults to row[key] */
  value?: (row: T) => string | number | null | undefined;
  sortable?: boolean;
  className?: string;
}

export function DataTable<T extends { id: number | string }>({
  rows,
  columns,
  loading,
  searchPlaceholder = 'Search…',
  pageSize = 10,
  filters,
  emptyTitle = 'No records',
  emptyMessage,
  onRowClick,
  initialSort,
  toolbar,
}: {
  rows: T[];
  columns: Column<T>[];
  loading?: boolean;
  searchPlaceholder?: string;
  pageSize?: number;
  filters?: ReactNode;
  emptyTitle?: string;
  emptyMessage?: ReactNode;
  onRowClick?: (row: T) => void;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  toolbar?: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);
  const [page, setPage] = useState(1);

  const valueOf = (row: T, col: Column<T>) => (col.value ? col.value(row) : (row as Record<string, unknown>)[col.key]) as string | number | null | undefined;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows;
    if (q) out = rows.filter((r) => columns.some((c) => String(valueOf(r, c) ?? '').toLowerCase().includes(q)));
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        out = [...out].sort((a, b) => {
          const va = valueOf(a, col);
          const vb = valueOf(b, col);
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true });
          return sort.dir === 'asc' ? cmp : -cmp;
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, sort, columns]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => setPage(1), [query, rows.length]);
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-navy-800">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} aria-label="Search table" />
        </div>
        {filters}
        {toolbar && <div className="ml-auto flex flex-wrap gap-2">{toolbar}</div>}
      </div>
      {loading && rows.length === 0 ? (
        <SkeletonRows />
      ) : filtered.length === 0 ? (
        <EmptyState title={query ? 'No matching records' : emptyTitle} message={query ? 'Try a different search term.' : emptyMessage} />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 dark:divide-navy-800">
            <thead className="bg-slate-50/70 dark:bg-navy-950/40">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={cx('th', c.className)} scope="col" aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {c.sortable !== false ? (
                      <button className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-white" onClick={() => toggleSort(c.key)}>
                        {c.header}
                        {sort?.key === c.key ? (
                          sort.dir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-navy-800">
              {visible.map((row) => (
                <tr
                  key={row.id}
                  className={cx('transition-colors', onRowClick && 'cursor-pointer hover:bg-electric-50/50 dark:hover:bg-navy-800/60')}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(row) : undefined}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cx('td', c.className)}>
                      {c.render ? c.render(row) : String(valueOf(row, c) ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-navy-800 dark:text-slate-400">
          <span>
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button className="rounded-lg p-1.5 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-navy-800" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2">
              Page {page} / {pages}
            </span>
            <button className="rounded-lg p-1.5 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-navy-800" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
