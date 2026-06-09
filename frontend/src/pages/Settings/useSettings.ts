import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../hooks/useApi';

export interface DeploymentConfigValue {
  value: string;
  is_secret?: boolean;
  updated_at?: string | null;
}

export interface DeploymentConfigPayload {
  proxy_address_mode?: string | null;
  public_proxy_host?: string | null;
  public_proxy_port?: number | null;
  public_proxy_database?: string | null;
  public_proxy_username?: string | null;
  protected_database_url?: string | null;
  deployment_notes?: string | null;
}

export interface ProxyConnectionInfo {
  public_host?: string;
  public_port?: number;
  database?: string;
  username?: string;
  sslmode?: string;
  proxy_url_template?: string;
  copy_safe_proxy_url?: string;
  note?: string;
}

export interface DeploymentConfigResponse {
  config: Record<string, DeploymentConfigValue>;
  proxy_connection: ProxyConnectionInfo;
  client_integration: Record<string, string>;
  control_db_policy?: string;
  target_db_policy?: string;
}

export interface SaveDeploymentConfigResponse {
  status: string;
  restart_required: boolean;
  message: string;
  deployment_config: Record<string, DeploymentConfigValue>;
  proxy_connection: ProxyConnectionInfo;
  client_integration: Record<string, string>;
}

export interface DatabaseTestPayload {
  database_url: string;
}

export interface DatabaseTestResponse {
  ok: boolean;
  latency_ms: number;
  masked_url: string;
  database?: Record<string, unknown>;
  error?: string;
}

export interface AnomalyConfig {
  enabled: boolean;
  enforcement_mode: string;
  min_score: number;
}

export interface DemoActionResponse {
  status?: string;
  count?: number;
  users?: string[];
  trained_profiles?: number;
  model_version?: string;
  message?: string;
  [key: string]: unknown;
}

export const settingsQueryKeys = {
  deployment: ['settings', 'deployment-config'] as const,
  anomaly: ['settings', 'anomaly-config'] as const,
};

export function configValue(config: Record<string, DeploymentConfigValue> | undefined, key: string, fallback = ''): string {
  return config?.[key]?.value ?? fallback;
}

export function useDeploymentConfig() {
  const api = useApi();

  return useQuery({
    queryKey: settingsQueryKeys.deployment,
    queryFn: () => api.get<DeploymentConfigResponse>('/system/deployment-config'),
    refetchInterval: 60_000,
  });
}

export function useSaveDeploymentConfig() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: DeploymentConfigPayload) =>
      api.post<SaveDeploymentConfigResponse, DeploymentConfigPayload>('/system/deployment-config', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsQueryKeys.deployment });
    },
  });
}

export function useTestDatabaseUrl() {
  const api = useApi();

  return useMutation({
    mutationFn: (payload: DatabaseTestPayload) =>
      api.post<DatabaseTestResponse, DatabaseTestPayload>('/system/test-database-url', payload),
  });
}

export function useAnomalyConfig() {
  const api = useApi();

  return useQuery({
    queryKey: settingsQueryKeys.anomaly,
    queryFn: () => api.get<AnomalyConfig>('/system/anomaly-config'),
    refetchInterval: 60_000,
  });
}

export function useSaveAnomalyConfig() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: AnomalyConfig) => api.post<AnomalyConfig, AnomalyConfig>('/system/anomaly-config', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsQueryKeys.anomaly });
    },
  });
}

export function useResetDemo() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<DemoActionResponse, undefined>('/demo/reset'),
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}

export function useSeedNormalTraffic() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<DemoActionResponse, undefined>('/demo/seed-normal-traffic'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
      void queryClient.invalidateQueries({ queryKey: ['logs'] });
      void queryClient.invalidateQueries({ queryKey: ['profiles'] });
      void queryClient.invalidateQueries({ queryKey: ['evaluation'] });
    },
  });
}

export function useTrainBaseline() {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<DemoActionResponse, undefined>('/ml/train-baseline?include_allows_only=true'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profiles'] });
      void queryClient.invalidateQueries({ queryKey: ['anomalies'] });
      void queryClient.invalidateQueries({ queryKey: ['evaluation'] });
    },
  });
}
