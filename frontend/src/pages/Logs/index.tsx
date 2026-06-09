import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, fromAction, fromSeverity } from '../../components/ui/Badge';
import { DetailDrawer } from '../../components/ui/DetailDrawer';
import { VirtualTable } from '../../components/ui/VirtualTable';
import type { VirtualTableColumn } from '../../components/ui/VirtualTable';
import { HighlightedQuery } from '../../components/sql/HighlightedQuery';
import { FilterBar } from './FilterBar';
import { LogDetail } from './LogDetail';
import type { LogRow } from './useLogs';
import { useLogCount, useLogDetail, useLogFilters, useLogs } from './useLogs';
import styles from './styles.module.css';

const INITIAL_LIMIT = 500;
const LIMIT_STEP = 500;
const MAX_LIMIT = 5000;

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function sqlPreview(sql: string, length = 150): string {
  const compact = sql.replace(/\s+/g, ' ').trim();
  if (compact.length <= length) return compact;
  return `${compact.slice(0, length - 1)}…`;
}

function riskClass(score: number): string {
  if (score >= 90) return styles.riskCritical;
  if (score >= 70) return styles.riskHigh;
  if (score >= 40) return styles.riskMedium;
  return styles.riskLow;
}

function anomalyText(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return Number(value).toFixed(1);
}

function cell(content: ReactNode, className?: string) {
  return <span className={className}>{content}</span>;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(query).matches));

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);

  return matches;
}

export function LogsPage() {
  const filters = useLogFilters();
  const [searchParams] = useSearchParams();
  const [limit, setLimit] = useState(INITIAL_LIMIT);
  const [selectedQueryId, setSelectedQueryId] = useState<number | null>(null);
  const logsQuery = useLogs(limit);
  const countQuery = useLogCount();
  const detailQuery = useLogDetail(selectedQueryId);
  const narrowTable = useMediaQuery('(max-width: 900px)');

  useEffect(() => {
    setLimit(INITIAL_LIMIT);
    setSelectedQueryId(null);
  }, [filters.action, filters.severity, filters.hour, filters.day, filters.method]);

  const rows = logsQuery.data ?? [];
  const totalMatching = countQuery.data?.total ?? rows.length;
  const selectedRow = useMemo(() => rows.find((row) => row.query_id === selectedQueryId) ?? null, [rows, selectedQueryId]);
  const hasMore = rows.length < totalMatching && limit < MAX_LIMIT;
  const unsupportedUrlFilters = ['hour', 'day', 'method'].filter((key) => searchParams.has(key));

  const refreshLogs = useCallback(() => {
    void logsQuery.refetch();
    void countQuery.refetch();
  }, [countQuery, logsQuery]);

  const loadMore = useCallback(() => {
    if (!hasMore || logsQuery.isFetching) return;
    setLimit((current) => Math.min(MAX_LIMIT, current + LIMIT_STEP));
  }, [hasMore, logsQuery.isFetching]);

  const columns = useMemo<Array<VirtualTableColumn<LogRow>>>(
    () => {
      const allColumns: Array<VirtualTableColumn<LogRow>> = [
      {
        key: 'timestamp',
        header: 'Timestamp',
        width: 134,
        sortable: true,
        render: (row) => cell(formatTimestamp(row.timestamp), styles.timestampCell),
      },
      {
        key: 'db_user',
        header: 'DB User',
        width: 94,
        sortable: true,
        render: (row) => cell(row.db_user || 'unknown', styles.monoCell),
      },
      {
        key: 'action_taken',
        header: 'Action',
        width: 84,
        sortable: true,
        render: (row) => <Badge label={row.action_taken || 'NONE'} variant={fromAction(row.action_taken || 'NONE')} />,
      },
      {
        key: 'severity',
        header: 'Severity',
        width: 92,
        sortable: true,
        render: (row) => <Badge label={row.severity || 'NONE'} variant={fromSeverity(row.severity || 'NONE')} />,
      },
      {
        key: 'risk_score',
        header: 'Risk',
        width: 58,
        sortable: true,
        render: (row) => cell(row.risk_score, `${styles.riskCell} ${riskClass(row.risk_score)}`),
      },
      {
        key: 'anomaly_score',
        header: 'ML',
        width: 64,
        sortable: true,
        render: (row) => cell(anomalyText(row.anomaly_score), styles.monoCell),
      },
      {
        key: 'raw_sql',
        header: 'SQL Preview',
        render: (row) => <HighlightedQuery sql={sqlPreview(row.raw_sql)} compact />, 
      },
    ];

      if (!narrowTable) return allColumns;
      return allColumns.filter((column) => column.key !== 'db_user' && column.key !== 'anomaly_score');
    },
    [narrowTable],
  );

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1>Logs</h1>
          <p>Virtualized query ledger with URL-driven filters, CSV export, and detailed SQL inspection.</p>
        </div>
      </header>

      {logsQuery.error ? <div className={styles.errorBanner}>{logsQuery.error.message}</div> : null}

      {unsupportedUrlFilters.length > 0 ? (
        <div className={styles.infoBanner}>
          {unsupportedUrlFilters.map((key) => `${key}=${searchParams.get(key)}`).join(', ')} filter not yet supported by the API — showing all logs that match supported filters.
        </div>
      ) : null}

      <FilterBar
        filters={filters}
        rows={rows}
        resultCount={rows.length}
        totalCount={totalMatching}
        isFetching={logsQuery.isFetching || countQuery.isFetching}
        onRefresh={refreshLogs}
      />

      <section className={styles.tablePanel} aria-label="Query log records">
        <VirtualTable
          columns={columns}
          data={rows}
          selectedId={selectedQueryId ?? undefined}
          getRowId={(row) => row.query_id}
          onRowClick={(row) => setSelectedQueryId(row.query_id)}
          onEndReached={loadMore}
          endReachedThreshold={5}
          emptyState={logsQuery.isLoading ? 'Loading query logs...' : 'No query logs match the current filters.'}
        />
        <div className={styles.loadState}>
          {logsQuery.isFetching && rows.length > 0 ? 'Fetching latest records...' : null}
          {!logsQuery.isFetching && hasMore ? 'Scroll near the bottom to load more records.' : null}
          {!logsQuery.isFetching && !hasMore && rows.length > 0 ? `Loaded ${rows.length} of ${totalMatching} matching records.` : null}
        </div>
      </section>

      <DetailDrawer
        open={selectedQueryId !== null}
        onClose={() => setSelectedQueryId(null)}
        title={selectedRow ? `Query #${selectedRow.query_id}` : 'Query detail'}
        subtitle={selectedRow ? formatTimestamp(selectedRow.timestamp) : undefined}
        width={620}
      >
        <LogDetail
          row={selectedRow}
          detail={detailQuery.data ?? null}
          loading={detailQuery.isLoading || detailQuery.isFetching}
          error={detailQuery.error ?? null}
        />
      </DetailDrawer>
    </div>
  );
}
