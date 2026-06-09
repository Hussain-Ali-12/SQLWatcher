import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, Gauge, RefreshCcw, TimerReset } from 'lucide-react';
import { MetricCard } from '../../components/ui/MetricCard';
import { useApi } from '../../hooks/useApi';
import type { TimelinePoint } from '../Overview/useOverviewData';
import { LatencyBreakdown } from './LatencyBreakdown';
import { ThroughputChart } from './ThroughputChart';
import styles from './styles.module.css';

export interface PerformanceSummary {
  total_samples: number;
  total_queries?: number;
  timed_samples?: number;
  avg_total_ms: number;
  avg_detection_ms: number;
  avg_anomaly_ms: number;
  avg_execution_ms: number;
  min_total_ms: number;
  max_total_ms: number;
  p50_total_ms: number;
  p95_total_ms: number;
  p99_total_ms: number;
  allow_count: number;
  flag_count: number;
  block_count: number;
  error_count: number;
}

const emptyPerformance: PerformanceSummary = {
  total_samples: 0,
  total_queries: 0,
  timed_samples: 0,
  avg_total_ms: 0,
  avg_detection_ms: 0,
  avg_anomaly_ms: 0,
  avg_execution_ms: 0,
  min_total_ms: 0,
  max_total_ms: 0,
  p50_total_ms: 0,
  p95_total_ms: 0,
  p99_total_ms: 0,
  allow_count: 0,
  flag_count: 0,
  block_count: 0,
  error_count: 0,
};

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatMs(value: unknown): string {
  return `${numberOrZero(value).toFixed(2)} ms`;
}

function formatCount(value: unknown): string {
  return numberOrZero(value).toLocaleString();
}

function errorRate(summary: PerformanceSummary): number {
  const total =
    numberOrZero(summary.allow_count) +
    numberOrZero(summary.flag_count) +
    numberOrZero(summary.block_count) +
    numberOrZero(summary.error_count);

  if (total === 0) return 0;
  return (numberOrZero(summary.error_count) / total) * 100;
}

function latencyTone(value: number) {
  if (value > 50) return 'critical' as const;
  if (value > 20) return 'warn' as const;
  return 'ok' as const;
}

export function PerformancePage() {
  const api = useApi();
  const [manualRefreshing, setManualRefreshing] = useState(false);

  const performanceQuery = useQuery({
    queryKey: ['performance'],
    queryFn: () => api.get<PerformanceSummary>('/performance/summary'),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  });

  const timelineQuery = useQuery({
    queryKey: ['timeline'],
    queryFn: () => api.get<TimelinePoint[]>('/timeline'),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  });

  const summary = performanceQuery.data ?? emptyPerformance;
  const timeline = timelineQuery.data ?? [];
  const errorRateValue = errorRate(summary);
  const p95 = numberOrZero(summary.p95_total_ms);
  const totalQueries = numberOrZero(summary.total_queries ?? summary.total_samples);
  const timedSamples = numberOrZero(summary.timed_samples ?? summary.total_samples);
  const isLoading = performanceQuery.isLoading || timelineQuery.isLoading;
  const isRefreshing = manualRefreshing;
  const isError = performanceQuery.isError || timelineQuery.isError;

  async function refreshPerformance() {
    setManualRefreshing(true);
    try {
      await Promise.all([performanceQuery.refetch(), timelineQuery.refetch()]);
    } finally {
      setManualRefreshing(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Performance</h1>
          <p>Latency, throughput, and decision distribution for SQLWatcher proxy traffic.</p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.sampleBadge} title={`${timedSamples.toLocaleString()} timed latency sample(s)`}>
            <span>Queries</span>
            <strong>{formatCount(totalQueries)}</strong>
          </div>
          <button type="button" className={styles.refreshButton} onClick={refreshPerformance} disabled={isRefreshing}>
            <RefreshCcw size={14} aria-hidden="true" className={isRefreshing ? styles.spinning : undefined} />
            {isRefreshing ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      </header>

      {isError ? (
        <div className={styles.errorBanner} role="alert">
          Performance telemetry could not be fully loaded. Panels are showing fallback values where data is missing.
        </div>
      ) : null}

      {isLoading ? <div className={styles.loading}>Loading performance telemetry…</div> : null}

      <section className={styles.kpiGrid} aria-label="Performance latency key metrics">
        <MetricCard label="P50 Latency" value={formatMs(summary.p50_total_ms)} tone={latencyTone(numberOrZero(summary.p50_total_ms))} icon={<TimerReset size={18} aria-hidden="true" />} />
        <MetricCard label="P95 Latency" value={formatMs(summary.p95_total_ms)} tone={latencyTone(p95)} icon={<Gauge size={18} aria-hidden="true" />} />
        <MetricCard label="P99 Latency" value={formatMs(summary.p99_total_ms)} tone={latencyTone(numberOrZero(summary.p99_total_ms))} icon={<Activity size={18} aria-hidden="true" />} />
        <MetricCard label="Error Rate" value={`${errorRateValue.toFixed(2)}%`} tone={errorRateValue > 0 ? 'critical' : 'ok'} icon={<AlertTriangle size={18} aria-hidden="true" />} />
      </section>

      <section className={styles.chartGrid} aria-label="Performance charts">
        <LatencyBreakdown summary={summary} />
        <ThroughputChart timeline={timeline} />
      </section>

      <section className={styles.actionGrid} aria-label="Action breakdown">
        <MetricCard label="Allowed Queries" value={formatCount(summary.allow_count)} tone="ok" />
        <MetricCard label="Flagged Queries" value={formatCount(summary.flag_count)} tone="warn" />
        <MetricCard label="Blocked Queries" value={formatCount(summary.block_count)} tone={numberOrZero(summary.block_count) > 0 ? 'critical' : 'neutral'} />
      </section>
    </div>
  );
}
