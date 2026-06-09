import { Badge, fromSeverity } from '../../components/ui/Badge';
import type { ThreatAlert } from './index';
import styles from './styles.module.css';

interface AttackerTableProps {
  alerts: ThreatAlert[];
}

interface AttackerRow {
  ip: string;
  count: number;
  highestSeverity: string;
}

const ipPattern = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const severityRank: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

function isValidIPv4(ip: string): boolean {
  return ip.split('.').every((part) => {
    const number = Number(part);
    return Number.isInteger(number) && number >= 0 && number <= 255;
  });
}

function buildRows(alerts: ThreatAlert[]): AttackerRow[] {
  const grouped = new Map<string, AttackerRow>();

  alerts.forEach((alert) => {
    const description = alert.description ?? '';
    const matches = description.match(ipPattern) ?? [];
    const uniqueIps = Array.from(new Set(matches.filter(isValidIPv4)));

    uniqueIps.forEach((ip) => {
      const current = grouped.get(ip) ?? { ip, count: 0, highestSeverity: 'LOW' };
      const severity = (alert.severity || 'LOW').toUpperCase();
      current.count += String(alert.action_taken || '').toUpperCase() === 'BLOCK' ? 1 : 0;
      if ((severityRank[severity] ?? 0) > (severityRank[current.highestSeverity] ?? 0)) {
        current.highestSeverity = severity;
      }
      grouped.set(ip, current);
    });
  });

  return Array.from(grouped.values())
    .filter((row) => row.count > 0)
    .sort((left, right) => right.count - left.count || (severityRank[right.highestSeverity] ?? 0) - (severityRank[left.highestSeverity] ?? 0))
    .slice(0, 5);
}

export function AttackerTable({ alerts }: AttackerTableProps) {
  const rows = buildRows(alerts);

  return (
    <section className={styles.panel} aria-labelledby="attacker-table-title">
      <div className={styles.panelHeader}>
        <div>
          <h2 id="attacker-table-title">Top Sources</h2>
          <p>Derived from IP-like values found in alert descriptions.</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className={styles.emptyState}>
          No IP data found in alert descriptions — this view requires IP logging to be enabled in the proxy.
          {/* TODO: add dedicated /stats/top-attackers endpoint. */}
        </div>
      ) : (
        <div className={styles.attackerTable} role="table" aria-label="Top source IPs by blocked query count">
          <div className={styles.attackerHeader} role="row">
            <span role="columnheader">IP</span>
            <span role="columnheader">Count</span>
            <span role="columnheader">Highest</span>
          </div>
          {rows.map((row) => (
            <div className={styles.attackerRow} role="row" key={row.ip}>
              <span role="cell" className={styles.ipCell}>
                {row.ip}
              </span>
              <span role="cell" className={styles.countCell}>
                {row.count.toLocaleString()}
              </span>
              <span role="cell">
                <Badge label={row.highestSeverity} variant={fromSeverity(row.highestSeverity)} />
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
