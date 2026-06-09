import styles from './Badge.module.css';

export type BadgeVariant =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'none'
  | 'ok'
  | 'info'
  | 'block'
  | 'flag'
  | 'allow'
  | 'error';

export interface BadgeProps {
  label: string;
  variant: BadgeVariant;
}

export function fromSeverity(severity: string): BadgeVariant {
  switch (severity.trim().toUpperCase()) {
    case 'CRITICAL':
      return 'critical';
    case 'HIGH':
      return 'high';
    case 'MEDIUM':
      return 'medium';
    case 'LOW':
      return 'low';
    case 'OK':
      return 'ok';
    case 'INFO':
      return 'info';
    case 'ERROR':
      return 'error';
    case 'NONE':
    default:
      return 'none';
  }
}

export function fromAction(action: string): BadgeVariant {
  switch (action.trim().toUpperCase()) {
    case 'BLOCK':
      return 'block';
    case 'FLAG':
      return 'flag';
    case 'ALLOW':
      return 'allow';
    case 'ERROR':
      return 'error';
    default:
      return 'none';
  }
}

export function Badge({ label, variant }: BadgeProps) {
  return <span className={`${styles.badge} ${styles[variant]}`}>{label}</span>;
}

Badge.fromSeverity = fromSeverity;
Badge.fromAction = fromAction;
