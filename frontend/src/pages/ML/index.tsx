import { useMemo, useState } from 'react';
import { Activity, BrainCircuit, DatabaseZap, FlaskConical, RefreshCcw, ShieldCheck } from 'lucide-react';
import { MetricCard } from '../../components/ui/MetricCard';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Tabs } from '../../components/ui/Tabs';
import { useAuthStore } from '../../store/authStore';
import { BaselineCard } from './BaselineCard';
import { AnomalyTable } from './AnomalyTable';
import { FeedbackPanel } from './FeedbackPanel';
import type { AnomalyFeedbackType, AnomalyScore, EvaluationSummary } from './useML';
import { useAnomalyFeedback, useAnomalyScores, useEvaluationSummary, useMLProfiles, useSeedNormalTraffic, useTrainBaseline } from './useML';
import styles from './styles.module.css';

const tabs = [
  { key: 'profiles', label: 'Baseline Profiles', icon: <DatabaseZap size={14} /> },
  { key: 'anomalies', label: 'Anomaly Scores', icon: <Activity size={14} /> },
  { key: 'evaluation', label: 'Evaluation', icon: <ShieldCheck size={14} /> },
  { key: 'training', label: 'Training', icon: <FlaskConical size={14} /> },
];

function readinessStatus(status: string): 'ok' | 'warn' | 'error' | 'idle' {
  const normalized = status.toUpperCase();
  if (normalized === 'READY') return 'ok';
  if (normalized.includes('WARN')) return 'warn';
  if (normalized.includes('NEEDS')) return 'error';
  return 'idle';
}

