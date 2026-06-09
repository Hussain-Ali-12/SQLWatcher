import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';

export type LogAction = 'ALLOW' | 'FLAG' | 'BLOCK' | 'ERROR' | string;
export type LogSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' | string;

export interface LogRow {
  query_id: number;
  timestamp: string;
  client_ip: string | null;
  db_user: string | null;
  raw_sql: string;
  query_type: string | null;
  risk_score: number;
  severity: LogSeverity;
  detection_method: string | null;
  action_taken: LogAction;
  explanation: string | null;
  anomaly_score: number | null;
}

export interface LogFeedbackItem {
  feedback_id: number;
  analyst_name: string;
  feedback_type: string;
  notes: string | null;
  created_at: string;
}

export interface LogAnomalyDetail {
  anomaly_id?: number;
  query_id?: number;
  db_user?: string | null;
  anomaly_score?: number | null;
  anomaly_reasons?: string[] | string | null;
  baseline_available?: boolean | null;
  model_version?: string | null;
  feedback_label?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
}

export interface LogDetailRow extends Omit<LogRow, 'anomaly_score'> {
  normalized_sql: string | null;
  feedback: LogFeedbackItem[];
  features: Record<string, unknown> | null;
  anomaly: LogAnomalyDetail | null;
}

export interface LogFilters {
  action: string;
  severity: string;
  method: string;
}

export interface LogCountResponse {
  total: number;
  action: string | null;
  severity: string | null;
}

function buildLogsPath(filters: LogFilters, limit: number): string {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', '0');
  if (filters.action) params.set('action', filters.action);
  if (filters.severity) params.set('severity', filters.severity);
  return `/logs?${params.toString()}`;
}

function buildLogsCountPath(filters: LogFilters): string {
  const params = new URLSearchParams();
  if (filters.action) params.set('action', filters.action);
  if (filters.severity) params.set('severity', filters.severity);
  const query = params.toString();
  return query ? `/logs/count?${query}` : '/logs/count';
}

export function useLogFilters(): LogFilters {
  const [searchParams] = useSearchParams();

  return useMemo(
    () => ({
      action: searchParams.get('action') ?? '',
      severity: searchParams.get('severity') ?? '',
      method: searchParams.get('method') ?? '',
    }),
    [searchParams],
  );
}

export function useLogs(limit: number) {
  const api = useApi();
  const filters = useLogFilters();

  return useQuery({
    queryKey: ['logs', filters.action, filters.severity, limit],
    queryFn: () => api.get<LogRow[]>(buildLogsPath(filters, limit)),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  });
}

export function useLogCount() {
  const api = useApi();
  const filters = useLogFilters();

  return useQuery({
    queryKey: ['logs', 'count', filters.action, filters.severity],
    queryFn: () => api.get<LogCountResponse>(buildLogsCountPath(filters)),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  });
}

export function useLogDetail(queryId: number | null) {
  const api = useApi();

  return useQuery({
    queryKey: ['logs', 'detail', queryId],
    queryFn: () => api.get<LogDetailRow>(`/logs/${queryId}`),
    enabled: queryId !== null,
    staleTime: 15_000,
  });
}
