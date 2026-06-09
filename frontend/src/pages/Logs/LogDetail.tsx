import { AlertCircle, Database, FileText, Gauge, ShieldAlert, UserRound } from 'lucide-react';
import { Badge, fromAction, fromSeverity } from '../../components/ui/Badge';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { HighlightedQuery } from '../../components/sql/HighlightedQuery';
import type { LogDetailRow, LogRow } from './useLogs';
import styles from './styles.module.css';

export interface LogDetailProps {
  row: LogRow | null;
  detail: LogDetailRow | null;
  loading: boolean;
  error?: Error | null;
}

function formatTimestamp(value?: string | null): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function splitExplanation(explanation?: string | null): { main: string; proxyNote: string | null } {
  const fallback = 'No explanation was recorded for this query.';
  if (!explanation || !explanation.trim()) return { main: fallback, proxyNote: null };

  const sentences = explanation
    .split(/(?<=\.)\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const proxySentences = sentences.filter((part) => /\bproxy\b/i.test(part) && /\b(capture|captured|fast-path|inspection|local|forward)/i.test(part));
  const mainSentences = sentences.filter((part) => !proxySentences.includes(part));

  if (proxySentences.length === 0 || mainSentences.length === 0) {
    return { main: explanation, proxyNote: proxySentences.length > 0 ? proxySentences.join(' ') : null };
  }

  return {
    main: mainSentences.join(' '),
    proxyNote: proxySentences.join(' '),
  };
}

function featureEntries(features: Record<string, unknown> | null | undefined): Array<[string, unknown]> {
  if (!features) return [];
  return Object.entries(features).filter(([key]) => !['query_id', 'created_at'].includes(key));
}

export function LogDetail({ row, detail, loading, error }: LogDetailProps) {
  if (!row) {
    return (
      <div className={styles.detailEmpty}>
        <FileText size={22} aria-hidden="true" />
        <p>Select a log row to inspect query metadata, SQL, anomaly features, and detection context.</p>
      </div>
    );
  }

  const merged = detail ?? row;
  const explanation = splitExplanation(merged.explanation);
  const normalizedSql = 'normalized_sql' in merged ? merged.normalized_sql : null;
  const anomaly = detail?.anomaly ?? null;
  const anomalyScore = anomaly?.anomaly_score ?? row.anomaly_score ?? null;
  const entries = featureEntries(detail?.features);

  return (
    <div className={styles.detailContent}>
      {loading ? <div className={styles.inlineNotice}>Loading full log detail...</div> : null}
      {error ? <div className={styles.errorBanner}>{error.message}</div> : null}

      <section className={styles.detailSection}>
        <div className={styles.detailHeaderRow}>
          <div>
            <p className={styles.detailEyebrow}>Query #{row.query_id}</p>
            <h3 className={styles.detailTitle}>{row.query_type || 'SQL query'}</h3>
          </div>
          <div className={styles.badgeStack}>
            <Badge label={row.action_taken || 'NONE'} variant={fromAction(row.action_taken || 'NONE')} />
            <Badge label={row.severity || 'NONE'} variant={fromSeverity(row.severity || 'NONE')} />
          </div>
        </div>

        <div className={styles.metaGrid}>
          <div>
            <UserRound size={14} aria-hidden="true" />
            <span>DB User</span>
            <strong>{row.db_user || 'unknown'}</strong>
          </div>
          <div>
            <Database size={14} aria-hidden="true" />
            <span>Client IP</span>
            <strong>{row.client_ip || 'unknown'}</strong>
          </div>
          <div>
            <ShieldAlert size={14} aria-hidden="true" />
            <span>Risk</span>
            <strong>{row.risk_score}</strong>
          </div>
          <div>
            <Gauge size={14} aria-hidden="true" />
            <span>Anomaly</span>
            <strong>{anomalyScore === null || anomalyScore === undefined ? '—' : Number(anomalyScore).toFixed(1)}</strong>
          </div>
        </div>
      </section>

      <section className={styles.detailSection}>
        <div className={styles.sectionTitle}>Raw SQL</div>
        <HighlightedQuery sql={row.raw_sql || ''} maxLines={12} />
      </section>

      {normalizedSql ? (
        <section className={styles.detailSection}>
          <div className={styles.sectionTitle}>Normalized SQL</div>
          <HighlightedQuery sql={normalizedSql} maxLines={8} />
        </section>
      ) : null}

      <section className={styles.detailSection}>
        <div className={styles.sectionTitle}>Detection context</div>
        <div className={styles.contextGrid}>
          <div>
            <span>Detection method</span>
            <strong>{row.detection_method || 'unknown'}</strong>
          </div>
          <div>
            <span>Timestamp</span>
            <strong>{formatTimestamp(row.timestamp)}</strong>
          </div>
        </div>
        <p className={styles.explanation}>{explanation.main}</p>
        {explanation.proxyNote ? <p className={styles.proxyNote}>Proxy capture note: {explanation.proxyNote}</p> : null}
      </section>

      <section className={styles.detailSection}>
        <div className={styles.sectionTitle}>Anomaly metadata</div>
        {anomaly ? (
          <div className={styles.anomalyBox}>
            <StatusBadge status={anomaly.baseline_available ? 'ok' : 'warn'} label={anomaly.baseline_available ? 'Baseline available' : 'Baseline unavailable'} />
            <div className={styles.contextGrid}>
              <div>
                <span>Model version</span>
                <strong>{anomaly.model_version || '—'}</strong>
              </div>
              <div>
                <span>Feedback</span>
                <strong>{anomaly.feedback_label || '—'}</strong>
              </div>
            </div>
            {anomaly.anomaly_reasons ? <pre className={styles.jsonBlock}>{formatValue(anomaly.anomaly_reasons)}</pre> : null}
          </div>
        ) : (
          <div className={styles.inlineNotice}>No anomaly score detail was recorded for this query.</div>
        )}
      </section>

      <section className={styles.detailSection}>
        <div className={styles.sectionTitle}>Feature vector</div>
        {entries.length > 0 ? (
          <div className={styles.featureGrid}>
            {entries.map(([key, value]) => (
              <div key={key}>
                <span>{key}</span>
                <strong>{formatValue(value)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.inlineNotice}>Feature vector not available for this query.</div>
        )}
      </section>

      {detail?.feedback && detail.feedback.length > 0 ? (
        <section className={styles.detailSection}>
          <div className={styles.sectionTitle}>Analyst feedback</div>
          <div className={styles.feedbackList}>
            {detail.feedback.map((item) => (
              <article key={item.feedback_id}>
                <div>
                  <strong>{item.feedback_type}</strong>
                  <span>{formatTimestamp(item.created_at)}</span>
                </div>
                <p>{item.notes || 'No notes recorded.'}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!detail && !loading ? (
        <div className={styles.inlineNotice}>
          <AlertCircle size={14} aria-hidden="true" />
          Showing summary fields only. Open detail endpoint did not return additional metadata.
        </div>
      ) : null}
    </div>
  );
}
