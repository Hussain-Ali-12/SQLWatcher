import { useEffect, useMemo, useRef } from 'react';
import { AlertTriangle, Ban, Gauge, ListChecks } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MetricCard } from '../../components/ui/MetricCard';
import type { StatsResponse } from './useOverviewData';
import styles from './styles.module.css';

interface KpiRowProps {
  stats: StatsResponse;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatRisk(value: number): string {
  return value.toFixed(1);
}

function delta(current: number, previous: number | undefined, unit = 'vs previous'): { value: number; unit: string } | undefined {
  if (previous === undefined) return undefined;
  return { value: Number((current - previous).toFixed(1)), unit };
}

export function KpiRow({ stats }: KpiRowProps) {
  const navigate = useNavigate();
  const previousRef = useRef<StatsResponse | null>(null);
  const previous = previousRef.current;

  const metrics = useMemo(
    () => ({
      openAlerts: numberValue(stats.open_alerts),
      averageRisk: numberValue(stats.average_risk_score),
      blockedQueries: numberValue(stats.blocked_queries),
      totalQueries: numberValue(stats.total_queries),
    }),
    [stats],
  );

  useEffect(() => {
    previousRef.current = stats;
  }, [stats]);

  return (
    <section className={styles.kpiGrid} aria-label="Overview KPIs">
      <MetricCard
        label="Open Alerts"
        value={metrics.openAlerts}
        tone={metrics.openAlerts > 0 ? 'critical' : 'ok'}
        delta={delta(metrics.openAlerts, previous?.open_alerts)}
        icon={<AlertTriangle size={18} aria-hidden="true" />}
        onClick={() => navigate('/alerts')}
      />
      <MetricCard
        label="Average Risk"
        value={formatRisk(metrics.averageRisk)}
        tone={metrics.averageRisk > 50 ? 'warn' : 'neutral'}
        delta={delta(metrics.averageRisk, previous?.average_risk_score)}
        icon={<Gauge size={18} aria-hidden="true" />}
      />
      <MetricCard
        label="Blocked Queries"
        value={metrics.blockedQueries}
        tone={metrics.blockedQueries > 0 ? 'critical' : 'neutral'}
        delta={delta(metrics.blockedQueries, previous?.blocked_queries)}
        icon={<Ban size={18} aria-hidden="true" />}
        onClick={() => navigate('/logs?action=BLOCK')}
      />
      <MetricCard
        label="Total Queries"
        value={metrics.totalQueries}
        tone="neutral"
        delta={delta(metrics.totalQueries, previous?.total_queries)}
        icon={<ListChecks size={18} aria-hidden="true" />}
      />
    </section>
  );
}
