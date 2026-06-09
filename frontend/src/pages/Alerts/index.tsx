import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock3, ListFilter, RefreshCcw } from 'lucide-react';
import { DetailDrawer } from '../../components/ui/DetailDrawer';
import type { AlertDecision, AlertItem } from './useAlerts';
import { useAlertDecision, useAlerts } from './useAlerts';
import { AlertCard } from './AlertCard';
import { AlertDetail } from './AlertDetail';
import styles from './styles.module.css';

type StatusTab = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'ALL';

const STATUS_TABS: Array<{ key: StatusTab; label: string }> = [
  { key: 'OPEN', label: 'Open' },
  { key: 'IN_REVIEW', label: 'In Review' },
  { key: 'RESOLVED', label: 'Resolved' },
  { key: 'ALL', label: 'All' },
];

function alertMatchesStatus(alert: AlertItem, tab: StatusTab): boolean {
  if (tab === 'ALL') return true;
  if (tab === 'RESOLVED') return alert.status === 'RESOLVED' || alert.status === 'ESCALATED';
  return alert.status === tab;
}

function countForTab(alerts: AlertItem[], tab: StatusTab): number {
  return alerts.filter((alert) => alertMatchesStatus(alert, tab)).length;
}

function useIsNarrowScreen(query = '(max-width: 900px)'): boolean {
  const [matches, setMatches] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(query).matches));

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);

  return matches;
}

