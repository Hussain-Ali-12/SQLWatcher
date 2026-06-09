import { create } from 'zustand';
import type { UserInfo } from '../types';

const STORAGE_KEY = 'sqlwatcher_auth';

interface StoredAuthState {
  token: string | null;
  user: UserInfo | null;
  expiresAt: string | null;
}

export interface AuthState extends StoredAuthState {
  setAuth(token: string, user: UserInfo, expiresAt: string): void;
  clearAuth(): void;
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  const expiresAtMs = Date.parse(expiresAt);
  return Number.isNaN(expiresAtMs) || expiresAtMs < Date.now();
}

function normalizeStoredAuth(value: unknown): StoredAuthState | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  const token = typeof record.token === 'string' ? record.token : null;
  const user = record.user && typeof record.user === 'object' ? (record.user as UserInfo) : null;
  const expiresAt =
    typeof record.expiresAt === 'string'
      ? record.expiresAt
      : typeof record.expires_at === 'string'
        ? record.expires_at
        : null;

  if (!token || !user || isExpired(expiresAt)) return null;
  return { token, user, expiresAt };
}

function readStoredAuth(): StoredAuthState {
  const emptyState: StoredAuthState = { token: null, user: null, expiresAt: null };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState;

    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizeStoredAuth(parsed);
    if (!normalized) {
      window.localStorage.removeItem(STORAGE_KEY);
      return emptyState;
    }

    return normalized;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return emptyState;
  }
}

function persistAuth(state: StoredAuthState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const initialAuth = readStoredAuth();

export const useAuthStore = create<AuthState>((set) => ({
  ...initialAuth,
  setAuth: (token, user, expiresAt) => {
    const nextState = { token, user, expiresAt };
    persistAuth(nextState);
    set(nextState);
  },
  clearAuth: () => {
    window.localStorage.removeItem(STORAGE_KEY);
    set({ token: null, user: null, expiresAt: null });
  },
}));
