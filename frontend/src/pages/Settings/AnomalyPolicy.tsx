import { useEffect, useState } from 'react';
import { Loader2, Save, ShieldCheck } from 'lucide-react';
import { StatusBadge } from '../../components/ui/StatusBadge';
import type { AnomalyConfig } from './useSettings';
import { useAnomalyConfig, useSaveAnomalyConfig } from './useSettings';
import styles from './styles.module.css';

const ENFORCEMENT_MODES = [
  { value: 'flag', label: 'Flag only' },
  { value: 'block', label: 'Block when threshold matched' },
  { value: 'observe', label: 'Monitor only' },
];

function fallbackPolicy(): AnomalyConfig {
  return {
    enabled: true,
    enforcement_mode: 'flag',
    min_score: 70,
  };
}

export function AnomalyPolicy() {
  const policyQuery = useAnomalyConfig();
  const savePolicy = useSaveAnomalyConfig();
  const [policy, setPolicy] = useState<AnomalyConfig>(() => fallbackPolicy());
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (policyQuery.data) setPolicy(policyQuery.data);
  }, [policyQuery.data]);

  function updatePolicy(next: Partial<AnomalyConfig>) {
    setPolicy((current) => ({ ...current, ...next }));
    setMessage(null);
  }

  async function handleSave() {
    setMessage(null);
    try {
      const saved = await savePolicy.mutateAsync({
        enabled: policy.enabled,
        enforcement_mode: policy.enforcement_mode,
        min_score: Math.max(1, Math.min(100, Number(policy.min_score) || 70)),
      });
      setPolicy(saved);
      setMessage(`Policy saved: ${saved.enabled ? 'enabled' : 'disabled'}, ${saved.enforcement_mode}, score ≥ ${saved.min_score}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save anomaly policy.');
    }
  }

  return (
    <section className={styles.panel} aria-label="Anomaly detection policy">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Detection policy</p>
          <h2>Anomaly Detection</h2>
          <span>Control anomaly scoring and enforcement threshold for the proxy decision flow.</span>
        </div>
        {policyQuery.isFetching ? (
          <StatusBadge status="loading" label="Refreshing" />
        ) : policy.enabled ? (
          <StatusBadge status="ok" label="Enabled" />
        ) : (
          <StatusBadge status="idle" label="Disabled" />
        )}
      </div>

      <div className={styles.policyLayout}>
        <div className={styles.formCard}>
          <div className={styles.sectionTitle}>
            <ShieldCheck size={16} />
            <span>Enforcement Controls</span>
          </div>

          <label className={styles.toggleField}>
            <span>
              <strong>Enable anomaly detection</strong>
              <small>When disabled, anomaly scores remain visible but should not influence enforcement.</small>
            </span>
            <input
              type="checkbox"
              checked={policy.enabled}
              onChange={(event) => updatePolicy({ enabled: event.target.checked })}
            />
          </label>

          <label className={styles.field}>
            <span>Enforcement mode</span>
            <select
              value={policy.enforcement_mode}
              onChange={(event) => updatePolicy({ enforcement_mode: event.target.value })}
            >
              {ENFORCEMENT_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Minimum anomaly score</span>
            <input
              type="number"
              min={1}
              max={100}
              value={policy.min_score}
              onChange={(event) => updatePolicy({ min_score: Number(event.target.value) })}
            />
          </label>
        </div>

        <div className={styles.readonlyCard}>
          <h3>Policy summary</h3>
          <div className={styles.kvGrid}>
            <span>Status</span>
            <strong>{policy.enabled ? 'Enabled' : 'Disabled'}</strong>
            <span>Mode</span>
            <strong>{policy.enforcement_mode}</strong>
            <span>Threshold</span>
            <strong>{policy.min_score}</strong>
          </div>
          <p>
            SQLWatcher uses this threshold after rule-based inspection and baseline scoring. Keep the threshold conservative during
            baseline warm-up and tighten it once per-user profiles are mature.
          </p>
        </div>
      </div>

      <div className={styles.actionFooter}>
        {message ? <span className={styles.statusMessage}>{message}</span> : <span />}
        <button className={styles.primaryButton} type="button" onClick={handleSave} disabled={savePolicy.isPending}>
          {savePolicy.isPending ? <Loader2 size={15} className={styles.spin} /> : <Save size={15} />}
          Save anomaly policy
        </button>
      </div>
    </section>
  );
}
