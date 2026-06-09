import { Badge, fromAction, fromSeverity } from '../../components/ui/Badge';
import type { AlertItem } from './useAlerts';
import styles from './styles.module.css';

interface AlertCardProps {
  alert: AlertItem;
  selected: boolean;
  checked: boolean;
  onSelect: () => void;
  onCheck: (event: React.MouseEvent<HTMLInputElement>) => void;
}

function severityClass(severity: string): string {
  switch (severity.toUpperCase()) {
    case 'CRITICAL':
      return styles.severityCritical;
    case 'HIGH':
      return styles.severityHigh;
    case 'MEDIUM':
      return styles.severityMedium;
    case 'LOW':
      return styles.severityLow;
    default:
      return styles.severityNone;
  }
}

function truncate(value: string, length: number): string {
  if (value.length <= length) return value;
  return `${value.slice(0, Math.max(0, length - 3))}...`;
}

function relativeTime(value: string): string {
  const then = Date.parse(value);
  if (Number.isNaN(then)) return 'unknown';
  const diff = Math.max(0, Date.now() - then);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AlertCard({ alert, selected, checked, onSelect, onCheck }: AlertCardProps) {
  const title = alert.title || `${alert.severity} alert`;
  const sqlPreview = truncate(alert.raw_sql.replace(/\s+/g, ' ').trim(), 60);

  return (
    <article
      className={`${styles.alertCard} ${severityClass(alert.severity)} ${selected ? styles.selectedCard : ''}`}
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
    >
      <div className={styles.cardTopRow}>
        <input
          type="checkbox"
          className={styles.checkBox}
          checked={checked}
          onClick={onCheck}
          onChange={() => undefined}
          aria-label={`Select alert ${alert.alert_id}`}
        />
        <div className={styles.cardTitleBlock}>
          <h3>{title}</h3>
          <span>{relativeTime(alert.created_at)}</span>
        </div>
        <strong className={styles.riskScore}>{alert.risk_score}</strong>
      </div>
      <p className={styles.sqlPreview}>{sqlPreview || 'No SQL captured'}</p>
      <div className={styles.cardMetaRow}>
        <Badge label={alert.severity} variant={fromSeverity(alert.severity)} />
        <Badge label={alert.action_taken} variant={fromAction(alert.action_taken)} />
        <Badge label={alert.status} variant={alert.status === 'OPEN' ? 'info' : alert.status === 'RESOLVED' ? 'ok' : 'none'} />
      </div>
    </article>
  );
}
