import { useEffect, useMemo, useState } from 'react';
import { CopyPlus, Loader2, Save, Trash2 } from 'lucide-react';
import { Badge, fromAction, fromSeverity } from '../../components/ui/Badge';
import type { RuleItem, RulePayload } from './useRules';
import { RuleTester } from './RuleTester';
import styles from './styles.module.css';

export interface RuleFormState {
  rule_name: string;
  description: string;
  severity: string;
  action: string;
  risk_score: number;
  rule_type: string;
  match_target: string;
  match_pattern: string;
  enabled: boolean;
}

interface RuleEditorProps {
  selectedRule: RuleItem | null;
  mode: 'create' | 'edit';
  isAdmin: boolean;
  saving: boolean;
  deleting: boolean;
  error?: string | null;
  onCreateMode: () => void;
  onSave: (payload: RulePayload, selectedRule: RuleItem | null) => Promise<void> | void;
  onDelete: (rule: RuleItem) => Promise<void> | void;
}

const EMPTY_FORM: RuleFormState = {
  rule_name: '',
  description: '',
  severity: 'HIGH',
  action: 'BLOCK',
  risk_score: 80,
  rule_type: 'KEYWORD',
  match_target: 'RAW_SQL',
  match_pattern: '',
  enabled: true,
};

const PASSWORD_DUMP_EXAMPLE: RuleFormState = {
  rule_name: 'BLOCK_PASSWORD_DUMP',
  description: 'Blocks attempts to dump password fields from user tables.',
  severity: 'CRITICAL',
  action: 'BLOCK',
  risk_score: 95,
  rule_type: 'REGEX',
  match_target: 'RAW_SQL',
  match_pattern: '(password|passwd|pwd_hash|credential)',
  enabled: true,
};

function formFromRule(rule: RuleItem | null): RuleFormState {
  if (!rule) return EMPTY_FORM;
  return {
    rule_name: rule.rule_name,
    description: rule.description ?? '',
    severity: rule.severity || 'MEDIUM',
    action: rule.action || 'FLAG',
    risk_score: Number(rule.risk_score ?? 50),
    rule_type: rule.rule_type || 'KEYWORD',
    match_target: rule.match_target || 'RAW_SQL',
    match_pattern: rule.match_pattern ?? '',
    enabled: Boolean(rule.enabled),
  };
}

function clampRiskScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function toPayload(form: RuleFormState, selectedRule: RuleItem | null): RulePayload {
  const isSystem = Boolean(selectedRule?.is_system);
  return {
    rule_name: isSystem ? selectedRule?.rule_name ?? form.rule_name : form.rule_name,
    description: form.description,
    severity: form.severity,
    action: form.action,
    enabled: form.enabled,
    rule_type: isSystem ? 'BUILTIN' : form.rule_type,
    match_pattern: isSystem ? selectedRule?.match_pattern ?? 'BUILTIN' : form.match_pattern,
    match_target: isSystem ? 'RAW_SQL' : form.match_target,
    risk_score: clampRiskScore(form.risk_score),
  };
}

