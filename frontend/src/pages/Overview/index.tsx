import { useState } from 'react';
import { Database, RadioTower, RefreshCcw, Server, ShieldCheck } from 'lucide-react';
import { StatusBadge, type OperationalStatus } from '../../components/ui/StatusBadge';
import { useShellStatus } from '../../components/shell/Shell';
import { ActivityChart } from './ActivityChart';
import { KpiRow } from './KpiRow';
import { LiveFeed } from './LiveFeed';
import { useOverviewData } from './useOverviewData';
import styles from './styles.module.css';

function healthStatus(value: string | undefined): OperationalStatus {
  const normalised = (value ?? '').toLowerCase();
  if (normalised === 'healthy' || normalised === 'connected' || normalised === 'ok') return 'ok';
  if (normalised === 'degraded' || normalised === 'partial') return 'warn';
  if (normalised === 'unavailable' || normalised === 'error' || normalised === 'failed') return 'error';
  return 'idle';
}

function checkToStatus(ok: boolean | undefined): OperationalStatus {
  if (ok === true) return 'ok';
  if (ok === false) return 'error';
  return 'idle';
}

function databaseHealth(health: ReturnType<typeof useOverviewData>['health']): { status: OperationalStatus; label: string } {
  const controlOk = health.checks?.control_db?.ok;
  const targetOk = health.checks?.target_db?.ok;

  if (typeof controlOk === 'boolean' || typeof targetOk === 'boolean') {
    if (controlOk === true && targetOk === true) {
      return { status: 'ok', label: 'Databases healthy' };
    }
    if (controlOk === false || targetOk === false) {
      const failed = [controlOk === false ? 'control' : null, targetOk === false ? 'target' : null].filter(Boolean).join(' + ');
      return { status: 'error', label: `${failed} DB failed` };
    }
    return { status: 'warn', label: 'Database partial' };
  }

  const legacy = health.database ?? health.sqlwatcher_database ?? health.target_database;
  return { status: healthStatus(legacy), label: `Database ${legacy || 'unknown'}` };
}

function wsToStatus(value: string): OperationalStatus {
  if (value === 'connected') return 'ok';
  if (value === 'connecting') return 'loading';
  if (value === 'error') return 'error';
  return 'idle';
}

function formatMs(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(2)} ms` : '0.00 ms';
}

export function OverviewPage() {
  const { stats, timeline, alerts, health, performance, activeRulesCount, queries, isLoading, isError } = useOverviewData();
  const { wsStatus } = useShellStatus();
  const dbHealth = databaseHealth(health);
  const [manualRefreshing, setManualRefreshing] = useState(false);

  async function refreshOverview() {
    if (manualRefreshing) return;

    setManualRefreshing(true);
    try {
      await Promise.all(Object.values(queries).map((query) => query.refetch()));
    } finally {
      setManualRefreshing(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Overview</h1>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.headerMeta}>
            <span>Avg latency</span>
            <strong>{formatMs(performance.avg_total_ms)}</strong>
          </div>
          <button type="button" className={styles.refreshButton} onClick={() => void refreshOverview()} disabled={manualRefreshing}>
            <RefreshCcw size={14} aria-hidden="true" className={manualRefreshing ? styles.spinning : undefined} />
            {manualRefreshing ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      </header>

      {isError ? (
        <div className={styles.errorBanner} role="alert">
          Some overview data could not be loaded. Existing panels are showing the latest available fallback values.
        </div>
      ) : null}

      <KpiRow stats={stats} />

      <section className={styles.healthStrip} aria-label="System health">
        <div className={styles.healthItem}>
          <Server size={16} aria-hidden="true" />
          <StatusBadge status={healthStatus(health.status)} label={`API ${health.status || 'unknown'}`} />
        </div>
        <div className={styles.healthItem}>
          <Database size={16} aria-hidden="true" />
          <StatusBadge status={dbHealth.status} label={dbHealth.label} />
        </div>
        <div className={styles.healthItem}>
          <RadioTower size={16} aria-hidden="true" />
          <StatusBadge status={wsToStatus(wsStatus)} label={`WebSocket ${wsStatus}`} />
        </div>
        <div className={styles.healthItem}>
          <ShieldCheck size={16} aria-hidden="true" />
          <StatusBadge status={activeRulesCount > 0 ? 'ok' : 'warn'} label={`Rules Active ${activeRulesCount}`} />
        </div>
      </section>

      {isLoading ? <div className={styles.loading}>Loading overview telemetry…</div> : null}

      <ActivityChart stats={stats} timeline={timeline} />
      <LiveFeed alerts={alerts} />
    </div>
  );
}
