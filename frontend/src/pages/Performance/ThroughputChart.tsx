import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TimelinePoint } from '../Overview/useOverviewData';
import styles from './styles.module.css';

interface ThroughputChartProps {
  timeline: TimelinePoint[];
}

interface TooltipPayloadItem {
  name?: string | number;
  value?: string | number;
  color?: string;
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatHour(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// TODO: replace with dedicated /performance/timeseries endpoint when available.
function deriveThroughput(timeline: TimelinePoint[]) {
  return timeline.slice(-24).map((item) => ({
    hour: formatHour(item.hour),
    queries: numberOrZero(item.allowed) + numberOrZero(item.flagged) + numberOrZero(item.blocked),
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

export function ThroughputChart({ timeline }: ThroughputChartProps) {
  const data = deriveThroughput(timeline);

  return (
    <article className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2>Queries per hour</h2>
          <span>Derived from timeline allowed + flagged + blocked bins</span>
        </div>
      </div>

      <div className={styles.chartFrame}>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 12, right: 18, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="hour" tick={{ fill: 'var(--text-dim)', fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: 'var(--text-dim)', fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--border-bright)' }} />
            <Line
              type="monotone"
              dataKey="queries"
              name="Queries"
              stroke="var(--accent2)"
              strokeWidth={2}
              dot={{ r: 2, fill: 'var(--accent2)' }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
