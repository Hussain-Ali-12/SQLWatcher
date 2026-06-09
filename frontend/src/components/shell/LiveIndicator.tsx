import type { WebSocketStatus } from '../../hooks/useWebSocket';
import styles from './LiveIndicator.module.css';

interface LiveIndicatorProps {
  status: WebSocketStatus;
  reconnectInSeconds?: number | null;
}

const labels: Record<WebSocketStatus, string> = {
  connected: 'Live',
  connecting: 'Connecting',
  disconnected: 'Offline',
  error: 'Error',
};

function tooltipText(status: WebSocketStatus, reconnectInSeconds?: number | null): string {
  if (status === 'disconnected' && reconnectInSeconds !== null && reconnectInSeconds !== undefined) {
    return `disconnected · reconnecting in ${reconnectInSeconds}s`;
  }
  return status;
}

export function LiveIndicator({ status, reconnectInSeconds = null }: LiveIndicatorProps) {
  return (
    <div className={`${styles.liveIndicator} ${styles[status]}`} aria-label={`Realtime status: ${labels[status]}`}>
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>{labels[status]}</span>
      <span className={styles.tooltip}>{tooltipText(status, reconnectInSeconds)}</span>
    </div>
  );
}