function checkGlyph(status: string) {
  if (status.toUpperCase() === 'PASS') return '✓';
  if (status.toUpperCase() === 'CHECK') return '⚠';
  return '✗';
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function EvaluationPanel({ summary }: { summary: EvaluationSummary | undefined }) {
  if (!summary) {
    return <div className={styles.emptyPanel}>Evaluation summary is not available yet.</div>;
  }

  const readiness = summary.readiness;
  const summaryEntries = Object.entries(readiness.summary ?? {});
  const policyEntries = Object.entries(summary.policy ?? {});

  return (
    <div className={styles.evaluationGrid}>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Readiness</h2>
            <p>Current ML operating readiness based on profiles, feedback, and policy state.</p>
          </div>
          <StatusBadge status={readinessStatus(readiness.status)} label={readiness.status} />
        </div>
        <div className={styles.summaryGrid}>
          {summaryEntries.map(([key, value]) => (
            <div key={key} className={styles.summaryTile}>
              <span>{key.replace(/_/g, ' ')}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Checks</h2>
            <p>Operational checks returned by the backend evaluation endpoint.</p>
          </div>
        </div>
        <ul className={styles.checkList}>
          {readiness.checks.map((check) => (
            <li key={check.name}>
              <span className={check.status === 'PASS' ? styles.checkPass : styles.checkWarn}>{checkGlyph(check.status)}</span>
              <div>
                <strong>{check.name}</strong>
                <p>{check.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Recommendations</h2>
            <p>Next steps to improve demo and production readiness.</p>
          </div>
        </div>
        {readiness.recommendations.length ? (
          <ol className={styles.recommendations}>
            {readiness.recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        ) : (
          <p className={styles.dimText}>No recommendations returned.</p>
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Policy</h2>
            <p>Current anomaly policy values.</p>
          </div>
        </div>
        <div className={styles.policyGrid}>
          {policyEntries.map(([key, value]) => (
            <div key={key}>
              <span>{key}</span>
              <strong>{formatValue(value)}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function TrainingPanel() {
  const user = useAuthStore((state) => state.user);
  const seedTraffic = useSeedNormalTraffic();
  const trainBaseline = useTrainBaseline();
  const canTrain = user?.role === 'admin' || user?.role === 'analyst';
  const statusMessage = seedTraffic.isSuccess
    ? `Normal traffic seeded: ${JSON.stringify(seedTraffic.data)}`
    : trainBaseline.isSuccess
      ? `Baseline refreshed: ${trainBaseline.data.trained_profiles} profile(s) trained.`
      : seedTraffic.error
        ? seedTraffic.error.message
        : trainBaseline.error
          ? trainBaseline.error.message
          : 'No training action has been run in this session.';

  if (!canTrain) {
    return (
      <div className={styles.panel}>
        <h2>Training unavailable</h2>
        <p className={styles.dimText}>Viewer role cannot seed traffic or train baselines.</p>
      </div>
    );
  }

  return (
    <div className={styles.trainingGrid}>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Training controls</h2>
            <p>Generate clean traffic first, then refresh baseline profiles.</p>
          </div>
        </div>
        <div className={styles.trainingActions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => seedTraffic.mutate()}
            disabled={seedTraffic.isPending || trainBaseline.isPending}
          >
            <RefreshCcw size={15} />
            Seed Normal Traffic
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => trainBaseline.mutate()}
            disabled={seedTraffic.isPending || trainBaseline.isPending}
          >
            <BrainCircuit size={15} />
            Refresh Baseline
          </button>
        </div>
        <div className={styles.statusBox}>{statusMessage}</div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Training summary</h2>
            <p>Read-only description of the backend training workflow.</p>
          </div>
        </div>
        <p className={styles.trainingDescription}>
          Trains one Isolation Forest model per DB user on ALLOW-only query history. Requires at least 50 samples per user.
        </p>
        <ul className={styles.trainingNotes}>
          <li>Queries with high risk scores are excluded from trusted training data.</li>
          <li>Analyst feedback such as false positive or add to baseline can influence trusted samples.</li>
          <li>Profile maturity increases as sample count grows from learning to stable to mature.</li>
        </ul>
      </section>
    </div>
  );
}

export function MLPage() {
  const [activeTab, setActiveTab] = useState('profiles');
  const [selectedAnomaly, setSelectedAnomaly] = useState<AnomalyScore | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const profilesQuery = useMLProfiles();
  const anomaliesQuery = useAnomalyScores();
  const evaluationQuery = useEvaluationSummary();
  const feedbackMutation = useAnomalyFeedback();

  const profiles = profilesQuery.data ?? [];
  const anomalies = anomaliesQuery.data ?? [];
  const selectedScore = selectedAnomaly?.anomaly_id;

  const metrics = useMemo(() => {
    const mlProfiles = profiles.filter((profile) => profile.ml_enabled).length;
    const maxAnomaly = anomalies.reduce((max, item) => Math.max(max, Number(item.anomaly_score ?? 0)), 0);
    const highAnomalies = anomalies.filter((item) => Number(item.anomaly_score ?? 0) >= 70).length;
    return { mlProfiles, maxAnomaly, highAnomalies };
  }, [anomalies, profiles]);

  function openFeedback(anomaly: AnomalyScore) {
    setSelectedAnomaly(anomaly);
    setFeedbackOpen(true);
    feedbackMutation.reset();
  }

  function submitFeedback(feedbackType: AnomalyFeedbackType, notes?: string) {
    if (!selectedAnomaly) return;
    feedbackMutation.mutate(
      {
        query_id: selectedAnomaly.query_id,
        anomaly_id: selectedAnomaly.anomaly_id,
        feedback_type: feedbackType,
        notes,
      },
      {
        onSuccess: () => {
          setFeedbackOpen(false);
        },
      },
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>ML Behaviour Baseline</p>
          <h1>ML Baseline</h1>
          <p>Monitor per-user query baselines, review anomaly scores, and capture analyst feedback.</p>
        </div>
        <StatusBadge
          status={profilesQuery.isFetching || anomaliesQuery.isFetching || evaluationQuery.isFetching ? 'loading' : 'ok'}
          label={profilesQuery.isFetching || anomaliesQuery.isFetching || evaluationQuery.isFetching ? 'Refreshing' : 'Synced'}
        />
      </header>

      <section className={styles.metricRow}>
        <MetricCard label="Profiles" value={profiles.length} tone="neutral" icon={<DatabaseZap size={16} />} />
        <MetricCard label="ML Enabled" value={metrics.mlProfiles} tone={metrics.mlProfiles > 0 ? 'ok' : 'warn'} icon={<BrainCircuit size={16} />} />
        <MetricCard label="High Anomalies" value={metrics.highAnomalies} tone={metrics.highAnomalies > 0 ? 'critical' : 'neutral'} />
        <MetricCard label="Max Score" value={metrics.maxAnomaly} tone={metrics.maxAnomaly > 80 ? 'critical' : metrics.maxAnomaly > 60 ? 'warn' : 'neutral'} />
      </section>

      {(profilesQuery.error || anomaliesQuery.error || evaluationQuery.error) && (
        <div className={styles.errorBanner}>
          {profilesQuery.error?.message || anomaliesQuery.error?.message || evaluationQuery.error?.message || 'Unable to load ML data.'}
        </div>
      )}

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab}>
        <Tabs.Panel tabKey="profiles">
          {profiles.length ? (
            <div className={styles.profileGrid}>
              {profiles.map((profile) => (
                <BaselineCard key={profile.db_user} profile={profile} />
              ))}
            </div>
          ) : (
            <div className={styles.emptyPanel}>No baseline profiles found. Seed normal traffic and refresh baselines to create profiles.</div>
          )}
        </Tabs.Panel>

        <Tabs.Panel tabKey="anomalies">
          <div className={styles.tablePanel}>
            <AnomalyTable
              anomalies={anomalies}
              selectedId={selectedScore}
              onSelect={(item) => setSelectedAnomaly(item)}
              onFeedback={openFeedback}
            />
          </div>
        </Tabs.Panel>

        <Tabs.Panel tabKey="evaluation">
          <EvaluationPanel summary={evaluationQuery.data} />
        </Tabs.Panel>

        <Tabs.Panel tabKey="training">
          <TrainingPanel />
        </Tabs.Panel>
      </Tabs>

      <FeedbackPanel
        anomaly={selectedAnomaly}
        open={feedbackOpen}
        submitting={feedbackMutation.isPending}
        error={feedbackMutation.error?.message ?? null}
        onClose={() => setFeedbackOpen(false)}
        onSubmit={submitFeedback}
      />
    </div>
  );
}
