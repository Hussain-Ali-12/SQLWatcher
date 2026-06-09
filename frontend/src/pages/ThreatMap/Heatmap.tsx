import { useMemo } from 'react';
import { scaleSequential } from 'd3-scale';
import { interpolateRgb } from 'd3-interpolate';
import { useNavigate } from 'react-router-dom';
import type { ThreatAlert } from './index';
import styles from './styles.module.css';

interface HeatmapProps {
  alerts: ThreatAlert[];
}

interface DayRow {
  label: string;
  jsDay: number;
}

const dayRows: DayRow[] = [
  { label: 'Mon', jsDay: 1 },
  { label: 'Tue', jsDay: 2 },
  { label: 'Wed', jsDay: 3 },
  { label: 'Thu', jsDay: 4 },
  { label: 'Fri', jsDay: 5 },
  { label: 'Sat', jsDay: 6 },
  { label: 'Sun', jsDay: 0 },
];

const hours = Array.from({ length: 24 }, (_, index) => index);
const cellColor = scaleSequential(interpolateRgb('rgba(239, 68, 68, 0.08)', '#ef4444')).domain([0, 1]);

function buildDensity(alerts: ThreatAlert[]): Map<string, number> {
  const density = new Map<string, number>();

  alerts.forEach((alert) => {
    const timestamp = new Date(alert.created_at);
    if (Number.isNaN(timestamp.getTime())) return;

    const hour = timestamp.getHours();
    const day = timestamp.getDay();
    const key = `${day}-${hour}`;
    const risk = typeof alert.risk_score === 'number' && Number.isFinite(alert.risk_score) ? alert.risk_score : 0;
    density.set(key, (density.get(key) ?? 0) + risk);
  });

  return density;
}

export function Heatmap({ alerts }: HeatmapProps) {
  const navigate = useNavigate();

  const density = useMemo(() => buildDensity(alerts), [alerts]);
  const maxRisk = useMemo(() => Math.max(0, ...Array.from(density.values())), [density]);

  function navigateToLogs(hour: number, day: number) {
    navigate(`/logs?hour=${hour}&day=${day}`);
  }

  return (
    <section className={styles.panel} aria-labelledby="threat-heatmap-title">
      <div className={styles.panelHeader}>
        <div>
          <h2 id="threat-heatmap-title">Temporal Risk Heatmap</h2>
          <p>Risk density by weekday and hour, derived from alert timestamps and risk scores.</p>
        </div>
        <span className={styles.panelMetric}>{alerts.length.toLocaleString()} alerts analysed</span>
      </div>

      <div className={styles.heatmapWrap}>
        <div className={styles.hourHeader} aria-hidden="true">
          <span />
          {hours.map((hour) => (
            <span key={hour} className={styles.hourLabel}>
              {hour % 4 === 0 ? String(hour).padStart(2, '0') : ''}
            </span>
          ))}
        </div>

        <div className={styles.heatmapGrid} role="grid" aria-label="Risk density heatmap by day and hour">
          {dayRows.map((day) => (
            <div className={styles.heatmapRow} role="row" key={day.label}>
              <div className={styles.dayLabel} role="rowheader">
                {day.label}
              </div>
              {hours.map((hour) => {
                const value = density.get(`${day.jsDay}-${hour}`) ?? 0;
                const normalized = maxRisk > 0 ? value / maxRisk : 0;
                const backgroundColor = value > 0 ? cellColor(normalized) : 'rgba(100, 116, 139, 0.12)';
                const label = `${day.label} ${String(hour).padStart(2, '0')}:00, risk ${value.toFixed(0)}`;

                return (
                  <button
                    type="button"
                    key={`${day.jsDay}-${hour}`}
                    role="gridcell"
                    className={styles.heatCell}
                    style={{ backgroundColor }}
                    onClick={() => navigateToLogs(hour, day.jsDay)}
                    aria-label={label}
                    title={label}
                  >
                    <span className={styles.srOnly}>{label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className={styles.heatmapLegend} aria-hidden="true">
          <span>Low</span>
          <div className={styles.legendRamp} />
          <span>High</span>
        </div>
      </div>
    </section>
  );
}