export function AlertsPage() {
  const navigate = useNavigate();
  const alertsQuery = useAlerts();
  const decisionMutation = useAlertDecision();
  const [activeTab, setActiveTab] = useState<StatusTab>('OPEN');
  const [selectedAlertId, setSelectedAlertId] = useState<number | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<number>>(() => new Set());
  const [lastCheckedIndex, setLastCheckedIndex] = useState<number | null>(null);
  const [activeDecision, setActiveDecision] = useState<AlertDecision | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const narrowScreen = useIsNarrowScreen();

  const allAlerts = alertsQuery.data ?? [];
  const filteredAlerts = useMemo(() => allAlerts.filter((alert) => alertMatchesStatus(alert, activeTab)), [activeTab, allAlerts]);
  const selectedAlert = useMemo(
    () => filteredAlerts.find((alert) => alert.alert_id === selectedAlertId) ?? filteredAlerts[0] ?? null,
    [filteredAlerts, selectedAlertId],
  );

  useEffect(() => {
    if (!selectedAlert && filteredAlerts.length > 0) {
      setSelectedAlertId(filteredAlerts[0].alert_id);
      return;
    }
    if (selectedAlert && selectedAlert.alert_id !== selectedAlertId) {
      setSelectedAlertId(selectedAlert.alert_id);
    }
  }, [filteredAlerts, selectedAlert, selectedAlertId]);

  useEffect(() => {
    setCheckedIds((current) => {
      const visible = new Set(filteredAlerts.map((alert) => alert.alert_id));
      const next = new Set(Array.from(current).filter((id) => visible.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [filteredAlerts]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button, [contenteditable="true"]')) return;
      if (filteredAlerts.length === 0) return;

      const currentIndex = Math.max(
        0,
        filteredAlerts.findIndex((alert) => alert.alert_id === selectedAlert?.alert_id),
      );

      if (event.key.toLowerCase() === 'j') {
        event.preventDefault();
        const nextIndex = Math.min(filteredAlerts.length - 1, currentIndex + 1);
        setSelectedAlertId(filteredAlerts[nextIndex].alert_id);
      }

      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        const nextIndex = Math.max(0, currentIndex - 1);
        setSelectedAlertId(filteredAlerts[nextIndex].alert_id);
      }

      if (event.key === 'Enter' && selectedAlert) {
        event.preventDefault();
        setDrawerOpen(true);
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [filteredAlerts, selectedAlert]);

  function selectAlert(alert: AlertItem) {
    setSelectedAlertId(alert.alert_id);
    if (narrowScreen) setDrawerOpen(true);
  }

  function toggleChecked(alert: AlertItem, index: number, event: React.MouseEvent<HTMLInputElement>) {
    event.stopPropagation();
    setCheckedIds((current) => {
      const next = new Set(current);
      if (event.shiftKey && lastCheckedIndex !== null) {
        const start = Math.min(lastCheckedIndex, index);
        const end = Math.max(lastCheckedIndex, index);
        const shouldSelectRange = !next.has(alert.alert_id);
        filteredAlerts.slice(start, end + 1).forEach((item) => {
          if (shouldSelectRange) next.add(item.alert_id);
          else next.delete(item.alert_id);
        });
      } else if (next.has(alert.alert_id)) {
        next.delete(alert.alert_id);
      } else {
        next.add(alert.alert_id);
      }
      return next;
    });
    setLastCheckedIndex(index);
  }

  async function submitDecision(alertId: number, decision: AlertDecision, notes?: string) {
    setActiveDecision(decision);
    try {
      await decisionMutation.mutateAsync({ alertId, payload: { decision, notes } });
      setCheckedIds((current) => {
        const next = new Set(current);
        next.delete(alertId);
        return next;
      });
    } finally {
      setActiveDecision(null);
    }
  }

  async function submitBulk(decision: AlertDecision) {
    const ids = Array.from(checkedIds);
    setActiveDecision(decision);
    try {
      for (const alertId of ids) {
        await decisionMutation.mutateAsync({
          alertId,
          payload: {
            decision,
            notes: decision === 'confirm_block' ? 'Bulk triage: confirmed as blocked.' : 'Bulk triage: marked false positive.',
          },
        });
      }
      setCheckedIds(new Set());
    } finally {
      setActiveDecision(null);
    }
  }

  const selectedCount = checkedIds.size;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1>Alerts</h1>
          <p>Prioritised queue for high-risk SQL activity, triage decisions, and analyst review.</p>
        </div>
        <button type="button" className={styles.refreshButton} onClick={() => void alertsQuery.refetch()} disabled={alertsQuery.isFetching}>
          <RefreshCcw size={14} aria-hidden="true" />
          {alertsQuery.isFetching ? 'Refreshing' : 'Refresh'}
        </button>
      </header>

      {alertsQuery.error ? <div className={styles.errorBanner}>{alertsQuery.error.message}</div> : null}
      {decisionMutation.error ? <div className={styles.errorBanner}>{decisionMutation.error.message}</div> : null}

      <div className={styles.layout}>
        <aside className={styles.queuePanel} aria-label="Alert queue">
          <div className={styles.tabs} role="tablist" aria-label="Alert status filters">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                className={`${styles.tabButton} ${activeTab === tab.key ? styles.activeTab : ''}`}
                onClick={() => {
                  setActiveTab(tab.key);
                  setSelectedAlertId(null);
                  setLastCheckedIndex(null);
                }}
              >
                <span>{tab.label}</span>
                <strong>{countForTab(allAlerts, tab.key)}</strong>
              </button>
            ))}
          </div>

          {selectedCount > 0 ? (
            <div className={styles.bulkToolbar}>
              <span>{selectedCount} selected</span>
              <button type="button" onClick={() => void submitBulk('confirm_block')} disabled={decisionMutation.isPending}>
                <CheckCircle2 size={14} aria-hidden="true" />
                Confirm all
              </button>
              <button type="button" onClick={() => void submitBulk('false_positive')} disabled={decisionMutation.isPending}>
                <AlertTriangle size={14} aria-hidden="true" />
                Mark false positive
              </button>
            </div>
          ) : null}

          <div className={styles.queueMeta}>
            <span>
              <ListFilter size={13} aria-hidden="true" />
              Showing {filteredAlerts.length} of {allAlerts.length}
            </span>
            <span>
              <Clock3 size={13} aria-hidden="true" />
              J/K navigate · Enter detail
            </span>
          </div>

          <div className={styles.queueList}>
            {alertsQuery.isLoading ? <div className={styles.emptyQueue}>Loading alert queue...</div> : null}
            {!alertsQuery.isLoading && filteredAlerts.length === 0 ? <div className={styles.emptyQueue}>No alerts found for this status.</div> : null}
            {filteredAlerts.map((alert, index) => (
              <AlertCard
                key={alert.alert_id}
                alert={alert}
                selected={selectedAlert?.alert_id === alert.alert_id}
                checked={checkedIds.has(alert.alert_id)}
                onSelect={() => selectAlert(alert)}
                onCheck={(event) => toggleChecked(alert, index, event)}
              />
            ))}
          </div>
        </aside>

        <div className={styles.inlineDetail}>
          <AlertDetail
            alert={selectedAlert}
            activeDecision={activeDecision}
            mutationPending={decisionMutation.isPending}
            onDecision={(alertId, decision, notes) => void submitDecision(alertId, decision, notes)}
          />
        </div>
      </div>

      <DetailDrawer
        open={narrowScreen && drawerOpen && Boolean(selectedAlert)}
        onClose={() => setDrawerOpen(false)}
        title={selectedAlert ? `Alert #${selectedAlert.alert_id}` : 'Alert detail'}
        subtitle={selectedAlert?.title ?? undefined}
        width={520}
      >
        <AlertDetail
          alert={selectedAlert}
          activeDecision={activeDecision}
          mutationPending={decisionMutation.isPending}
          onDecision={(alertId, decision, notes) => void submitDecision(alertId, decision, notes)}
        />
      </DetailDrawer>
    </div>
  );
}
