import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../hooks/useApi';

export type RuleSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string;
export type RuleAction = 'ALLOW' | 'FLAG' | 'BLOCK' | string;
export type RuleType = 'KEYWORD' | 'REGEX' | 'BUILTIN' | string;
export type MatchTarget = 'RAW_SQL' | 'NORMALIZED_SQL' | string;

export interface RuleItem {
  rule_id: number;
  rule_name: string;
  description: string;
  severity: RuleSeverity;
  action: RuleAction;
  enabled: boolean;
  trigger_count: number;
  created_at: string;
  updated_at: string;
  rule_type: RuleType;
  match_pattern: string | null;
  match_target: MatchTarget;
  risk_score: number;
  is_system: boolean;
}

export interface RulePayload {
  rule_name: string;
  description: string;
  severity: string;
  action: string;
  enabled: boolean;
  rule_type: string;
  match_pattern: string;
  match_target: string;
  risk_score: number;
}

export interface ToggleRuleResponse {
  rule_id: number;
  rule_name: string;
  enabled: boolean;
}

export interface DeleteRuleResponse {
  status: string;
  rule_id: number;
  rule_name: string;
}

export const rulesQueryKey = ['rules'] as const;

export function useRules() {
  const api = useApi();

  return useQuery({
    queryKey: rulesQueryKey,
    queryFn: () => api.get<RuleItem[]>('/rules'),
    staleTime: 20_000,
  });
}

export function useCreateRule() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: RulePayload) => api.post<RuleItem, RulePayload>('/rules', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: rulesQueryKey });
    },
  });
}

export function useUpdateRule() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ruleId, payload }: { ruleId: number; payload: RulePayload }) =>
      api.patch<RuleItem, Partial<RulePayload>>(`/rules/${ruleId}`, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: rulesQueryKey });
    },
  });
}

export function useToggleRule() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (rule: RuleItem) => api.patch<ToggleRuleResponse, undefined>(`/rules/${rule.rule_id}/toggle`),
    onMutate: async (rule) => {
      await queryClient.cancelQueries({ queryKey: rulesQueryKey });
      const previousRules = queryClient.getQueryData<RuleItem[]>(rulesQueryKey);
      queryClient.setQueryData<RuleItem[]>(rulesQueryKey, (current) =>
        current?.map((item) => (item.rule_id === rule.rule_id ? { ...item, enabled: !item.enabled } : item)) ?? current,
      );
      return { previousRules };
    },
    onError: (_error, _rule, context) => {
      if (context?.previousRules) {
        queryClient.setQueryData(rulesQueryKey, context.previousRules);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: rulesQueryKey });
    },
  });
}

export function useDeleteRule() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ruleId: number) => api.del<DeleteRuleResponse>(`/rules/${ruleId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: rulesQueryKey });
    },
  });
}
