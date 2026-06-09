import { RefreshCcw } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ExportButton } from '../../components/ui/ExportButton';
import type { LogFilters, LogRow } from './useLogs';
import styles from './styles.module.css';

const ACTIONS = ['', 'ALLOW', 'FLAG', 'BLOCK', 'ERROR'];
const SEVERITIES = ['', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const EXPORT_COLUMNS = [
  { key: 'timestamp', header: 'Timestamp' },
  { key: 'db_user', header: 'DB User' },
  { key: 'action_taken', header: 'Action' },
  { key: 'severity', header: 'Severity' },
  { key: 'risk_score', header: 'Risk Score' },
  { key: 'anomaly_score', header: 'Anomaly Score' },
  { key: 'raw_sql', header: 'Raw SQL' },
];

export interface FilterBarProps {
  filters: LogFilters;
  rows: LogRow[];
  resultCount: number;
  totalCount: number;
  isFetching: boolean;
  onRefresh: () => void;
}

function labelFor(value: string): string {
  return value || 'ALL';
}

export function FilterBar({ filters, rows, resultCount, totalCount, isFetching, onRefresh }: FilterBarProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  function updateFilter(key: 'action' | 'severity', value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    navigate({ pathname: '/logs', search: next.toString() ? `?${next.toString()}` : '' });
  }

  return (
    <section className={styles.filterBar} aria-label="Log filters">
      <div className={styles.filterGroups}>
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Action</span>
          <div className={styles.chipRow}>
            {ACTIONS.map((action) => (
              <button
                key={action || 'ALL'}
                type="button"
                className={`${styles.filterChip} ${filters.action === action ? styles.activeChip : ''}`}
                onClick={() => updateFilter('action', action)}
                aria-pressed={filters.action === action}
              >
                {labelFor(action)}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Severity</span>
          <div className={styles.chipRow}>
            {SEVERITIES.map((severity) => (
              <button
                key={severity || 'ALL'}
                type="button"
                className={`${styles.filterChip} ${filters.severity === severity ? styles.activeChip : ''}`}
                onClick={() => updateFilter('severity', severity)}
                aria-pressed={filters.severity === severity}
              >
                {labelFor(severity)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.filterActions}>
        <span className={styles.resultCount}>Showing {resultCount.toLocaleString()} of {totalCount.toLocaleString()} records</span>
        <button type="button" className={styles.refreshButton} onClick={onRefresh} disabled={isFetching}>
          <RefreshCcw size={14} aria-hidden="true" />
          {isFetching ? 'Refreshing' : 'Refresh'}
        </button>
        <ExportButton data={rows as unknown as Record<string, unknown>[]} columns={EXPORT_COLUMNS} filename="sqlwatcher-logs.csv" disabled={rows.length === 0} />
      </div>
    </section>
  );
}
