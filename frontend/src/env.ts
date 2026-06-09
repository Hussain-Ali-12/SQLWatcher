function requireEnv(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${name} must be set. Add it to frontend/.env or the deployment environment.`);
  }
  return trimmed.replace(/\/$/, '');
}

function deriveWsBase(apiBase: string): string {
  const apiUrl = new URL(apiBase);
  const protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${apiUrl.host}`;
}

export const API_BASE: string = requireEnv('VITE_API_BASE', import.meta.env.VITE_API_BASE);
export const WS_BASE: string = (import.meta.env.VITE_WS_BASE?.trim() || deriveWsBase(API_BASE)).replace(/\/$/, '');
