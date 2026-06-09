import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { StatsResponse, TimelinePoint } from './useOverviewData';
import styles from './styles.module.css';

interface ActivityChartProps {
  stats: StatsResponse;
  timeline: TimelinePoint[];
}

interface TooltipPayloadItem {
  name?: string | number;
  value?: string | number;
  color?: string;
}

function formatHour(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function safeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function severityDistribution(stats: StatsResponse) {
  const critical = safeNumber(stats.critical_alerts);
  const high = safeNumber(stats.high_alerts);
  const medium = safeNumber(stats.medium_alerts);
  const low = safeNumber(stats.low_alerts);
  const none = Math.max(0, safeNumber(stats.open_alerts) - critical - high - medium - low);

  return [
    { name: 'Critical', count: critical, fill: 'var(--sev-critical)' },
    { name: 'High', count: high, fill: 'var(--sev-high)' },
    { name: 'Medium', count: medium, fill: 'var(--sev-medium)' },
    { name: 'Low', count: low, fill: 'var(--sev-low)' },
    { name: 'Other', count: none, fill: 'var(--sev-none)' },
  ];
}

function timelineData(timeline: TimelinePoint[]) {
  return timeline.slice(-24).map((item) => ({
    hour: formatHour(item.hour),
    allowed: safeNumber(item.allowed),
    flagged: safeNumber(item.flagged),
    blocked: safeNumber(item.blocked),
  }));
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
  if (!active || !payload?.length) return null;

  return (
    <div className={styles.chartTooltip}>
      <p className={styles.tooltipLabel}>{label}</p>
      {payload.map((item) => (
        <div className={styles.tooltipRow} key={`${item.name}-${item.value}`}>
          <span className={styles.tooltipSwatch} style={{ backgroundColor: item.color }} aria-hidden="true" />
          <span>{item.name}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function ActivityChart({ stats, timeline }: ActivityChartProps) {
  const severityData = severityDistribution(stats);
  const hourlyData = timelineData(timeline);

  return (
    <section className={styles.chartGrid} aria-label="Query activity charts">
      <article className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Severity Distribution</h2>
          <span>Current alert mix</span>
        </div>
        <div className={styles.chartFrame}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={severityData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: 'var(--text-dim)', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(59, 130, 246, 0.08)' }} />
              <Bar dataKey="count" name="Alerts" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {severityData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>24h Query Activity</h2>
          <span>Allowed / flagged / blocked</span>
        </div>
        <div className={styles.chartFrame}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={hourlyData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="hour" tick={{ fill: 'var(--text-dim)', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: 'var(--text-dim)', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(59, 130, 246, 0.08)' }} />
              <Bar dataKey="allowed" name="Allowed" stackId="queries" fill="var(--ok)" isAnimationActive={false} />
              <Bar dataKey="flagged" name="Flagged" stackId="queries" fill="var(--sev-medium)" isAnimationActive={false} />
              <Bar dataKey="blocked" name="Blocked" stackId="queries" fill="var(--sev-critical)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>
    </section>
  );
}
