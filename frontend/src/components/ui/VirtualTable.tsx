import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { usePreferenceStore } from '../../store/preferenceStore';
import styles from './VirtualTable.module.css';

export interface VirtualTableColumn<T> {
  key: string;
  header: string;
  width?: number;
  sortable?: boolean;
  render: (row: T) => ReactNode;
}

export interface VirtualTableProps<T> {
  columns: Array<VirtualTableColumn<T>>;
  data: T[];
  rowHeight?: number;
  onRowClick?: (row: T) => void;
  selectedId?: string | number;
  getRowId: (row: T) => string | number;
  emptyState?: ReactNode;
  onEndReached?: () => void;
  endReachedThreshold?: number;
}

type SortDirection = 'asc' | 'desc';

interface SortState {
  key: string;
  direction: SortDirection;
}

function reactNodeToSortValue(value: ReactNode): string | number {
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (value === null || value === undefined || typeof value === 'boolean') return '';
  return String(value);
}

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

const DENSITY_ROW_HEIGHT = {
  comfortable: 60,
  standard: 44,
  compact: 30,
} as const;

export function VirtualTable<T>({
  columns,
  data,
  rowHeight,
  onRowClick,
  selectedId,
  getRowId,
  emptyState,
  onEndReached,
  endReachedThreshold = 5,
}: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const lastEndReachedCountRef = useRef(0);
  const density = usePreferenceStore((state) => state.density);
  const resolvedRowHeight = rowHeight ?? DENSITY_ROW_HEIGHT[density];
  const [sort, setSort] = useState<SortState | null>(null);
  const gridTemplateColumns = columns.map((column) => (column.width ? `${column.width}px` : 'minmax(160px, 1fr)')).join(' ');

  const sortedData = useMemo(() => {
    if (!sort) return data;
    const column = columns.find((item) => item.key === sort.key);
    if (!column) return data;
    const directionFactor = sort.direction === 'asc' ? 1 : -1;
    return [...data].sort((left, right) => {
      const leftValue = reactNodeToSortValue(column.render(left));
      const rightValue = reactNodeToSortValue(column.render(right));
      return compareValues(leftValue, rightValue) * directionFactor;
    });
  }, [columns, data, sort]);

  const virtualizer = useVirtualizer({
    count: sortedData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => resolvedRowHeight,
    overscan: 12,
  });

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    if (!onEndReached || sortedData.length === 0 || virtualItems.length === 0) return;
    const lastVirtualRow = virtualItems[virtualItems.length - 1];
    const thresholdIndex = Math.max(0, sortedData.length - 1 - endReachedThreshold);
    if (lastVirtualRow.index >= thresholdIndex && lastEndReachedCountRef.current !== sortedData.length) {
      lastEndReachedCountRef.current = sortedData.length;
      onEndReached();
    }
  }, [endReachedThreshold, onEndReached, sortedData.length, virtualItems]);

  function cycleSort(column: VirtualTableColumn<T>) {
    if (!column.sortable) return;
    setSort((current) => {
      if (!current || current.key !== column.key) return { key: column.key, direction: 'asc' };
      if (current.direction === 'asc') return { key: column.key, direction: 'desc' };
      return null;
    });
  }

  function sortGlyph(column: VirtualTableColumn<T>) {
    if (!column.sortable) return null;
    if (!sort || sort.key !== column.key) return <span className={styles.sortGlyph}>↕</span>;
    return <span className={styles.sortGlyph}>{sort.direction === 'asc' ? '↑' : '↓'}</span>;
  }

  if (data.length === 0) {
    return <div className={styles.empty}>{emptyState ?? 'No records found.'}</div>;
  }

  return (
    <div className={styles.table} role="table" aria-rowcount={sortedData.length}>
      <div className={styles.header} role="row" style={{ gridTemplateColumns }}>
        {columns.map((column) => (
          <button
            type="button"
            key={column.key}
            role="columnheader"
            className={`${styles.headerCell} ${column.sortable ? styles.sortable : ''}`}
            onClick={() => cycleSort(column)}
            aria-sort={sort?.key === column.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
            disabled={!column.sortable}
          >
            <span>{column.header}</span>
            {sortGlyph(column)}
          </button>
        ))}
      </div>
      <div ref={parentRef} className={styles.viewport} style={{ height: Math.min(560, Math.max(resolvedRowHeight * 6, resolvedRowHeight * sortedData.length)) }}>
        <div className={styles.spacer} style={{ height: virtualizer.getTotalSize() }}>
          {virtualItems.map((virtualRow) => {
            const row = sortedData[virtualRow.index];
            const rowId = getRowId(row);
            const selected = selectedId !== undefined && String(selectedId) === String(rowId);
            const clickable = typeof onRowClick === 'function';
            return (
              <div
                key={String(rowId)}
                role="row"
                aria-selected={selected}
                className={`${styles.row} ${selected ? styles.selected : ''} ${clickable ? styles.clickable : ''}`}
                style={{
                  gridTemplateColumns,
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onClick={() => onRowClick?.(row)}
                tabIndex={clickable ? 0 : undefined}
                onKeyDown={(event) => {
                  if (!clickable) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onRowClick?.(row);
                  }
                }}
              >
                {columns.map((column) => (
                  <div key={column.key} role="cell" className={styles.cell}>
                    {column.render(row)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
