import { Badge, fromAction, fromSeverity } from '../../components/ui/Badge';
import { HighlightedQuery } from '../../components/sql/HighlightedQuery';
import { useAuthStore } from '../../store/authStore';
import type { AlertDecision, AlertItem } from './useAlerts';
import { TriageActions } from './TriageActions';
import styles from './styles.module.css';

interface AlertDetailProps {
  alert: AlertItem | null;
  activeDecision: AlertDecision | null;
  mutationPending: boolean;
  onDecision: (alertId: number, decision: AlertDecision, notes?: string) => void;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function AlertDetail({ alert, activeDecision, mutationPending, onDecision }: AlertDetailProps) {
  const role = useAuthStore((state) => state.user?.role ?? 'viewer');

  if (!alert) {
    return (
      <section className={`${styles.detailPanel} ${styles.emptyDetail}`}>
        <h2>No alert selected</h2>
        <p>Select an alert from the queue to inspect SQL, metadata, and triage actions.</p>
      </section>
    );
  }

  const canTriage = alert.status === 'OPEN' && role !== 'viewer';

  return (
    <section className={styles.detailPanel} aria-label={`Alert ${alert.alert_id} detail`}>
      <header className={styles.detailHeader}>
        <div>
          <p className={styles.eyebrow}>Alert #{alert.alert_id}</p>
          <h2>{alert.title || `${alert.severity} alert`}</h2>
        </div>
        <strong className={styles.detailRisk}>{alert.risk_score}</strong>
      </header>

      <div className={styles.badgeRow}>
        <Badge label={alert.severity} variant={fromSeverity(alert.severity)} />
        <Badge label={alert.action_taken} variant={fromAction(alert.action_taken)} />
        <Badge label={alert.status} variant={alert.status === 'OPEN' ? 'info' : alert.status === 'RESOLVED' ? 'ok' : 'none'} />
      </div>

      <div className={styles.detailGrid}>
        <div>
          <span>Query ID</span>
          <strong>{alert.query_id}</strong>
        </div>
        <div>
          <span>Detection</span>
          <strong>{alert.detection_method || 'Unknown'}</strong>
        </div>
        <div>
          <span>Created</span>
          <strong>{formatDate(alert.created_at)}</strong>
        </div>
        <div>
          <span>Resolved</span>
          <strong>{alert.resolved_at ? formatDate(alert.resolved_at) : 'Not resolved'}</strong>
        </div>
      </div>

      <section className={styles.detailSection}>
        <h3>Description</h3>
        <p>{alert.description || 'No description provided by the detection engine.'}</p>
      </section>

      <section className={styles.detailSection}>
        <h3>SQL Query</h3>
        <HighlightedQuery sql={alert.raw_sql || ''} maxLines={12} />
      </section>

      {canTriage ? (
        <TriageActions
          alertId={alert.alert_id}
          activeDecision={activeDecision}
          disabled={mutationPending}
          onDecision={(decision, notes) => onDecision(alert.alert_id, decision, notes)}
        />
      ) : (
        <section className={styles.triageNotice}>
          {role === 'viewer' ? 'Viewer role can inspect alerts but cannot submit triage decisions.' : 'This alert is not open for triage.'}
        </section>
      )}
    </section>
  );
}
