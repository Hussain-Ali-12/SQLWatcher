import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../hooks/useApi';

export interface BaselineProfile {
  db_user: string;
  sample_count: number;
  query_type_distribution: Record<string, number> | null;
  common_tables: string[] | null;
  avg_table_count: number | null;
  avg_where_conditions: number | null;
  avg_has_limit: number | null;
  avg_has_select_star: number | null;
  avg_sensitive_table_count: number | null;
  avg_risk_score: number | null;
  normal_hours: number[] | null;
  model_version: string | null;
  updated_at: string | null;
  ml_enabled: boolean;
  ml_algorithm: string | null;
  ml_feature_schema: Record<string, unknown> | null;
  ml_training_error: string | null;
  baseline_maturity: string;
  baseline_confidence: string;
}

export interface AnomalyScore {
  anomaly_id: number;
  query_id: number;
  db_user: string;
  anomaly_score: number;
  statistical_score: number;
  ml_anomaly_score: number;
  anomaly_category: string;
  baseline_maturity: string;
  anomaly_confidence: string;
  anomaly_reasons: string[] | null;
  baseline_available: boolean;
  model_version: string | null;
  created_at: string;
  raw_sql: string;
  action_taken: string;
  severity: string;
  latest_feedback: string | null;
  feedback_count: number;
}

export interface ReadinessCheck {
  name: string;
  status: 'PASS' | 'CHECK' | string;
  detail: string;
}

export interface EvaluationSummary {
  policy: Record<string, unknown>;
  readiness: {
    status: string;
    summary: Record<string, number>;
    checks: ReadinessCheck[];
    recommendations: string[];
  };
  profiles: BaselineProfile[];
  recent_anomalies: AnomalyScore[];
}

export interface TrainingResponse {
  status: string;
  model_version: string;
  ml_algorithm: string;
  trained_profiles: number;
  training_filter: Record<string, unknown>;
  profiles: BaselineProfile[];
}

export interface SeedTrafficResponse {
  status?: string;
  inserted_logs?: number;
  created_alerts?: number;
  message?: string;
  [key: string]: unknown;
}

export type AnomalyFeedbackType =
  | 'CONFIRM_ANOMALY'
  | 'EXPECTED_BEHAVIOR'
  | 'FALSE_POSITIVE'
  | 'ADD_TO_BASELINE'
  | 'CREATE_RULE_SUGGESTION';

export interface AnomalyFeedbackPayload {
  query_id: number;
  anomaly_id?: number;
  feedback_type: AnomalyFeedbackType;
  notes?: string;
}

export interface AnomalyFeedbackResponse {
  feedback_id: number;
  query_id: number;
  anomaly_id: number | null;
  analyst_name: string;
  feedback_type: string;
  notes: string | null;
  applied: boolean;
  created_at: string;
}

export const mlQueryKeys = {
  profiles: ['profiles'] as const,
  anomalies: ['anomalies'] as const,
  evaluation: ['evaluation'] as const,
};

export function useMLProfiles() {
  const api = useApi();

  return useQuery({
    queryKey: mlQueryKeys.profiles,
    queryFn: () => api.get<BaselineProfile[]>('/ml/profiles'),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });
}

export function useAnomalyScores() {
  const api = useApi();

  return useQuery({
    queryKey: mlQueryKeys.anomalies,
    queryFn: () => api.get<AnomalyScore[]>('/ml/anomaly-scores'),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });
}

export function useEvaluationSummary() {
  const api = useApi();

  return useQuery({
    queryKey: mlQueryKeys.evaluation,
    queryFn: () => api.get<EvaluationSummary>('/ml/evaluation-summary'),
    refetchOnWindowFocus: false,
    staleTime: 45_000,
  });
}

export function useTrainBaseline() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<TrainingResponse, undefined>('/ml/train-baseline?include_allows_only=true'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mlQueryKeys.profiles });
      void queryClient.invalidateQueries({ queryKey: mlQueryKeys.anomalies });
      void queryClient.invalidateQueries({ queryKey: mlQueryKeys.evaluation });
    },
  });
}

export function useAnomalyFeedback() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: AnomalyFeedbackPayload) =>
      api.post<AnomalyFeedbackResponse, AnomalyFeedbackPayload>('/ml/anomaly-feedback', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mlQueryKeys.anomalies });
      void queryClient.invalidateQueries({ queryKey: mlQueryKeys.evaluation });
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

export function useSeedNormalTraffic() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<SeedTrafficResponse, undefined>('/demo/seed-normal-traffic'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
      void queryClient.invalidateQueries({ queryKey: ['logs'] });
      void queryClient.invalidateQueries({ queryKey: mlQueryKeys.profiles });
      void queryClient.invalidateQueries({ queryKey: mlQueryKeys.evaluation });
    },
  });
}
