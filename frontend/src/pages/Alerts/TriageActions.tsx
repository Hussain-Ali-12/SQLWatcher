import { AlertTriangle, CheckCircle2, CircleSlash, ShieldCheck } from 'lucide-react';
import type { AlertDecision } from './useAlerts';
import styles from './styles.module.css';

interface TriageActionsProps {
  alertId: number;
  activeDecision: AlertDecision | null;
  disabled: boolean;
  onDecision: (decision: AlertDecision, notes?: string) => void;
}

const ACTIONS: Array<{
  decision: AlertDecision;
  label: string;
  notes: string;
  icon: React.ReactNode;
}> = [
  {
    decision: 'confirm_block',
    label: 'Confirm Block',
    notes: 'Analyst confirmed the blocked query was malicious or unsafe.',
    icon: <ShieldCheck size={15} aria-hidden="true" />,
  },
  {
    decision: 'allow_instance',
    label: 'Allow Once',
    notes: 'Analyst allowed this individual alert instance after review.',
    icon: <CheckCircle2 size={15} aria-hidden="true" />,
  },
  {
    decision: 'false_positive',
    label: 'False Positive',
    notes: 'Analyst marked this alert as a false positive.',
    icon: <CircleSlash size={15} aria-hidden="true" />,
  },
  {
    decision: 'escalate',
    label: 'Escalate',
    notes: 'Analyst escalated this alert for deeper investigation.',
    icon: <AlertTriangle size={15} aria-hidden="true" />,
  },
];

export function TriageActions({ alertId, activeDecision, disabled, onDecision }: TriageActionsProps) {
  return (
    <section className={styles.triageBox} aria-label={`Triage actions for alert ${alertId}`}>
      <div className={styles.sectionHeader}>
        <h3>Triage Actions</h3>
        <span>Decision is saved to analyst feedback and audit trail.</span>
      </div>
      <div className={styles.triageGrid}>
        {ACTIONS.map((action) => {
          const loading = activeDecision === action.decision;
          return (
            <button
              key={action.decision}
              type="button"
              className={styles.triageButton}
              onClick={() => onDecision(action.decision, action.notes)}
              disabled={disabled}
              aria-label={`${action.label} for alert ${alertId}`}
            >
              <span className={styles.triageIcon}>{loading ? <span className={styles.spinner} aria-hidden="true" /> : action.icon}</span>
              <span>{loading ? 'Saving...' : action.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
