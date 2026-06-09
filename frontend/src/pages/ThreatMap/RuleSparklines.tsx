import { Badge, fromAction } from '../../components/ui/Badge';
import type { ThreatRule } from './index';
import styles from './styles.module.css';

interface RuleSparklinesProps {
  rules: ThreatRule[];
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(8, Math.min(100, value));
}

export function RuleSparklines({ rules }: RuleSparklinesProps) {
  const topRules = [...rules]
    .sort((left, right) => (right.trigger_count ?? 0) - (left.trigger_count ?? 0))
    .slice(0, 10);
  const maxTriggers = Math.max(1, ...topRules.map((rule) => rule.trigger_count ?? 0));

  return (
    <section className={styles.panel} aria-labelledby="rule-sparklines-title">
      <div className={styles.panelHeader}>
        <div>
          <h2 id="rule-sparklines-title">Rule Trigger Load</h2>
          <p>Top rules by trigger count. Daily breakdown is reserved for a future API response.</p>
        </div>
      </div>

      {topRules.length === 0 ? (
        <div className={styles.emptyState}>No rule telemetry available.</div>
      ) : (
        <div className={styles.ruleList}>
          {topRules.map((rule) => {
            const height = clampPercent(((rule.trigger_count ?? 0) / maxTriggers) * 100);
            // TODO: replace with daily breakdown when API supports it.
            return (
              <div className={styles.ruleRow} key={rule.rule_id}>
                <div className={styles.ruleInfo}>
                  <span className={styles.ruleName} title={rule.rule_name}>
                    {rule.rule_name.length > 30 ? `${rule.rule_name.slice(0, 29)}…` : rule.rule_name}
                  </span>
                  <Badge label={rule.action || 'NONE'} variant={fromAction(rule.action || 'NONE')} />
                </div>
                <div className={styles.sparkline} aria-label={`${rule.trigger_count ?? 0} triggers`}>
                  {Array.from({ length: 7 }, (_, index) => (
                    <span
                      key={index}
                      className={index === 6 ? styles.sparkBarActive : styles.sparkBarMuted}
                      style={{ height: index === 6 ? `${height}%` : '10%' }}
                    />
                  ))}
                </div>
                <span className={styles.triggerCount}>{(rule.trigger_count ?? 0).toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
