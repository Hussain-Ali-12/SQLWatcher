import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useApi } from '../../hooks/useApi';

const HISTORY_KEY = 'sqlwatcher_console_history';
const MAX_HISTORY_ITEMS = 20;

export interface QueryRequestBody {
  sql: string;
  db_user: 'web_app';
  client_ip: '127.0.0.1';
}

export interface QueryResponse {
  action: string;
  severity: string;
  risk_score: number;
  explanation: string;
  data: Array<Record<string, unknown>> | null;
  query_id: number | null;
  detection_method?: string | null;
  features?: Record<string, unknown> | null;
  anomaly_score?: number | null;
  anomaly_reasons?: string[] | null;
  baseline_available?: boolean | null;
  model_version?: string | null;
  normalised_sql?: string | null;
  normalized_sql?: string | null;
  [key: string]: unknown;
}

function parseHistory(raw: string | null): string[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, MAX_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

function persistHistory(items: string[]): void {
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY_ITEMS)));
}

export function useConsole() {
  const api = useApi();
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    setHistory(parseHistory(window.localStorage.getItem(HISTORY_KEY)));
  }, []);

  const rememberQuery = useCallback((sql: string) => {
    const trimmed = sql.trim();
    if (!trimmed) return;

    setHistory((current) => {
      const next = [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, MAX_HISTORY_ITEMS);
      persistHistory(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    window.localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
  }, []);

  const executeMutation = useMutation({
    mutationFn: async (sql: string) => {
      const body: QueryRequestBody = {
        sql,
        db_user: 'web_app',
        client_ip: '127.0.0.1',
      };
      return api.post<QueryResponse, QueryRequestBody>('/query', body);
    },
    onSuccess: (_data, sql) => {
      rememberQuery(sql);
    },
  });

  return useMemo(
    () => ({
      history,
      clearHistory,
      executeQuery: executeMutation.mutate,
      executeAsync: executeMutation.mutateAsync,
      result: executeMutation.data,
      error: executeMutation.error,
      isExecuting: executeMutation.isPending,
      reset: executeMutation.reset,
    }),
    [clearHistory, executeMutation.data, executeMutation.error, executeMutation.isPending, executeMutation.mutate, executeMutation.mutateAsync, executeMutation.reset, history],
  );
}
