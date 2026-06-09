import { useMemo, useState } from 'react';
import { Copy, Database, FileJson, ShieldAlert } from 'lucide-react';
import { Badge, fromAction, fromSeverity } from '../../components/ui/Badge';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Tabs } from '../../components/ui/Tabs';
import { HighlightedQuery } from '../../components/sql/HighlightedQuery';
import type { QueryResponse } from './useConsole';
import styles from './styles.module.css';

export interface ResponsePanelProps {
  response: QueryResponse;
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function rowsFromObject(value: unknown): Array<[string, unknown]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>);
}

function normalizeReasons(response: QueryResponse): string[] {
  if (Array.isArray(response.anomaly_reasons)) return response.anomaly_reasons;
  const anomaly = response.anomaly;
  if (anomaly && typeof anomaly === 'object') {
    const reasons = (anomaly as { anomaly_reasons?: unknown; reasons?: unknown }).anomaly_reasons ??
      (anomaly as { reasons?: unknown }).reasons;
    if (Array.isArray(reasons)) return reasons.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

function anomalyScore(response: QueryResponse): number | null {
  if (typeof response.anomaly_score === 'number') return response.anomaly_score;
  const anomaly = response.anomaly;
  if (anomaly && typeof anomaly === 'object') {
    const score = (anomaly as { anomaly_score?: unknown; score?: unknown }).anomaly_score ?? (anomaly as { score?: unknown }).score;
    return typeof score === 'number' ? score : null;
  }
  return null;
}

function baselineAvailable(response: QueryResponse): boolean | null {
  if (typeof response.baseline_available === 'boolean') return response.baseline_available;
  const anomaly = response.anomaly;
  if (anomaly && typeof anomaly === 'object') {
    const value = (anomaly as { baseline_available?: unknown }).baseline_available;
    return typeof value === 'boolean' ? value : null;
  }
  return null;
}

function modelVersion(response: QueryResponse): string | null {
  if (typeof response.model_version === 'string') return response.model_version;
  const anomaly = response.anomaly;
  if (anomaly && typeof anomaly === 'object') {
    const value = (anomaly as { model_version?: unknown }).model_version;
    return typeof value === 'string' ? value : null;
  }
  return null;
}

function ResultsPreview({ data }: { data: Array<Record<string, unknown>> | null }) {
  if (!data || data.length === 0) {
    return <p className={styles.emptyText}>No database rows returned.</p>;
  }

  const columns = Array.from(
    data.reduce((keys, row) => {
      Object.keys(row).forEach((key) => keys.add(key));
      return keys;
    }, new Set<string>()),
  );

  return (
    <div className={styles.resultsBlock}>
      <div className={styles.resultsHeader}>
        <span>Returned rows</span>
        <span>{data.length} row{data.length === 1 ? '' : 's'}</span>
      </div>
      <div className={styles.resultsTableWrap}>
        <table className={styles.resultsTable}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 20).map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column}>{stringifyValue(row[column])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.length > 20 ? <p className={styles.tableNote}>Showing first 20 rows in the console preview.</p> : null}
    </div>
  );
}

export function ResponsePanel({ response }: ResponsePanelProps) {
  const [activeTab, setActiveTab] = useState('decision');
  const [showNormalized, setShowNormalized] = useState(false);
  const rawJson = useMemo(() => JSON.stringify(response, null, 2), [response]);
  const features = rowsFromObject(response.features);
  const score = anomalyScore(response);
  const reasons = normalizeReasons(response);
  const baseline = baselineAvailable(response);
  const version = modelVersion(response);
  const normalizedSql = response.normalized_sql ?? response.normalised_sql ?? null;
  // TODO: request normalised_sql field from backend if the console response does not include it.

  async function copyJson() {
    await navigator.clipboard.writeText(rawJson);
  }

  return (
    <section className={`${styles.responsePanel} ${styles[`action${response.action.toUpperCase()}`] ?? ''}`} aria-label="Query response">
      <div className={styles.responseHeader}>
        <div>
          <p className={styles.eyebrow}>Inspection result</p>
          <h2>Response Panel</h2>
        </div>
        <button type="button" className={styles.secondaryButton} onClick={copyJson}>
          <Copy size={14} aria-hidden="true" />
          Copy JSON
        </button>
      </div>

      <Tabs
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          { key: 'decision', label: 'Decision', icon: <ShieldAlert size={14} aria-hidden="true" /> },
          { key: 'features', label: 'Features', icon: <Database size={14} aria-hidden="true" /> },
          { key: 'anomaly', label: 'Anomaly', icon: <FileJson size={14} aria-hidden="true" /> },
        ]}
      >
        <Tabs.Panel tabKey="decision">
          <div className={styles.decisionGrid}>
            <div className={styles.decisionCard}>
              <span>Decision</span>
              <Badge label={response.action || 'UNKNOWN'} variant={fromAction(response.action || 'NONE')} />
            </div>
            <div className={styles.decisionCard}>
              <span>Severity</span>
              <Badge label={response.severity || 'NONE'} variant={fromSeverity(response.severity || 'NONE')} />
            </div>
            <div className={styles.decisionCard}>
              <span>Risk Score</span>
              <strong>{response.risk_score ?? 0}</strong>
            </div>
          </div>

          <div className={styles.explanationBox}>
            <span>Explanation</span>
            <p>{response.explanation || 'No explanation returned.'}</p>
          </div>

          {normalizedSql ? (
            <div className={styles.normalizedBlock}>
              <button type="button" className={styles.inlineToggle} onClick={() => setShowNormalized((value) => !value)}>
                {showNormalized ? 'Hide Normalised SQL' : 'Show Normalised SQL'}
              </button>
              {showNormalized ? <HighlightedQuery sql={normalizedSql} maxLines={8} /> : null}
            </div>
          ) : null}

          <ResultsPreview data={response.data} />
        </Tabs.Panel>

        <Tabs.Panel tabKey="features">
          {features.length > 0 ? (
            <div className={styles.keyValueGrid}>
              {features.map(([key, value]) => (
                <div key={key} className={styles.keyValueItem}>
                  <span>{key}</span>
                  <code>{stringifyValue(value)}</code>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.emptyText}>Feature vector not available for this query type.</p>
          )}
        </Tabs.Panel>

        <Tabs.Panel tabKey="anomaly">
          {score === null ? (
            <p className={styles.emptyText}>Anomaly scoring not available — baseline may not be trained.</p>
          ) : (
            <div className={styles.anomalySummary}>
              <div className={styles.anomalyScoreBox}>
                <span>Anomaly score</span>
                <strong>{score}</strong>
              </div>
              <StatusBadge
                status={baseline ? 'ok' : 'warn'}
                label={baseline === null ? 'Baseline unknown' : baseline ? 'Baseline available' : 'Baseline unavailable'}
              />
              {version ? <code className={styles.modelVersion}>Model {version}</code> : null}
            </div>
          )}

          {reasons.length > 0 ? (
            <ul className={styles.reasonList}>
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : score !== null ? (
            <p className={styles.emptyText}>No anomaly reasons returned.</p>
          ) : null}
        </Tabs.Panel>
      </Tabs>
    </section>
  );
}
