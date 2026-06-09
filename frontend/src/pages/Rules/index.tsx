import { useEffect, useMemo, useState } from 'react';
import { Download, FileJson, Loader2, RefreshCcw, Upload } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { useAuthStore } from '../../store/authStore';
import { usePreferenceStore } from '../../store/preferenceStore';
import type { RulesActionFilter, RulesSeverityFilter, RulesSort } from '../../store/preferenceStore';
import { RuleCard } from './RuleCard';
import { RuleEditor } from './RuleEditor';
import type { RulePayload } from './useRules';
import { useCreateRule, useDeleteRule, useRules, useToggleRule, useUpdateRule } from './useRules';
import type { RuleItem } from './useRules';
import styles from './styles.module.css';

const SEVERITY_FILTERS: RulesSeverityFilter[] = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const ACTION_FILTERS: RulesActionFilter[] = ['ALL', 'BLOCK', 'FLAG', 'ALLOW'];
const SORT_OPTIONS: Array<{ value: RulesSort; label: string }> = [
  { value: 'name', label: 'Name' },
  { value: 'triggers', label: 'Triggers' },
  { value: 'severity', label: 'Severity' },
];

const SEVERITY_WEIGHT: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

interface ImportProgress {
  imported: number;
  total: number;
  failed: number;
  message: string;
}

function compareBySort(a: RuleItem, b: RuleItem, sort: RulesSort): number {
  if (sort === 'triggers') return b.trigger_count - a.trigger_count || a.rule_name.localeCompare(b.rule_name);
  if (sort === 'severity') {
    return (SEVERITY_WEIGHT[b.severity] ?? 0) - (SEVERITY_WEIGHT[a.severity] ?? 0) || a.rule_name.localeCompare(b.rule_name);
  }
  return a.rule_name.localeCompare(b.rule_name);
}

function validateImportRule(value: unknown): value is Partial<RulePayload> {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.rule_name === 'string' &&
    typeof item.severity === 'string' &&
    typeof item.action === 'string' &&
    typeof item.rule_type === 'string'
  );
}

function normaliseImportRule(value: Partial<RulePayload>): RulePayload {
  return {
    rule_name: String(value.rule_name ?? '').trim(),
    description: String(value.description ?? `Imported custom rule ${value.rule_name ?? ''}`).trim(),
    severity: String(value.severity ?? 'MEDIUM').toUpperCase(),
    action: String(value.action ?? 'FLAG').toUpperCase(),
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    rule_type: String(value.rule_type ?? 'KEYWORD').toUpperCase(),
    match_pattern: String(value.match_pattern ?? value.rule_name ?? '').trim(),
    match_target: String(value.match_target ?? 'RAW_SQL').toUpperCase(),
    risk_score: Number.isFinite(Number(value.risk_score)) ? Number(value.risk_score) : 50,
  };
}

function exportCustomRules(rules: RuleItem[]) {
  const customRules = rules
    .filter((rule) => !rule.is_system)
    .map((rule) => ({
      rule_name: rule.rule_name,
      description: rule.description,
      severity: rule.severity,
      action: rule.action,
      enabled: rule.enabled,
      rule_type: rule.rule_type,
      match_pattern: rule.match_pattern,
      match_target: rule.match_target,
      risk_score: rule.risk_score,
    }));
  const blob = new Blob([JSON.stringify(customRules, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'sqlwatcher-custom-rules.json';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}


function useIsNarrowScreen(query = '(max-width: 900px)'): boolean {
  const [matches, setMatches] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(query).matches));

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);

  return matches;
}

function splitRules(rules: RuleItem[]) {
  return {
    systemRules: rules.filter((rule) => rule.is_system),
    customRules: rules.filter((rule) => !rule.is_system),
  };
}

