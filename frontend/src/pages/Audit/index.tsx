import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { VirtualTable } from '../../components/ui/VirtualTable';
import { ExportButton } from '../../components/ui/ExportButton';
import { useAuditEvents, type AuditEvent } from './useAuditEvents';
import { ActorCell, DescriptionCell, EntityCell, EventTypeCell, RoleCell, TimeCell } from './EventRow';
import { AuditDetail } from './AuditDetail';
import styles from './styles.module.css';

function toExportRows(events: AuditEvent[]): Array<Record<string, unknown>> {
  return events.map((event) => ({
    timestamp: event.timestamp,
    actor_email: event.actor_email,
    actor_role: event.actor_role,
    event_type: event.event_type,
    entity_type: event.entity_type,
    entity_id: event.entity_id,
    description: event.description,
    metadata_json: typeof event.metadata_json === 'string' ? event.metadata_json : JSON.stringify(event.metadata_json ?? {}),
  }));
}

export function AuditPage() {
  const navigate = useNavigate();
  const { eventType, filteredEvents, eventTypes, isLoading, isFetching, error, refetch } = useAuditEvents();
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  const exportRows = useMemo(() => toExportRows(filteredEvents), [filteredEvents]);

  function updateEventType(nextType: string) {
    const params = new URLSearchParams();
    if (nextType) params.set('type', nextType);
    navigate({ pathname: '/audit', search: params.toString() ? `?${params.toString()}` : '' });
    setSelectedEvent(null);
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1>Audit Trail</h1>
          <p>Review authentication, rule, demo, anomaly, and analyst actions captured by SQLWatcher.</p>
        </div>
        <button type="button" className={styles.refreshButton} onClick={refetch} disabled={isFetching}>
          <RefreshCw size={14} aria-hidden="true" />
          <span>{isFetching ? 'Refreshing' : 'Refresh'}</span>
        </button>
      </header>

      <section className={styles.toolbar} aria-label="Audit filters">
        <div className={styles.filterField}>
          <label htmlFor="audit-event-type">Event type</label>
          <select id="audit-event-type" value={eventType} onChange={(event) => updateEventType(event.target.value)}>
            <option value="">All event types</option>
            {eventTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.toolbarActions}>
          <span className={styles.resultCount}>Showing {filteredEvents.length} events</span>
          <ExportButton
            data={exportRows}
            columns={[
              { key: 'timestamp', header: 'timestamp' },
              { key: 'actor_email', header: 'actor_email' },
              { key: 'actor_role', header: 'actor_role' },
              { key: 'event_type', header: 'event_type' },
              { key: 'entity_type', header: 'entity_type' },
              { key: 'entity_id', header: 'entity_id' },
              { key: 'description', header: 'description' },
              { key: 'metadata_json', header: 'metadata_json' },
            ]}
            filename="sqlwatcher-audit-events.csv"
            disabled={filteredEvents.length === 0}
          />
        </div>
      </section>

      {error ? <div className={styles.errorBanner}>{error.message}</div> : null}

      <section className={styles.tablePanel} aria-busy={isLoading || isFetching}>
        <VirtualTable
          data={filteredEvents}
          rowHeight={48}
          selectedId={selectedEvent?.event_id}
          getRowId={(event) => event.event_id}
          onRowClick={setSelectedEvent}
          emptyState={isLoading ? 'Loading audit events...' : 'No audit events match the current filter.'}
          columns={[
            {
              key: 'timestamp',
              header: 'Time',
              width: 132,
              sortable: true,
              render: (event) => <TimeCell value={event.timestamp} />,
            },
            {
              key: 'actor_email',
              header: 'Actor',
              width: 190,
              sortable: true,
              render: (event) => <ActorCell event={event} />,
            },
            {
              key: 'actor_role',
              header: 'Role',
              width: 90,
              sortable: true,
              render: (event) => <RoleCell event={event} />,
            },
            {
              key: 'event_type',
              header: 'Event Type',
              width: 180,
              sortable: true,
              render: (event) => <EventTypeCell event={event} />,
            },
            {
              key: 'entity_type',
              header: 'Entity',
              width: 150,
              sortable: true,
              render: (event) => <EntityCell event={event} />,
            },
            {
              key: 'description',
              header: 'Description',
              sortable: false,
              render: (event) => <DescriptionCell event={event} />,
            },
          ]}
        />
      </section>

      <AuditDetail event={selectedEvent} open={selectedEvent !== null} onClose={() => setSelectedEvent(null)} />
    </div>
  );
}