export function RuleEditor({ selectedRule, mode, isAdmin, saving, deleting, error, onCreateMode, onSave, onDelete }: RuleEditorProps) {
  const [form, setForm] = useState<RuleFormState>(() => formFromRule(selectedRule));

  useEffect(() => {
    setForm(mode === 'create' ? EMPTY_FORM : formFromRule(selectedRule));
  }, [mode, selectedRule]);

  const isSystem = Boolean(selectedRule?.is_system && mode === 'edit');
  const cannotWriteReason = isAdmin ? undefined : 'Only admin users can create, save, delete, or import rules.';
  const customFieldsDisabled = !isAdmin || isSystem;
  const policyFieldsDisabled = !isAdmin;

  const validation = useMemo(() => {
    if (!form.rule_name.trim()) return 'Rule name is required.';
    if (form.rule_name.trim().length < 3) return 'Rule name must be at least 3 characters.';
    if (!form.description.trim() || form.description.trim().length < 3) return 'Description must be at least 3 characters.';
    if (!isSystem && !form.match_pattern.trim()) return 'Custom rules require a match pattern.';
    if (form.risk_score < 0 || form.risk_score > 100) return 'Risk score must be between 0 and 100.';
    if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(form.severity)) return 'Invalid severity.';
    if (!['ALLOW', 'FLAG', 'BLOCK'].includes(form.action)) return 'Invalid action.';
    if (!isSystem && !['KEYWORD', 'REGEX'].includes(form.rule_type)) return 'Custom rules must be KEYWORD or REGEX.';
    if (!['RAW_SQL', 'NORMALIZED_SQL'].includes(form.match_target)) return 'Invalid match target.';
    return null;
  }, [form, isSystem]);

  function updateField<K extends keyof RuleFormState>(key: K, value: RuleFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || validation) return;
    void onSave(toPayload(form, selectedRule), selectedRule);
  }

  return (
    <section className={styles.editorPanel} aria-label="Rule editor">
      <header className={styles.editorHeader}>
        <div>
          <p className={styles.eyebrow}>{mode === 'create' ? 'Create custom rule' : isSystem ? 'System rule policy' : 'Custom rule editor'}</p>
          <h2>{mode === 'create' ? 'New Rule' : selectedRule?.rule_name ?? 'Select a rule'}</h2>
        </div>
        <div className={styles.editorHeaderActions}>
          {selectedRule ? <Badge label={selectedRule.severity} variant={fromSeverity(selectedRule.severity)} /> : null}
          {selectedRule ? <Badge label={selectedRule.action} variant={fromAction(selectedRule.action)} /> : null}
          <button type="button" className={styles.secondaryButton} onClick={onCreateMode} disabled={!isAdmin} title={cannotWriteReason}>
            <CopyPlus size={14} aria-hidden="true" />
            New Rule
          </button>
        </div>
      </header>

      <form className={styles.formGrid} onSubmit={submitForm}>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="rule-name">
            Rule Name
          </label>
          <input
            id="rule-name"
            className={styles.input}
            value={form.rule_name}
            onChange={(event) => updateField('rule_name', event.target.value)}
            disabled={customFieldsDisabled}
            spellCheck={false}
          />
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="rule-enabled">
            Enabled
          </label>
          <label className={styles.checkboxLine}>
            <input
              id="rule-enabled"
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => updateField('enabled', event.target.checked)}
              disabled={policyFieldsDisabled}
            />
            <span>{form.enabled ? 'Enabled' : 'Disabled'}</span>
          </label>
        </div>

        <div className={styles.fieldGroupFull}>
          <label className={styles.fieldLabel} htmlFor="rule-description">
            Description
          </label>
          <textarea
            id="rule-description"
            className={styles.textarea}
            value={form.description}
            onChange={(event) => updateField('description', event.target.value)}
            rows={4}
            disabled={customFieldsDisabled}
          />
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="rule-severity">
            Severity
          </label>
          <select
            id="rule-severity"
            className={styles.select}
            value={form.severity}
            onChange={(event) => updateField('severity', event.target.value)}
            disabled={customFieldsDisabled}
          >
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
            <option value="CRITICAL">CRITICAL</option>
          </select>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="rule-action">
            Action
          </label>
          <select
            id="rule-action"
            className={styles.select}
            value={form.action}
            onChange={(event) => updateField('action', event.target.value)}
            disabled={policyFieldsDisabled}
          >
            <option value="ALLOW">ALLOW</option>
            <option value="FLAG">FLAG</option>
            <option value="BLOCK">BLOCK</option>
          </select>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="rule-risk">
            Risk Score
          </label>
          <input
            id="rule-risk"
            className={styles.input}
            type="number"
            min={0}
            max={100}
            value={form.risk_score}
            onChange={(event) => updateField('risk_score', clampRiskScore(Number(event.target.value)))}
            disabled={customFieldsDisabled}
          />
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="rule-type">
            Rule Type
          </label>
          <select
            id="rule-type"
            className={styles.select}
            value={isSystem ? 'BUILTIN' : form.rule_type}
            onChange={(event) => updateField('rule_type', event.target.value)}
            disabled={customFieldsDisabled}
          >
            {isSystem ? <option value="BUILTIN">BUILTIN</option> : null}
            <option value="KEYWORD">KEYWORD</option>
            <option value="REGEX">REGEX</option>
          </select>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="rule-target">
            Match Target
          </label>
          <select
            id="rule-target"
            className={styles.select}
            value={form.match_target}
            onChange={(event) => updateField('match_target', event.target.value)}
            disabled={customFieldsDisabled}
          >
            <option value="RAW_SQL">RAW_SQL</option>
            <option value="NORMALIZED_SQL">NORMALIZED_SQL</option>
          </select>
        </div>

        <div className={styles.fieldGroupFull}>
          <label className={styles.fieldLabel} htmlFor="rule-pattern">
            Match Pattern
          </label>
          <input
            id="rule-pattern"
            className={styles.input}
            value={form.match_pattern}
            onChange={(event) => updateField('match_pattern', event.target.value)}
            disabled={customFieldsDisabled}
            spellCheck={false}
          />
        </div>

        {!isSystem ? <RuleTester ruleType={form.rule_type} pattern={form.match_pattern} /> : <div className={styles.systemNote}>Built-in rule logic is maintained by the backend. Only action and enabled state are editable here.</div>}

        {error ? <div className={styles.formError}>{error}</div> : null}
        {validation ? <div className={styles.formNotice}>{validation}</div> : null}

        <footer className={styles.formActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setForm(PASSWORD_DUMP_EXAMPLE)}
            disabled={!isAdmin || isSystem}
            title={isSystem ? 'Examples apply to custom rules only.' : cannotWriteReason}
          >
            Load Example
          </button>
          <button
            type="button"
            className={styles.dangerButton}
            onClick={() => selectedRule && void onDelete(selectedRule)}
            disabled={!isAdmin || deleting || !selectedRule || selectedRule.is_system}
            title={!isAdmin ? cannotWriteReason : selectedRule?.is_system ? 'System rules cannot be deleted.' : undefined}
          >
            {deleting ? <Loader2 size={14} aria-hidden="true" className={styles.spin} /> : <Trash2 size={14} aria-hidden="true" />}
            Delete
          </button>
          <button type="submit" className={styles.primaryButton} disabled={!isAdmin || saving || Boolean(validation)} title={cannotWriteReason}>
            {saving ? <Loader2 size={14} aria-hidden="true" className={styles.spin} /> : <Save size={14} aria-hidden="true" />}
            {mode === 'create' ? 'Create Rule' : 'Save Changes'}
          </button>
        </footer>
      </form>
    </section>
  );
}
