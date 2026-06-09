import { MessageSquareWarning } from 'lucide-react';
import { Badge, fromAction, fromSeverity } from '../../components/ui/Badge';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { VirtualTable } from '../../components/ui/VirtualTable';
import type { AnomalyScore } from './useML';
import styles from './styles.module.css';

export interface AnomalyTableProps {
  anomalies: AnomalyScore[];
  selectedId?: number;
  onSelect: (item: AnomalyScore) => void;
  onFeedback: (item: AnomalyScore) => void;
}

function formatRelative(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function firstReason(item: AnomalyScore) {
  const reasons = item.anomaly_reasons ?? [];
  return reasons[0] ?? 'No anomaly reason recorded.';
}

function scoreClass(score: number) {
  if (score > 80) return styles.scoreCritical;
  if (score > 60) return styles.scoreHigh;
  return styles.scoreMedium;
}

export function AnomalyTable({ anomalies, selectedId, onSelect, onFeedback }: AnomalyTableProps) {
  return (
    <VirtualTable
      data={anomalies}
      selectedId={selectedId}
      getRowId={(row) => row.anomaly_id}
      onRowClick={onSelect}
      rowHeight={50}
      emptyState={
        <div className={styles.emptyState}>
          <MessageSquareWarning size={18} />
          <span>No anomaly scores found. Train a baseline and run query traffic to populate this view.</span>
        </div>
      }
      columns={[
        {
          key: 'db_user',
          header: 'DB User',
          width: 130,
          sortable: true,
          render: (row) => <span className={styles.monoCell}>{row.db_user}</span>,
        },
        {
          key: 'score',
          header: 'Score',
          width: 90,
          sortable: true,
          render: (row) => <span className={`${styles.scoreCell} ${scoreClass(Number(row.anomaly_score ?? 0))}`}>{row.anomaly_score}</span>,
        },
        {
          key: 'reasons',
          header: 'Reasons',
          sortable: false,
          render: (row) => (
            <span className={styles.reasonCell} title={(row.anomaly_reasons ?? []).join('\n')}>
              {firstReason(row)}
            </span>
          ),
        },
        {
          key: 'baseline',
          header: 'Baseline',
          width: 130,
          sortable: true,
          render: (row) => <StatusBadge status={row.baseline_available ? 'ok' : 'idle'} label={row.baseline_available ? 'Available' : 'Missing'} />,
        },
        {
          key: 'feedback',
          header: 'Feedback',
          width: 170,
          sortable: true,
          render: (row) =>
            row.latest_feedback ? (
              <Badge label={row.latest_feedback} variant="info" />
            ) : (
              <button
                type="button"
                className={styles.inlineButton}
                onClick={(event) => {
                  event.stopPropagation();
                  onFeedback(row);
                }}
              >
                Give feedback
              </button>
            ),
        },
        {
          key: 'action',
          header: 'Action',
          width: 90,
          sortable: true,
          render: (row) => <Badge label={row.action_taken ?? 'NONE'} variant={fromAction(row.action_taken ?? '')} />,
        },
        {
          key: 'severity',
          header: 'Severity',
          width: 100,
          sortable: true,
          render: (row) => <Badge label={row.severity ?? 'NONE'} variant={fromSeverity(row.severity ?? '')} />,
        },
        {
          key: 'time',
          header: 'Time',
          width: 110,
          sortable: true,
          render: (row) => (
            <span className={styles.timestampCell} title={new Date(row.created_at).toLocaleString()}>
              {formatRelative(row.created_at)}
            </span>
          ),
        },
      ]}
    />
  );
}
