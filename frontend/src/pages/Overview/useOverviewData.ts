import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../hooks/useApi';

export interface StatsResponse {
  total_queries: number;
  allowed_queries: number;
  flagged_queries: number;
  blocked_queries: number;
  critical_alerts: number;
  high_alerts: number;
  medium_alerts?: number;
  low_alerts?: number;
  average_risk_score: number;
  open_alerts: number;
  anomaly_scores?: number;
  max_anomaly_score?: number;
}

export interface TimelinePoint {
  hour: string;
  total: number;
  allowed: number;
  flagged: number;
  blocked: number;
  average_risk: number | null;
}

export interface AlertSummary {
  alert_id: number;
  query_id: number;
  created_at: string;
  severity: string;
  status: string;
  title: string;
  description: string;
  resolved_by?: string | null;
  resolved_at?: string | null;
  raw_sql: string;
  action_taken: string;
  risk_score: number;
  detection_method: string;
}

export interface HealthCheck {
  ok?: boolean;
  latency_ms?: number;
  count?: number;
  [key: string]: unknown;
}

export interface HealthResponse {
  status: string;
  database?: string;
  sqlwatcher_database?: string;
  target_database?: string;
  service?: string;
  checks?: {
    control_db?: HealthCheck;
    target_db?: HealthCheck;
    proxy_token_configured?: HealthCheck;
    pending_migrations?: HealthCheck;
    ws_connections?: HealthCheck;
    [key: string]: HealthCheck | undefined;
  };
}

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

export interface RuleSummary {
  rule_id: number;
  rule_name: string;
  enabled: boolean;
  severity: string;
  action: string;
  trigger_count: number;
}

const emptyStats: StatsResponse = {
  total_queries: 0,
  allowed_queries: 0,
  flagged_queries: 0,
  blocked_queries: 0,
  critical_alerts: 0,
  high_alerts: 0,
  medium_alerts: 0,
  low_alerts: 0,
  average_risk_score: 0,
  open_alerts: 0,
  anomaly_scores: 0,
  max_anomaly_score: 0,
};

const emptyHealth: HealthResponse = {
  status: 'unknown',
};

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

export function useOverviewData() {
  const api = useApi();

  const statsQuery = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.get<StatsResponse>('/stats'),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });

  const timelineQuery = useQuery({
    queryKey: ['timeline'],
    queryFn: () => api.get<TimelinePoint[]>('/timeline'),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });

  const alertsQuery = useQuery({
    queryKey: ['alerts', 'open'],
    queryFn: () => api.get<AlertSummary[]>('/alerts?limit=5'),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });

  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<HealthResponse>('/health'),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const performanceQuery = useQuery({
    queryKey: ['performance'],
    queryFn: () => api.get<PerformanceSummary>('/performance/summary'),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });

  const rulesQuery = useQuery({
    queryKey: ['rules', 'active-count'],
    queryFn: () => api.get<RuleSummary[]>('/rules'),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  return {
    stats: statsQuery.data ?? emptyStats,
    timeline: timelineQuery.data ?? [],
    alerts: alertsQuery.data ?? [],
    health: healthQuery.data ?? emptyHealth,
    performance: performanceQuery.data ?? emptyPerformance,
    activeRulesCount: (rulesQuery.data ?? []).filter((rule) => rule.enabled).length,
    queries: {
      stats: statsQuery,
      timeline: timelineQuery,
      alerts: alertsQuery,
      health: healthQuery,
      performance: performanceQuery,
      rules: rulesQuery,
    },
    isLoading:
      statsQuery.isLoading ||
      timelineQuery.isLoading ||
      alertsQuery.isLoading ||
      healthQuery.isLoading ||
      performanceQuery.isLoading,
    isError:
      statsQuery.isError ||
      timelineQuery.isError ||
      alertsQuery.isError ||
      healthQuery.isError ||
      performanceQuery.isError,
  };
}
