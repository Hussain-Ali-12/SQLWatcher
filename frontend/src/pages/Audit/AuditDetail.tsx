import { CalendarClock, Database, Fingerprint, UserRound } from 'lucide-react';
import { DetailDrawer } from '../../components/ui/DetailDrawer';
import { Badge } from '../../components/ui/Badge';
import type { AuditEvent } from './useAuditEvents';
import { formatAuditTimestamp } from './EventRow';
import styles from './styles.module.css';

export interface AuditDetailProps {
  event: AuditEvent | null;
  open: boolean;
  onClose: () => void;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function parseMetadata(metadata: unknown): string {
  if (metadata === null || metadata === undefined || metadata === '') return '{}';

  if (typeof metadata === 'string') {
    try {
      return JSON.stringify(JSON.parse(metadata), null, 2);
    } catch {
      return metadata;
    }
  }

  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return String(metadata);
  }
}

function roleVariant(role?: string | null): 'ok' | 'info' | 'none' {
  switch ((role || '').toLowerCase()) {
    case 'admin':
      return 'ok';
    case 'analyst':
      return 'info';
    default:
      return 'none';
  }
}

export function AuditDetail({ event, open, onClose }: AuditDetailProps) {
  const timestamp = formatAuditTimestamp(event?.timestamp);

  return (
    <DetailDrawer open={open} onClose={onClose} title={event ? event.event_type : 'Audit event'} subtitle={event ? `Event #${event.event_id}` : undefined} width={520}>
      {!event ? (
        <div className={styles.detailEmpty}>Select an audit event to inspect the full trail record.</div>
      ) : (
        <div className={styles.detailContent}>
          <section className={styles.detailSection}>
            <div className={styles.detailHeaderRow}>
              <div>
                <p className={styles.detailEyebrow}>Event #{event.event_id}</p>
                <h3>{event.event_type}</h3>
              </div>
              <Badge label={event.actor_role || 'unknown'} variant={roleVariant(event.actor_role)} />
            </div>

            <div className={styles.metaGrid}>
              <div>
                <CalendarClock size={14} aria-hidden="true" />
                <span>Timestamp</span>
                <strong title={timestamp.absolute}>{timestamp.absolute}</strong>
              </div>
              <div>
                <UserRound size={14} aria-hidden="true" />
                <span>Actor</span>
                <strong>{formatValue(event.actor_email || 'system')}</strong>
              </div>
              <div>
                <Database size={14} aria-hidden="true" />
                <span>Entity</span>
                <strong>{formatValue(event.entity_type)}</strong>
              </div>
              <div>
                <Fingerprint size={14} aria-hidden="true" />
                <span>Entity ID</span>
                <strong>{formatValue(event.entity_id)}</strong>
              </div>
            </div>
          </section>

          <section className={styles.detailSection}>
            <div className={styles.sectionTitle}>Description</div>
            <p className={styles.descriptionText}>{event.description || 'No description was recorded for this audit event.'}</p>
          </section>

          <section className={styles.detailSection}>
            <div className={styles.sectionTitle}>Raw fields</div>
            <div className={styles.fieldGrid}>
              <div>
                <span>event_id</span>
                <strong>{event.event_id}</strong>
              </div>
              <div>
                <span>event_type</span>
                <strong>{event.event_type}</strong>
              </div>
              <div>
                <span>actor_role</span>
                <strong>{event.actor_role || 'unknown'}</strong>
              </div>
              <div>
                <span>actor_email</span>
                <strong>{event.actor_email || 'system'}</strong>
              </div>
              <div>
                <span>entity_type</span>
                <strong>{formatValue(event.entity_type)}</strong>
              </div>
              <div>
                <span>entity_id</span>
                <strong>{formatValue(event.entity_id)}</strong>
              </div>
            </div>
          </section>

          <section className={styles.detailSection}>
            <div className={styles.sectionTitle}>metadata_json</div>
            <pre className={styles.jsonBlock}>{parseMetadata(event.metadata_json)}</pre>
          </section>
        </div>
      )}
    </DetailDrawer>
  );
}
