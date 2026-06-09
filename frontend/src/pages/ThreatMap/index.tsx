import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { Badge, fromSeverity } from '../../components/ui/Badge';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useApi } from '../../hooks/useApi';
import { Heatmap } from './Heatmap';
import { RuleSparklines } from './RuleSparklines';
import { AttackerTable } from './AttackerTable';
import styles from './styles.module.css';

export interface ThreatTimelinePoint {
  hour: string;
  total: number;
  allowed: number;
  flagged: number;
  blocked: number;
  average_risk: number | null;
}

export interface ThreatAlert {
  alert_id: number;
  query_id: number;
  created_at: string;
  severity: string;
  status: string;
  title: string | null;
  description: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  raw_sql: string;
  action_taken: string;
  risk_score: number;
  detection_method: string | null;
}

export interface ThreatRule {
  rule_id: number;
  rule_name: string;
  enabled: boolean;
  severity: string;
  action: string;
  trigger_count: number;
}

interface MethodSlice {
  method: string;
  count: number;
}

const chartColors = ['var(--sev-critical)', 'var(--sev-high)', 'var(--sev-medium)', 'var(--sev-low)', 'var(--accent2)', 'var(--sev-none)'];

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function groupByDetectionMethod(alerts: ThreatAlert[]): MethodSlice[] {
  const grouped = new Map<string, number>();
  alerts.forEach((alert) => {
    const method = (alert.detection_method || 'UNKNOWN').trim() || 'UNKNOWN';
    grouped.set(method, (grouped.get(method) ?? 0) + 1);
  });

  return Array.from(grouped.entries())
    .map(([method, count]) => ({ method, count }))
    .sort((left, right) => right.count - left.count);
}

function countSeverity(alerts: ThreatAlert[], severity: string): number {
  return alerts.filter((alert) => String(alert.severity || '').toUpperCase() === severity).length;
}

function countBlocked(alerts: ThreatAlert[]): number {
  return alerts.filter((alert) => String(alert.action_taken || '').toUpperCase() === 'BLOCK').length;
}

function totalRisk(alerts: ThreatAlert[]): number {
  return alerts.reduce((sum, alert) => sum + numberOrZero(alert.risk_score), 0);
}

function MethodTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name?: string; value?: number; payload?: MethodSlice }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0];
  const method = item.payload?.method ?? item.name ?? 'UNKNOWN';
  const count = item.payload?.count ?? item.value ?? 0;

  return (
    <div className={styles.tooltip}>
      <span>{method}</span>
      <strong>{count.toLocaleString()} alerts</strong>
    </div>
  );
}

function DetectionMethodBreakdown({ data }: { data: MethodSlice[] }) {
  const navigate = useNavigate();

  return (
    <section className={styles.panel} aria-labelledby="method-breakdown-title">
      <div className={styles.panelHeader}>
        <div>
          <h2 id="method-breakdown-title">Detection Methods</h2>
          <p>Alert counts grouped by detection engine method.</p>
        </div>
      </div>

      {data.length === 0 ? (
        <div className={styles.emptyState}>No detection method data available.</div>
      ) : (
        <div className={styles.donutLayout}>
          <div className={styles.donutChart}>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Tooltip content={<MethodTooltip />} />
                <Pie
                  data={data}
                  dataKey="count"
                  nameKey="method"
                  innerRadius={58}
                  outerRadius={92}
                  paddingAngle={2}
                  onClick={(slice) => {
                    const method = typeof slice.method === 'string' ? slice.method : '';
                    if (method) navigate(`/logs?method=${encodeURIComponent(method)}`);
                  }}
                  label={(entry) => {
                    const payload = entry as unknown as Partial<MethodSlice>;
                    return `${payload.method ?? 'UNKNOWN'}: ${payload.count ?? 0}`;
                  }}
                  labelLine={false}
                >
                  {data.map((entry, index) => (
                    <Cell key={entry.method} fill={chartColors[index % chartColors.length]} className={styles.clickableSlice} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className={styles.methodList}>
            {data.map((entry, index) => (
              <button
                type="button"
                key={entry.method}
                className={styles.methodItem}
                onClick={() => navigate(`/logs?method=${encodeURIComponent(entry.method)}`)}
              >
                <span className={styles.methodSwatch} style={{ backgroundColor: chartColors[index % chartColors.length] }} />
                <span className={styles.methodName}>{entry.method}</span>
                <span className={styles.methodCount}>{entry.count.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function ThreatMapPage() {
  const api = useApi();

  const timelineQuery = useQuery({
    queryKey: ['timeline'],
    queryFn: () => api.get<ThreatTimelinePoint[]>('/timeline'),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const alertsQuery = useQuery({
    queryKey: ['alerts', 'threat-map'],
    queryFn: () => api.get<ThreatAlert[]>('/alerts?limit=500'),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const rulesQuery = useQuery({
    queryKey: ['rules', 'threat-map'],
    queryFn: () => api.get<ThreatRule[]>('/rules'),
    refetchOnWindowFocus: false,
    staleTime: 45_000,
  });

  const timeline = timelineQuery.data ?? [];
  const alerts = alertsQuery.data ?? [];
  const rules = rulesQuery.data ?? [];
  const methods = useMemo(() => groupByDetectionMethod(alerts), [alerts]);
  const isLoading = timelineQuery.isLoading || alertsQuery.isLoading || rulesQuery.isLoading;
  const error = timelineQuery.error ?? alertsQuery.error ?? rulesQuery.error;
  const highAndCritical = countSeverity(alerts, 'CRITICAL') + countSeverity(alerts, 'HIGH');
  const blocked = countBlocked(alerts);
  const risk = totalRisk(alerts);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1>Threat Map</h1>
          <p>Visualised attack patterns across time, rules, and sources.</p>
        </div>
        <div className={styles.headerMeta}>
          <StatusBadge status={error ? 'error' : isLoading ? 'loading' : 'ok'} label={error ? 'Partial data' : isLoading ? 'Loading' : 'Live data'} />
          <span>{timeline.length.toLocaleString()} timeline bins</span>
        </div>
      </header>

      {error ? <div className={styles.errorBanner}>Threat Map data could not be fully loaded. Available panels are showing cached or fallback data.</div> : null}

      <section className={styles.summaryGrid} aria-label="Threat map summary">
        <div className={styles.summaryCard}>
          <span>Total Alerts</span>
          <strong>{alerts.length.toLocaleString()}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span>High + Critical</span>
          <strong>{highAndCritical.toLocaleString()}</strong>
          <Badge label="severity" variant={fromSeverity(highAndCritical > 0 ? 'HIGH' : 'NONE')} />
        </div>
        <div className={styles.summaryCard}>
          <span>Blocked</span>
          <strong>{blocked.toLocaleString()}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span>Total Risk</span>
          <strong>{risk.toFixed(0)}</strong>
        </div>
      </section>

      <Heatmap alerts={alerts} />

      <section className={styles.gridTwo}>
        <RuleSparklines rules={rules} />
        <div className={styles.stackPanels}>
          <AttackerTable alerts={alerts} />
          <DetectionMethodBreakdown data={methods} />
        </div>
      </section>
    </div>
  );
}
