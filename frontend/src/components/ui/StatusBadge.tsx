import styles from './StatusBadge.module.css';

export type OperationalStatus = 'ok' | 'warn' | 'error' | 'idle' | 'loading';

export interface StatusBadgeProps {
  status: OperationalStatus;
  label: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[status]}`}>
      <span className={styles.dot} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
