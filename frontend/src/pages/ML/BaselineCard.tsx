import { Database, Layers3 } from 'lucide-react';
import { StatusBadge } from '../../components/ui/StatusBadge';
import type { BaselineProfile } from './useML';
import styles from './styles.module.css';

export interface BaselineCardProps {
  profile: BaselineProfile;
}

const BAR_CLASSES = [styles.queryBarCritical, styles.queryBarHigh, styles.queryBarMedium, styles.queryBarLow, styles.queryBarInfo];

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function formatDate(value: string | null) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function modelHealth(profile: BaselineProfile) {
  const maturity = profile.baseline_maturity?.toUpperCase() ?? '';
  if (profile.ml_enabled) return { status: 'ok' as const, label: 'ML enabled' };
  if (maturity === 'COLD' || profile.sample_count <= 0) return { status: 'idle' as const, label: 'Not trained' };
  return { status: 'warn' as const, label: 'Statistical only' };
}

function distributionEntries(profile: BaselineProfile) {
  const distribution = profile.query_type_distribution ?? {};
  const entries = Object.entries(distribution).filter(([, value]) => Number(value) > 0);
  const total = entries.reduce((sum, [, value]) => sum + Number(value), 0);
  return { entries, total };
}

export function BaselineCard({ profile }: BaselineCardProps) {
  const health = modelHealth(profile);
  const sampleCount = Number(profile.sample_count ?? 0);
  const statisticalProgress = clamp((sampleCount / 50) * 100);
  const mlProgress = clamp(((sampleCount - 50) / 150) * 100);
  const { entries, total } = distributionEntries(profile);
  const normalHours = new Set((profile.normal_hours ?? []).map((hour) => Number(hour)));
  const commonTables = profile.common_tables?.length ? profile.common_tables.join(', ') : 'No common tables learned yet';

  return (
    <article className={styles.baselineCard}>
      <header className={styles.baselineHeader}>
        <div className={styles.profileIdentity}>
          <span className={styles.profileIcon} aria-hidden="true">
            <Database size={16} />
          </span>
          <div>
            <h3>{profile.db_user}</h3>
            <p>{profile.model_version ?? 'No model version'}</p>
          </div>
        </div>
        <StatusBadge status={health.status} label={health.label} />
      </header>

      <section className={styles.sampleSection} aria-label={`Sample count ${sampleCount}`}>
        <div className={styles.sectionHeaderLine}>
          <span>Sample count</span>
          <strong>{sampleCount}</strong>
        </div>
        <div className={styles.progressTrack}>
          <span className={styles.progressStatistical} style={{ width: `${statisticalProgress}%` }} />
          <span className={styles.progressMl} style={{ width: `${mlProgress}%` }} />
        </div>
        <div className={styles.progressLabels}>
          <span>0</span>
          <span>50 statistical</span>
          <span>200 ML</span>
        </div>
      </section>

      <div className={styles.baselineMetaGrid}>
        <div>
          <span>Confidence</span>
          <strong>{profile.baseline_confidence ?? 'UNKNOWN'}</strong>
        </div>
        <div>
          <span>Maturity</span>
          <strong>{profile.baseline_maturity ?? 'UNKNOWN'}</strong>
        </div>
        <div>
          <span>Algorithm</span>
          <strong>{profile.ml_algorithm ?? 'Statistical'}</strong>
        </div>
        <div>
          <span>Avg risk</span>
          <strong>{Number(profile.avg_risk_score ?? 0).toFixed(1)}</strong>
        </div>
      </div>

      <section className={styles.compactSection}>
        <div className={styles.sectionTitle}>
          <Layers3 size={14} />
          <span>Common tables</span>
        </div>
        <p className={styles.dimText}>{commonTables}</p>
      </section>

      <section className={styles.compactSection}>
        <div className={styles.sectionHeaderLine}>
          <span>Query type distribution</span>
          <strong>{total || 0}</strong>
        </div>
        {entries.length ? (
          <>
            <div className={styles.distributionBar}>
              {entries.map(([key, value], index) => (
                <span
                  key={key}
                  className={BAR_CLASSES[index % BAR_CLASSES.length]}
                  style={{ width: `${Math.max(3, (Number(value) / total) * 100)}%` }}
                  title={`${key}: ${value}`}
                />
              ))}
            </div>
            <div className={styles.distributionLegend}>
              {entries.map(([key, value]) => (
                <span key={key}>{`${key} ${value}`}</span>
              ))}
            </div>
          </>
        ) : (
          <p className={styles.dimText}>No query distribution available.</p>
        )}
      </section>

      <section className={styles.compactSection}>
        <div className={styles.sectionHeaderLine}>
          <span>Normal hours</span>
          <strong>{normalHours.size}/24</strong>
        </div>
        <div className={styles.hourGrid} aria-label="Normal hours timeline">
          {Array.from({ length: 24 }, (_, hour) => (
            <span key={hour} className={normalHours.has(hour) ? styles.hourActive : styles.hourInactive} title={`${hour}:00`} />
          ))}
        </div>
      </section>

      {profile.ml_training_error ? <p className={styles.errorNote}>{profile.ml_training_error}</p> : null}

      <footer className={styles.cardFooter}>Last updated {formatDate(profile.updated_at)}</footer>
    </article>
  );
}
