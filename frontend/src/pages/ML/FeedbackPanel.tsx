import { AlertTriangle, CheckCircle2, FilePlus2, GitBranchPlus, RefreshCcw } from 'lucide-react';
import { useState } from 'react';
import { Badge, fromAction, fromSeverity } from '../../components/ui/Badge';
import { DetailDrawer } from '../../components/ui/DetailDrawer';
import { HighlightedQuery } from '../../components/sql/HighlightedQuery';
import type { AnomalyFeedbackType, AnomalyScore } from './useML';
import styles from './styles.module.css';

export interface FeedbackPanelProps {
  anomaly: AnomalyScore | null;
  open: boolean;
  submitting: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (feedbackType: AnomalyFeedbackType, notes?: string) => void;
}

const ACTIONS: Array<{
  type: AnomalyFeedbackType;
  label: string;
  description: string;
  icon: typeof AlertTriangle;
}> = [
  {
    type: 'CONFIRM_ANOMALY',
    label: 'Confirm Anomaly',
    description: 'Escalate this item as a real behavioral anomaly.',
    icon: AlertTriangle,
  },
  {
    type: 'EXPECTED_BEHAVIOR',
    label: 'Expected Behavior',
    description: 'Mark the query as expected for this user and context.',
    icon: CheckCircle2,
  },
  {
    type: 'FALSE_POSITIVE',
    label: 'False Positive',
    description: 'Resolve the finding as a noisy anomaly score.',
    icon: RefreshCcw,
  },
  {
    type: 'ADD_TO_BASELINE',
    label: 'Add to Baseline',
    description: 'Trust this query pattern as future training evidence.',
    icon: FilePlus2,
  },
  {
    type: 'CREATE_RULE_SUGGESTION',
    label: 'Create Rule Suggestion',
    description: 'Flag this behavior for follow-up rule creation.',
    icon: GitBranchPlus,
  },
];

function formatScore(value: number | null | undefined) {
  return Number(value ?? 0).toFixed(0);
}

export function FeedbackPanel({ anomaly, open, submitting, error, onClose, onSubmit }: FeedbackPanelProps) {
  const [notes, setNotes] = useState('');

  function submit(type: AnomalyFeedbackType) {
    onSubmit(type, notes.trim() || undefined);
  }

  return (
    <DetailDrawer
      open={open && anomaly !== null}
      onClose={onClose}
      title="Anomaly Feedback"
      subtitle={anomaly ? `Query #${anomaly.query_id} · ${anomaly.db_user}` : undefined}
      width={560}
    >
      {anomaly ? (
        <div className={styles.feedbackStack}>
          <section className={styles.feedbackSummary}>
            <div>
              <span>Anomaly score</span>
              <strong>{formatScore(anomaly.anomaly_score)}</strong>
            </div>
            <div>
              <span>Statistical</span>
              <strong>{formatScore(anomaly.statistical_score)}</strong>
            </div>
            <div>
              <span>ML score</span>
              <strong>{formatScore(anomaly.ml_anomaly_score)}</strong>
            </div>
          </section>

          <div className={styles.badgeRow}>
            <Badge label={anomaly.action_taken ?? 'NONE'} variant={fromAction(anomaly.action_taken ?? '')} />
            <Badge label={anomaly.severity ?? 'NONE'} variant={fromSeverity(anomaly.severity ?? '')} />
            <Badge label={anomaly.anomaly_category ?? 'UNKNOWN'} variant="info" />
          </div>

          <section className={styles.drawerSection}>
            <h3>SQL evidence</h3>
            <HighlightedQuery sql={anomaly.raw_sql ?? ''} maxLines={8} />
          </section>

          <section className={styles.drawerSection}>
            <h3>Reasons</h3>
            <ul className={styles.reasonList}>
              {(anomaly.anomaly_reasons?.length ? anomaly.anomaly_reasons : ['No anomaly reasons recorded.']).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </section>

          <label className={styles.notesLabel}>
            <span>Analyst notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional context for this feedback decision."
              rows={4}
            />
          </label>

          {error ? <p className={styles.errorNote}>{error}</p> : null}

          <section className={styles.feedbackActions} aria-label="Feedback actions">
            {ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button key={action.type} type="button" className={styles.feedbackButton} onClick={() => submit(action.type)} disabled={submitting}>
                  <Icon size={16} aria-hidden="true" />
                  <span>
                    <strong>{action.label}</strong>
                    <small>{action.description}</small>
                  </span>
                </button>
              );
            })}
          </section>
        </div>
      ) : null}
    </DetailDrawer>
  );
}
