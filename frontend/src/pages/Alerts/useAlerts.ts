import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../hooks/useApi';

export type AlertStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'ESCALATED' | string;
export type AlertDecision = 'confirm_block' | 'allow_instance' | 'false_positive' | 'escalate';

export interface AlertItem {
  alert_id: number;
  query_id: number;
  created_at: string;
  severity: string;
  status: AlertStatus;
  title: string | null;
  description: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  raw_sql: string;
  action_taken: string;
  risk_score: number;
  detection_method: string | null;
}

export interface AlertDecisionRequest {
  decision: AlertDecision;
  notes?: string;
}

export interface AlertDecisionResponse {
  status: string;
  alert_id: number;
  query_id: number;
  decision: AlertDecision;
  alert_status: string;
}

export function useAlerts() {
  const api = useApi();

  return useQuery({
    queryKey: ['alerts'],
    queryFn: () => api.get<AlertItem[]>('/alerts?limit=200&offset=0'),
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
}

export function useAlertDecision() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ alertId, payload }: { alertId: number; payload: AlertDecisionRequest }) =>
      api.post<AlertDecisionResponse, AlertDecisionRequest>(`/alerts/${alertId}/decision`, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}
