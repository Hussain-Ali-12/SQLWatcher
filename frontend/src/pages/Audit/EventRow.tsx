import { BarChart3, Eye, LockKeyhole, UserRound } from 'lucide-react';
import type { AuditEvent } from './useAuditEvents';
import styles from './styles.module.css';

export interface EventRowProps {
  event: AuditEvent;
}

function roleIcon(role?: string | null) {
  switch ((role || '').toLowerCase()) {
    case 'admin':
      return <LockKeyhole size={14} aria-label="Admin" />;
    case 'analyst':
      return <BarChart3 size={14} aria-label="Analyst" />;
    case 'viewer':
      return <Eye size={14} aria-label="Viewer" />;
    default:
      return <UserRound size={14} aria-label="Unknown role" />;
  }
}

export function formatAuditTimestamp(value?: string | null): { relative: string; absolute: string } {
  if (!value) return { relative: 'unknown', absolute: 'Unknown timestamp' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { relative: value, absolute: value };

  const diffMs = Date.now() - date.getTime();
  const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSeconds < 60) return { relative: `${diffSeconds}s ago`, absolute: date.toLocaleString() };
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return { relative: `${diffMinutes}m ago`, absolute: date.toLocaleString() };
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return { relative: `${diffHours}h ago`, absolute: date.toLocaleString() };
  const diffDays = Math.floor(diffHours / 24);
  return { relative: `${diffDays}d ago`, absolute: date.toLocaleString() };
}

function truncate(value: string, maxLength = 80): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

export function TimeCell({ value }: { value?: string | null }) {
  const timestamp = formatAuditTimestamp(value);
  return (
    <span className={styles.timestampCell} title={timestamp.absolute}>
      {timestamp.relative}
    </span>
  );
}

export function ActorCell({ event }: EventRowProps) {
  return (
    <span className={styles.actorCell} title={event.actor_email || 'System'}>
      {roleIcon(event.actor_role)}
      <span>{event.actor_email || 'system'}</span>
    </span>
  );
}

export function RoleCell({ event }: EventRowProps) {
  const role = event.actor_role || 'unknown';
  return <span className={styles.roleCell}>{role}</span>;
}

export function EventTypeCell({ event }: EventRowProps) {
  return <span className={styles.eventTypeCell}>{event.event_type}</span>;
}

export function EntityCell({ event }: EventRowProps) {
  const entity = event.entity_type ? `${event.entity_type}${event.entity_id !== null && event.entity_id !== undefined ? ` #${event.entity_id}` : ''}` : '—';
  return <span className={styles.entityCell}>{entity}</span>;
}

export function DescriptionCell({ event }: EventRowProps) {
  const text = event.description || 'No description recorded.';
  return (
    <span className={styles.descriptionCell} title={text}>
      {truncate(text)}
    </span>
  );
}

export function EventRow({ event }: EventRowProps) {
  return (
    <div className={styles.eventSummary}>
      <EventTypeCell event={event} />
      <DescriptionCell event={event} />
    </div>
  );
}