export function RulesPage() {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin';
  const rulesQuery = useRules();
  const createRule = useCreateRule();
  const updateRule = useUpdateRule();
  const toggleRule = useToggleRule();
  const deleteRule = useDeleteRule();
  const rulesSeverityFilter = usePreferenceStore((state) => state.rulesSeverityFilter);
  const rulesActionFilter = usePreferenceStore((state) => state.rulesActionFilter);
  const rulesSort = usePreferenceStore((state) => state.rulesSort);
  const setRulesSeverityFilter = usePreferenceStore((state) => state.setRulesSeverityFilter);
  const setRulesActionFilter = usePreferenceStore((state) => state.setRulesActionFilter);
  const setRulesSort = usePreferenceStore((state) => state.setRulesSort);
  const [selectedRuleId, setSelectedRuleId] = useState<number | null>(null);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('edit');
  const [importOpen, setImportOpen] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);
  const narrowScreen = useIsNarrowScreen();

  const allRules = rulesQuery.data ?? [];
  const filteredRules = useMemo(() => {
    return allRules
      .filter((rule) => rulesSeverityFilter === 'ALL' || rule.severity === rulesSeverityFilter)
      .filter((rule) => rulesActionFilter === 'ALL' || rule.action === rulesActionFilter)
      .sort((a, b) => compareBySort(a, b, rulesSort));
  }, [allRules, rulesActionFilter, rulesSeverityFilter, rulesSort]);

  const selectedRule = useMemo(() => {
    if (editorMode === 'create') return null;
    return allRules.find((rule) => rule.rule_id === selectedRuleId) ?? filteredRules[0] ?? null;
  }, [allRules, editorMode, filteredRules, selectedRuleId]);

  const { systemRules, customRules } = useMemo(() => splitRules(filteredRules), [filteredRules]);
  const visibleCustomCount = customRules.length;
  const totalCustomCount = allRules.filter((rule) => !rule.is_system).length;

  async function handleSave(payload: RulePayload, currentRule: RuleItem | null) {
    setLocalError(null);
    try {
      if (currentRule) {
        const saved = await updateRule.mutateAsync({ ruleId: currentRule.rule_id, payload });
        setSelectedRuleId(saved.rule_id);
        setEditorMode('edit');
        setMobileEditorOpen(false);
      } else {
        const saved = await createRule.mutateAsync(payload);
        setSelectedRuleId(saved.rule_id);
        setEditorMode('edit');
        setMobileEditorOpen(false);
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Unable to save rule.');
    }
  }

  async function handleDelete(rule: RuleItem) {
    if (!window.confirm(`Delete custom rule ${rule.rule_name}?`)) return;
    setLocalError(null);
    try {
      await deleteRule.mutateAsync(rule.rule_id);
      setSelectedRuleId(null);
      setEditorMode('edit');
      setMobileEditorOpen(false);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Unable to delete rule.');
    }
  }

  async function handleToggle(rule: RuleItem) {
    if (!isAdmin || rule.is_system) return;
    setLocalError(null);
    try {
      await toggleRule.mutateAsync(rule);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Unable to toggle rule.');
    }
  }

  async function importRules() {
    setImportProgress(null);
    setLocalError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(importJson);
    } catch (error) {
      setImportProgress({ imported: 0, total: 0, failed: 0, message: error instanceof Error ? error.message : 'Invalid JSON.' });
      return;
    }

    if (!Array.isArray(parsed)) {
      setImportProgress({ imported: 0, total: 0, failed: 0, message: 'Import JSON must be an array of rules.' });
      return;
    }

    const validRules = parsed.filter(validateImportRule).map(normaliseImportRule);
    if (validRules.length === 0) {
      setImportProgress({ imported: 0, total: parsed.length, failed: parsed.length, message: 'No valid rules found.' });
      return;
    }

    let imported = 0;
    let failed = parsed.length - validRules.length;
    for (const payload of validRules) {
      setImportProgress({ imported, total: validRules.length, failed, message: `${imported} of ${validRules.length} imported...` });
      try {
        await createRule.mutateAsync(payload);
        imported += 1;
      } catch {
        failed += 1;
      }
    }
    setImportProgress({ imported, total: validRules.length, failed, message: `${imported} of ${validRules.length} imported. ${failed} failed.` });
  }

  const mutationError = createRule.error ?? updateRule.error ?? toggleRule.error ?? deleteRule.error;
  const errorMessage = localError ?? (mutationError instanceof Error ? mutationError.message : null);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1>Rules</h1>
          <p>Manage SQL firewall rules, detection patterns, trigger policy, and custom analyst controls.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.secondaryButton} onClick={() => void rulesQuery.refetch()} disabled={rulesQuery.isFetching}>
            {rulesQuery.isFetching ? <Loader2 size={14} aria-hidden="true" className={styles.spin} /> : <RefreshCcw size={14} aria-hidden="true" />}
            Refresh
          </button>
          <button type="button" className={styles.secondaryButton} onClick={() => exportCustomRules(allRules)} disabled={totalCustomCount === 0}>
            <Download size={14} aria-hidden="true" />
            Export JSON
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => {
              setEditorMode('create');
              setSelectedRuleId(null);
              if (narrowScreen) setMobileEditorOpen(true);
            }}
            disabled={!isAdmin}
            title={isAdmin ? undefined : 'Only admin users can create rules.'}
          >
            <FileJson size={14} aria-hidden="true" />
            New Rule
          </button>
          <button type="button" className={styles.primaryButton} onClick={() => setImportOpen(true)} disabled={!isAdmin} title={isAdmin ? undefined : 'Only admin users can import rules.'}>
            <Upload size={14} aria-hidden="true" />
            Import JSON
          </button>
        </div>
      </header>

      {rulesQuery.error ? <div className={styles.errorBanner}>{rulesQuery.error.message}</div> : null}
      {errorMessage ? <div className={styles.errorBanner}>{errorMessage}</div> : null}

      <div className={styles.layout}>
        <aside className={styles.listPanel} aria-label="Rule list">
          <div className={styles.filterBar}>
            <label>
              <span>Severity</span>
              <select value={rulesSeverityFilter} onChange={(event) => setRulesSeverityFilter(event.target.value as RulesSeverityFilter)}>
                {SEVERITY_FILTERS.map((severity) => (
                  <option key={severity} value={severity}>
                    {severity}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Action</span>
              <select value={rulesActionFilter} onChange={(event) => setRulesActionFilter(event.target.value as RulesActionFilter)}>
                {ACTION_FILTERS.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Sort</span>
              <select value={rulesSort} onChange={(event) => setRulesSort(event.target.value as RulesSort)}>
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.listSummary}>
            <span>{filteredRules.length} visible rules</span>
            <span>{visibleCustomCount} custom</span>
          </div>

          <div className={styles.ruleList}>
            {rulesQuery.isLoading ? <div className={styles.emptyState}>Loading rules...</div> : null}
            {!rulesQuery.isLoading && filteredRules.length === 0 ? <div className={styles.emptyState}>No rules match the current filters.</div> : null}

            {systemRules.length > 0 ? <h2 className={styles.sectionHeading}>System Rules</h2> : null}
            {systemRules.map((rule) => (
              <RuleCard
                key={rule.rule_id}
                rule={rule}
                selected={editorMode === 'edit' && selectedRule?.rule_id === rule.rule_id}
                onSelect={(nextRule) => {
                  setEditorMode('edit');
                  setSelectedRuleId(nextRule.rule_id);
                  if (narrowScreen) setMobileEditorOpen(true);
                }}
                onToggle={handleToggle}
                toggleDisabled={!isAdmin || toggleRule.isPending}
              />
            ))}

            {customRules.length > 0 ? <h2 className={styles.sectionHeading}>Custom Rules</h2> : null}
            {customRules.map((rule) => (
              <RuleCard
                key={rule.rule_id}
                rule={rule}
                selected={editorMode === 'edit' && selectedRule?.rule_id === rule.rule_id}
                onSelect={(nextRule) => {
                  setEditorMode('edit');
                  setSelectedRuleId(nextRule.rule_id);
                  if (narrowScreen) setMobileEditorOpen(true);
                }}
                onToggle={handleToggle}
                toggleDisabled={!isAdmin || toggleRule.isPending}
              />
            ))}
          </div>
        </aside>

        <div className={styles.desktopEditor}>
          <RuleEditor
            selectedRule={selectedRule}
            mode={editorMode}
            isAdmin={isAdmin}
            saving={createRule.isPending || updateRule.isPending}
            deleting={deleteRule.isPending}
            error={errorMessage}
            onCreateMode={() => {
              setEditorMode('create');
              setSelectedRuleId(null);
            }}
            onSave={handleSave}
            onDelete={handleDelete}
          />
        </div>
      </div>


      <Modal open={mobileEditorOpen} onClose={() => setMobileEditorOpen(false)} title={editorMode === 'create' ? 'New Rule' : selectedRule?.rule_name ?? 'Rule Editor'} width={760}>
        <RuleEditor
          selectedRule={selectedRule}
          mode={editorMode}
          isAdmin={isAdmin}
          saving={createRule.isPending || updateRule.isPending}
          deleting={deleteRule.isPending}
          error={errorMessage}
          onCreateMode={() => {
            setEditorMode('create');
            setSelectedRuleId(null);
          }}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Custom Rules"
        width={640}
        actions={
          <>
            <button type="button" className={styles.secondaryButton} onClick={() => setImportOpen(false)}>
              Close
            </button>
            <button type="button" className={styles.primaryButton} onClick={() => void importRules()} disabled={!isAdmin || createRule.isPending}>
              {createRule.isPending ? <Loader2 size={14} aria-hidden="true" className={styles.spin} /> : <FileJson size={14} aria-hidden="true" />}
              Import
            </button>
          </>
        }
      >
        <div className={styles.importBody}>
          <p>Paste a JSON array of custom rules. Each rule must include rule_name, severity, action, and rule_type.</p>
          <textarea
            className={styles.importTextarea}
            value={importJson}
            onChange={(event) => setImportJson(event.target.value)}
            rows={12}
            spellCheck={false}
            placeholder='[{"rule_name":"BLOCK_PASSWORD_DUMP","severity":"CRITICAL","action":"BLOCK","rule_type":"REGEX","match_pattern":"password"}]'
          />
          {importProgress ? (
            <div className={styles.importProgress}>
              <strong>{importProgress.message}</strong>
              <span>
                Imported: {importProgress.imported} · Failed: {importProgress.failed}
              </span>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
