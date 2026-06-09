import { useEffect, useRef, useState } from 'react';
import { WS_BASE } from '../env';
import { useAuthStore } from '../store/authStore';

export type WebSocketStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

interface WebSocketState {
  status: WebSocketStatus;
  reconnectInSeconds: number | null;
}

function alertsSocketUrl(): string {
  return `${WS_BASE}/ws/alerts`;
}

function parseSocketMessage(data: string): unknown {
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return data;
  }
}

function isAuthOkMessage(data: unknown): boolean {
  return !!data && typeof data === 'object' && (data as { type?: unknown }).type === 'auth_ok';
}

export function useWebSocket(onMessage: (data: unknown) => void): WebSocketState {
  const token = useAuthStore((state) => state.token);
  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const [reconnectInSeconds, setReconnectInSeconds] = useState<number | null>(null);
  const onMessageRef = useRef(onMessage);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const shouldReconnectRef = useRef(false);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    function clearCountdownTimer(): void {
      if (countdownTimerRef.current !== null) {
        window.clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      setReconnectInSeconds(null);
    }

    function clearReconnectTimer(): void {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    }

    function closeSocket(): void {
      const socket = wsRef.current;
      if (!socket) return;

      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
      wsRef.current = null;
    }

    function startReconnectCountdown(delayMs: number): void {
      clearCountdownTimer();
      const reconnectAt = Date.now() + delayMs;
      setReconnectInSeconds(Math.max(1, Math.ceil(delayMs / 1000)));

      countdownTimerRef.current = window.setInterval(() => {
        const secondsLeft = Math.max(0, Math.ceil((reconnectAt - Date.now()) / 1000));
        setReconnectInSeconds(secondsLeft);
        if (secondsLeft <= 0) {
          clearCountdownTimer();
        }
      }, 1000);
    }

    function connect(force = false): void {
      if (!token) return;

      const existing = wsRef.current;
      if (!force && existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
        return;
      }

      closeSocket();
      clearReconnectTimer();
      clearCountdownTimer();
      setStatus('connecting');

      const socket = new WebSocket(alertsSocketUrl());
      wsRef.current = socket;

      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'auth', token }));
      };

      socket.onmessage = (event) => {
        const parsed = parseSocketMessage(event.data as string);
        if (isAuthOkMessage(parsed)) {
          reconnectAttemptRef.current = 0;
          clearCountdownTimer();
          setStatus('connected');
          return;
        }
        onMessageRef.current(parsed);
      };

      socket.onerror = () => {
        if (wsRef.current === socket) {
          setStatus('error');
        }
      };

      socket.onclose = (event) => {
        if (wsRef.current !== socket) return;

        wsRef.current = null;
        clearCountdownTimer();

        if (event.code === 4401) {
          shouldReconnectRef.current = false;
          reconnectAttemptRef.current = 0;
          setStatus('error');
          return;
        }

        setStatus('disconnected');

        if (!shouldReconnectRef.current || !token) return;

        const delayMs = Math.min(10000, 1000 * 2 ** reconnectAttemptRef.current);
        reconnectAttemptRef.current += 1;
        startReconnectCountdown(delayMs);

        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null;
          connect(true);
        }, delayMs);
      };
    }

    if (!token) {
      shouldReconnectRef.current = false;
      clearReconnectTimer();
      clearCountdownTimer();
      closeSocket();
      reconnectAttemptRef.current = 0;
      setStatus('disconnected');
      return undefined;
    }

    shouldReconnectRef.current = true;
    connect(true);

    return () => {
      shouldReconnectRef.current = false;
      clearReconnectTimer();
      clearCountdownTimer();
      closeSocket();
    };
  }, [token]);

  return { status, reconnectInSeconds };
}
