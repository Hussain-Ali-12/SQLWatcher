import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';

export interface AuditEvent {
  event_id: number;
  timestamp: string;
  actor_email: string | null;
  actor_role: string | null;
  event_type: string;
  entity_type: string | null;
  entity_id: number | string | null;
  description: string | null;
  metadata_json: unknown;
}

export interface UseAuditEventsResult {
  eventType: string;
  events: AuditEvent[];
  filteredEvents: AuditEvent[];
  eventTypes: string[];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => void;
}

function normaliseEvent(row: AuditEvent): AuditEvent {
  return {
    ...row,
    event_type: row.event_type || 'UNKNOWN_EVENT',
    actor_role: row.actor_role || 'unknown',
    description: row.description || '',
  };
}

export function useAuditEvents(): UseAuditEventsResult {
  const api = useApi();
  const [searchParams] = useSearchParams();
  const eventType = searchParams.get('type') ?? '';

  const query = useQuery({
    queryKey: ['audit', eventType],
    queryFn: async () => {
      const rows = await api.get<AuditEvent[]>('/audit/events?limit=300&offset=0');
      return rows.map(normaliseEvent);
    },
    staleTime: 30_000,
  });

  const events = query.data ?? [];

  const filteredEvents = useMemo(() => {
    if (!eventType) return events;
    return events.filter((event) => event.event_type === eventType);
  }, [eventType, events]);

  const eventTypes = useMemo(() => {
    return Array.from(new Set(events.map((event) => event.event_type).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [events]);

  return {
    eventType,
    events,
    filteredEvents,
    eventTypes,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
  };
}
