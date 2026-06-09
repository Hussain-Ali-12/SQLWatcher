import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { StatusBadge } from '../../components/ui/StatusBadge';
import type { PerformanceSummary } from './index';
import styles from './styles.module.css';

interface LatencyBreakdownProps {
  summary: PerformanceSummary;
}

interface TooltipPayloadItem {
  name?: string | number;
  value?: string | number;
  color?: string;
}

const latencyColours = {
  detection: 'var(--accent)',
  anomaly: 'var(--sev-medium)',
  execution: 'var(--sev-low)',
} as const;

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatMs(value: unknown): string {
  const numeric = numberOrZero(value);
  return `${numeric.toFixed(2)} ms`;
}

function thresholdStatus(p95TotalMs: number) {
  if (p95TotalMs > 50) {
    return { status: 'error' as const, label: 'P95 latency exceeds 50ms threshold' };
  }

  if (p95TotalMs > 20) {
    return { status: 'warn' as const, label: 'P95 latency exceeds 20ms threshold' };
  }

  return { status: 'ok' as const, label: 'P95 latency within threshold' };
}

function chartData(summary: PerformanceSummary) {
  return [
    {
      label: 'Current Average',
      detection: numberOrZero(summary.avg_detection_ms),
      anomaly: numberOrZero(summary.avg_anomaly_ms),
      execution: numberOrZero(summary.avg_execution_ms),
    },
    {
      label: 'P50 Total',
      detection: 0,
      anomaly: 0,
      execution: numberOrZero(summary.p50_total_ms),
    },
    {
      label: 'P95 Total',
      detection: 0,
      anomaly: 0,
      execution: numberOrZero(summary.p95_total_ms),
    },
    {
      label: 'P99 Total',
      detection: 0,
      anomaly: 0,
      execution: numberOrZero(summary.p99_total_ms),
    },
  ];
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
  if (!active || !payload?.length) return null;

  return (
    <div className={styles.chartTooltip}>
      <p className={styles.tooltipLabel}>{label}</p>
      {payload
        .filter((item) => numberOrZero(item.value) > 0)
        .map((item) => (
          <div className={styles.tooltipRow} key={`${item.name}-${item.value}`}>
            <span className={styles.tooltipSwatch} style={{ backgroundColor: item.color }} aria-hidden="true" />
            <span>{item.name}</span>
            <strong>{formatMs(item.value)}</strong>
          </div>
        ))}
    </div>
  );
}

export function LatencyBreakdown({ summary }: LatencyBreakdownProps) {
  const data = chartData(summary);
  const threshold = thresholdStatus(numberOrZero(summary.p95_total_ms));

  return (
    <article className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>Latency Breakdown</h2>
          <span>Detection, anomaly scoring, execution, and percentile totals</span>
        </div>
        <StatusBadge status={threshold.status} label={threshold.label} />
      </div>

      <div className={styles.chartFrame}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval={0}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              label={{ value: 'ms', angle: -90, position: 'insideLeft', fill: 'var(--text-dim)', fontSize: 11 }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(59, 130, 246, 0.08)' }} />
            <Bar dataKey="detection" name="Detection" stackId="latency" fill={latencyColours.detection} isAnimationActive={false} />
            <Bar dataKey="anomaly" name="Anomaly" stackId="latency" fill={latencyColours.anomaly} isAnimationActive={false} />
            <Bar dataKey="execution" name="Execution / Total" stackId="latency" isAnimationActive={false} radius={[4, 4, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.label} fill={latencyColours.execution} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={styles.latencyLegend} aria-label="Latency chart legend">
        <span>
          <i className={styles.legendDetection} aria-hidden="true" /> Detection
        </span>
        <span>
          <i className={styles.legendAnomaly} aria-hidden="true" /> Anomaly
        </span>
        <span>
          <i className={styles.legendExecution} aria-hidden="true" /> Execution / percentile total
        </span>
      </div>
    </article>
  );
}
