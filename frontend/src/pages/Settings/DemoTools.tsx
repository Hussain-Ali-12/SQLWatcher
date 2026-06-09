import { useState } from 'react';
import { DatabaseZap, Loader2, RefreshCcw, RotateCcw, ShieldAlert } from 'lucide-react';
import type { UserInfo } from '../../types';
import { useResetDemo, useSeedNormalTraffic, useTrainBaseline } from './useSettings';
import styles from './styles.module.css';

interface DemoToolsProps {
  user: UserInfo | null;
}

type ActionKey = 'reset' | 'seed' | 'train';

function summariseResponse(response: Record<string, unknown> | undefined, fallback: string): string {
  if (!response) return fallback;
  const status = typeof response.status === 'string' ? response.status : fallback;
  const count = typeof response.count === 'number' ? ` · ${response.count} records` : '';
  const trained = typeof response.trained_profiles === 'number' ? ` · ${response.trained_profiles} profiles` : '';
  const version = typeof response.model_version === 'string' ? ` · ${response.model_version}` : '';
  const message = typeof response.message === 'string' ? ` · ${response.message}` : '';
  return `${status}${count}${trained}${version}${message}`;
}

export function DemoTools({ user }: DemoToolsProps) {
  const resetDemo = useResetDemo();
  const seedNormalTraffic = useSeedNormalTraffic();
  const trainBaseline = useTrainBaseline();
  const [messages, setMessages] = useState<Record<ActionKey, string | null>>({ reset: null, seed: null, train: null });
  const isAdmin = user?.role === 'admin';
  const canTrain = user?.role === 'admin' || user?.role === 'analyst';

  async function runAction(action: ActionKey) {
    try {
      if (action === 'reset') {
        const response = await resetDemo.mutateAsync();
        setMessages((current) => ({ ...current, reset: summariseResponse(response, 'reset_complete') }));
        return;
      }
      if (action === 'seed') {
        const response = await seedNormalTraffic.mutateAsync();
        setMessages((current) => ({ ...current, seed: summariseResponse(response, 'seeded') }));
        return;
      }
      const response = await trainBaseline.mutateAsync();
      setMessages((current) => ({ ...current, train: summariseResponse(response, 'trained') }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Action failed.';
      setMessages((current) => ({ ...current, [action]: message }));
    }
  }

  return (
    <section className={styles.panel} aria-label="Demo tools">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Controlled workflows</p>
          <h2>Demo Tools</h2>
          <span>Run safe demo reset, traffic seed, and baseline training actions from one operator panel.</span>
        </div>
      </div>

      <div className={styles.demoGrid}>
        {isAdmin ? (
          <article className={`${styles.actionCard} ${styles.dangerCard}`}>
            <div className={styles.actionIcon}><ShieldAlert size={18} /></div>
            <div>
              <h3>Reset Demo</h3>
              <p>This clears all query logs, alerts, notifications, audit demo data, anomaly scores, and trigger counts.</p>
            </div>
            <button className={styles.dangerButton} type="button" onClick={() => void runAction('reset')} disabled={resetDemo.isPending}>
              {resetDemo.isPending ? <Loader2 size={15} className={styles.spin} /> : <RotateCcw size={15} />}
              Reset demo
            </button>
            {messages.reset ? <span className={styles.cardMessage}>{messages.reset}</span> : null}
          </article>
        ) : null}

        <article className={styles.actionCard}>
          <div className={styles.actionIcon}><DatabaseZap size={18} /></div>
          <div>
            <h3>Seed Normal Traffic</h3>
            <p>Creates ALLOW-only query history across multiple DB users so baseline profiles have clean training samples.</p>
          </div>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => void runAction('seed')}
            disabled={!canTrain || seedNormalTraffic.isPending}
            title={canTrain ? undefined : 'Viewer role cannot seed traffic.'}
          >
            {seedNormalTraffic.isPending ? <Loader2 size={15} className={styles.spin} /> : <DatabaseZap size={15} />}
            Seed traffic
          </button>
          {messages.seed ? <span className={styles.cardMessage}>{messages.seed}</span> : null}
        </article>

        <article className={styles.actionCard}>
          <div className={styles.actionIcon}><RefreshCcw size={18} /></div>
          <div>
            <h3>Train Baseline</h3>
            <p>Trains one Isolation Forest model per DB user on ALLOW-only query history. Requires enough samples per user.</p>
          </div>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => void runAction('train')}
            disabled={!canTrain || trainBaseline.isPending}
            title={canTrain ? undefined : 'Viewer role cannot train baselines.'}
          >
            {trainBaseline.isPending ? <Loader2 size={15} className={styles.spin} /> : <RefreshCcw size={15} />}
            Train baseline
          </button>
          {messages.train ? <span className={styles.cardMessage}>{messages.train}</span> : null}
        </article>
      </div>
    </section>
  );
}
