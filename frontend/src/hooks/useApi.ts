import { useMemo } from 'react';
import { API_BASE } from '../env';
import { useAuthStore } from '../store/authStore';

type RequestBody = unknown;

type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

function buildUrl(path: string): string {
  return `${API_BASE}/${path.replace(/^\/+/, '')}`;
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
  }
  return fallback;
}

async function parseResponse(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text ? { detail: text } : undefined;
}

async function request<TResponse>(method: ApiMethod, path: string, body?: RequestBody): Promise<TResponse> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(buildUrl(path), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await parseResponse(response).catch(() => undefined);

  if (!response.ok) {
    if (response.status === 401) {
      useAuthStore.getState().clearAuth();
    }

    throw new Error(extractErrorMessage(payload, `Request failed with HTTP ${response.status}`));
  }

  return payload as TResponse;
}

export function useApi() {
  return useMemo(
    () => ({
      get: <TResponse>(path: string) => request<TResponse>('GET', path),
      post: <TResponse, TBody extends RequestBody = RequestBody>(path: string, body?: TBody) =>
        request<TResponse>('POST', path, body),
      patch: <TResponse, TBody extends RequestBody = RequestBody>(path: string, body?: TBody) =>
        request<TResponse>('PATCH', path, body),
      del: <TResponse, TBody extends RequestBody = RequestBody>(path: string, body?: TBody) =>
        request<TResponse>('DELETE', path, body),
    }),
    [],
  );
}
