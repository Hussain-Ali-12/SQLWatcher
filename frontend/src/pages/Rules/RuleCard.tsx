import { Lock, ToggleLeft, ToggleRight } from 'lucide-react';
import { Badge, fromAction, fromSeverity } from '../../components/ui/Badge';
import type { RuleItem } from './useRules';
import styles from './styles.module.css';

interface RuleCardProps {
  rule: RuleItem;
  selected: boolean;
  onSelect: (rule: RuleItem) => void;
  onToggle: (rule: RuleItem) => void;
  toggleDisabled: boolean;
}

export function RuleCard({ rule, selected, onSelect, onToggle, toggleDisabled }: RuleCardProps) {
  const disabledReason = rule.is_system
    ? 'System rules cannot be toggled directly from the list. Open the rule editor to change allowed policy fields.'
    : 'Only admin users can toggle rules.';

  return (
    <article className={`${styles.ruleCard} ${selected ? styles.ruleCardSelected : ''}`} title={`${rule.rule_name}: ${rule.description}`}>
      <button
        type="button"
        className={styles.ruleCardMain}
        onClick={() => onSelect(rule)}
        aria-pressed={selected}
        aria-label={`Open rule ${rule.rule_name}`}
      >
        <span className={styles.ruleNameRow}>
          <span className={styles.ruleName}>{rule.rule_name}</span>
          {rule.is_system ? <Lock size={12} aria-label="System rule" className={styles.lockIcon} /> : null}
        </span>
        <span className={styles.ruleMetaRow} aria-label={`${rule.severity} severity, ${rule.action} action`}>
          <Badge label={rule.severity} variant={fromSeverity(rule.severity)} />
          <Badge label={rule.action} variant={fromAction(rule.action)} />
          <span className={styles.triggerCount}>{rule.trigger_count} hits</span>
        </span>
      </button>

      <button
        type="button"
        className={`${styles.toggleButton} ${rule.enabled ? styles.toggleEnabled : styles.toggleDisabledState}`}
        onClick={() => onToggle(rule)}
        disabled={toggleDisabled || rule.is_system}
        title={toggleDisabled || rule.is_system ? disabledReason : rule.enabled ? 'Disable rule' : 'Enable rule'}
        aria-label={`${rule.enabled ? 'Disable' : 'Enable'} ${rule.rule_name}`}
      >
        {rule.enabled ? <ToggleRight size={21} aria-hidden="true" /> : <ToggleLeft size={21} aria-hidden="true" />}
        <span>{rule.enabled ? 'ON' : 'OFF'}</span>
      </button>
    </article>
  );
}
